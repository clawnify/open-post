import { Hono } from "hono";
import { initDB, query, get, run } from "./db";
import { initCredentials, getTwitterAuth } from "./credentials";
import type { CredentialServiceBinding } from "./credentials";
import { postTweetBearer, postTweetOAuth1 } from "./twitter";

type Env = {
  Bindings: {
    DB: D1Database;
    // Service binding (production — injected by Clawnify builder)
    CREDENTIALS?: CredentialServiceBinding;
    // App owner's org ID (injected by builder as env var)
    CLAWNIFY_ORG_ID?: string;
    // Local dev fallback (.dev.vars)
    TWITTER_BEARER_TOKEN?: string;
    TWITTER_CONSUMER_KEY?: string;
    TWITTER_CONSUMER_SECRET?: string;
    TWITTER_ACCESS_TOKEN?: string;
    TWITTER_ACCESS_TOKEN_SECRET?: string;
  };
};

const app = new Hono<Env>();

app.use("*", async (c, next) => {
  initDB(c.env.DB);
  initCredentials({
    env: c.env as unknown as Record<string, string>,
    credentialService: c.env.CREDENTIALS,
    orgId: c.env.CLAWNIFY_ORG_ID,
  });
  await next();
});

// ── Channels ──

app.get("/api/channels", async (c) => {
  const rows = await query("SELECT * FROM channels ORDER BY created_at DESC");
  return c.json(rows);
});

app.post("/api/channels", async (c) => {
  const { name, platform, handle, color } = await c.req.json<{
    name: string; platform?: string; handle?: string; color?: string;
  }>();
  if (!name?.trim()) return c.json({ error: "Name required" }, 400);
  const result = await run(
    "INSERT INTO channels (name, platform, handle, color) VALUES (?, ?, ?, ?)",
    [name.trim(), platform || "twitter", handle || "", color || "#1da1f2"]
  );
  const row = await get("SELECT * FROM channels WHERE id = ?", [result.lastInsertRowid]);
  return c.json(row, 201);
});

app.put("/api/channels/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const { name, platform, handle, color } = await c.req.json<{
    name?: string; platform?: string; handle?: string; color?: string;
  }>();
  const existing = await get("SELECT * FROM channels WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await run(
    "UPDATE channels SET name = ?, platform = ?, handle = ?, color = ? WHERE id = ?",
    [
      name ?? (existing as any).name,
      platform ?? (existing as any).platform,
      handle ?? (existing as any).handle,
      color ?? (existing as any).color,
      id,
    ]
  );
  const row = await get("SELECT * FROM channels WHERE id = ?", [id]);
  return c.json(row);
});

app.delete("/api/channels/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run("DELETE FROM channels WHERE id = ?", [id]);
  return c.json({ ok: true });
});

// ── Labels ──

app.get("/api/labels", async (c) => {
  const rows = await query("SELECT * FROM labels ORDER BY name ASC");
  return c.json(rows);
});

app.post("/api/labels", async (c) => {
  const { name, color } = await c.req.json<{ name: string; color?: string }>();
  if (!name?.trim()) return c.json({ error: "Name required" }, 400);
  const result = await run(
    "INSERT INTO labels (name, color) VALUES (?, ?)",
    [name.trim(), color || "#6b7280"]
  );
  const row = await get("SELECT * FROM labels WHERE id = ?", [result.lastInsertRowid]);
  return c.json(row, 201);
});

app.put("/api/labels/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const { name, color } = await c.req.json<{ name?: string; color?: string }>();
  const existing = await get("SELECT * FROM labels WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await run(
    "UPDATE labels SET name = ?, color = ? WHERE id = ?",
    [name ?? (existing as any).name, color ?? (existing as any).color, id]
  );
  const row = await get("SELECT * FROM labels WHERE id = ?", [id]);
  return c.json(row);
});

app.delete("/api/labels/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run("DELETE FROM labels WHERE id = ?", [id]);
  return c.json({ ok: true });
});

// ── Posts ──

async function enrichPost(post: any) {
  const channels = await query(
    `SELECT c.* FROM channels c
     JOIN post_channels pc ON pc.channel_id = c.id
     WHERE pc.post_id = ?`,
    [post.id]
  );
  const labels = await query(
    `SELECT l.* FROM labels l
     JOIN post_labels pl ON pl.label_id = l.id
     WHERE pl.post_id = ?`,
    [post.id]
  );
  const mediaItems = await query(
    "SELECT * FROM media WHERE post_id = ? ORDER BY id ASC",
    [post.id]
  );
  return { ...post, channels, labels, media: mediaItems };
}

app.get("/api/posts", async (c) => {
  const status = c.req.query("status");
  const channelId = c.req.query("channel_id");
  const from = c.req.query("from");
  const to = c.req.query("to");

  let sql = "SELECT * FROM posts";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (channelId) {
    conditions.push("id IN (SELECT post_id FROM post_channels WHERE channel_id = ?)");
    params.push(Number(channelId));
  }
  if (from) {
    conditions.push("scheduled_at >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("scheduled_at <= ?");
    params.push(to);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY COALESCE(scheduled_at, created_at) DESC";

  const rows = await query(sql, params);
  const enriched = await Promise.all(rows.map(enrichPost));
  return c.json(enriched);
});

app.get("/api/posts/calendar", async (c) => {
  const month = c.req.query("month"); // YYYY-MM
  if (!month) return c.json({ error: "month param required (YYYY-MM)" }, 400);

  const from = `${month}-01T00:00:00`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}T23:59:59`;

  const rows = await query(
    "SELECT * FROM posts WHERE scheduled_at >= ? AND scheduled_at <= ? ORDER BY scheduled_at ASC",
    [from, to]
  );
  const enriched = await Promise.all(rows.map(enrichPost));

  const grouped: Record<string, any[]> = {};
  for (const post of enriched) {
    const day = (post as any).scheduled_at?.slice(0, 10) || "unscheduled";
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(post);
  }
  return c.json(grouped);
});

app.get("/api/posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const post = await get("SELECT * FROM posts WHERE id = ?", [id]);
  if (!post) return c.json({ error: "Not found" }, 404);
  return c.json(await enrichPost(post));
});

app.post("/api/posts", async (c) => {
  const { content, status, scheduled_at, channel_ids, label_ids, media_urls } = await c.req.json<{
    content: string;
    status?: string;
    scheduled_at?: string;
    channel_ids?: number[];
    label_ids?: number[];
    media_urls?: string[];
  }>();

  const postStatus = status || (scheduled_at ? "scheduled" : "draft");
  const result = await run(
    "INSERT INTO posts (content, status, scheduled_at) VALUES (?, ?, ?)",
    [content || "", postStatus, scheduled_at || null]
  );
  const postId = result.lastInsertRowid;

  if (channel_ids?.length) {
    for (const cid of channel_ids) {
      await run("INSERT INTO post_channels (post_id, channel_id) VALUES (?, ?)", [postId, cid]);
    }
  }
  if (label_ids?.length) {
    for (const lid of label_ids) {
      await run("INSERT INTO post_labels (post_id, label_id) VALUES (?, ?)", [postId, lid]);
    }
  }
  if (media_urls?.length) {
    for (const url of media_urls) {
      await run("INSERT INTO media (post_id, url) VALUES (?, ?)", [postId, url]);
    }
  }

  const post = await get("SELECT * FROM posts WHERE id = ?", [postId]);
  return c.json(await enrichPost(post), 201);
});

app.put("/api/posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await get("SELECT * FROM posts WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const { content, status, scheduled_at, channel_ids, label_ids, media_urls } = await c.req.json<{
    content?: string;
    status?: string;
    scheduled_at?: string | null;
    channel_ids?: number[];
    label_ids?: number[];
    media_urls?: string[];
  }>();

  await run(
    "UPDATE posts SET content = ?, status = ?, scheduled_at = ?, updated_at = datetime('now') WHERE id = ?",
    [
      content ?? (existing as any).content,
      status ?? (existing as any).status,
      scheduled_at !== undefined ? scheduled_at : (existing as any).scheduled_at,
      id,
    ]
  );

  if (channel_ids !== undefined) {
    await run("DELETE FROM post_channels WHERE post_id = ?", [id]);
    for (const cid of channel_ids) {
      await run("INSERT INTO post_channels (post_id, channel_id) VALUES (?, ?)", [id, cid]);
    }
  }
  if (label_ids !== undefined) {
    await run("DELETE FROM post_labels WHERE post_id = ?", [id]);
    for (const lid of label_ids) {
      await run("INSERT INTO post_labels (post_id, label_id) VALUES (?, ?)", [id, lid]);
    }
  }
  if (media_urls !== undefined) {
    await run("DELETE FROM media WHERE post_id = ?", [id]);
    for (const url of media_urls) {
      await run("INSERT INTO media (post_id, url) VALUES (?, ?)", [id, url]);
    }
  }

  const post = await get("SELECT * FROM posts WHERE id = ?", [id]);
  return c.json(await enrichPost(post));
});

app.delete("/api/posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run("DELETE FROM posts WHERE id = ?", [id]);
  return c.json({ ok: true });
});

// ── Publish ──

app.post("/api/posts/:id/publish", async (c) => {
  const id = Number(c.req.param("id"));
  const post = await get<any>("SELECT * FROM posts WHERE id = ?", [id]);
  if (!post) return c.json({ error: "Post not found" }, 404);
  if (!post.content?.trim()) return c.json({ error: "Post has no content" }, 400);

  // Get channels for this post
  const channels = await query<any>(
    `SELECT c.* FROM channels c
     JOIN post_channels pc ON pc.channel_id = c.id
     WHERE pc.post_id = ?`,
    [id]
  );

  if (channels.length === 0) return c.json({ error: "No channels assigned to this post" }, 400);

  const results: Array<{ channel: string; platform: string; success: boolean; error?: string; tweet_id?: string }> = [];

  for (const channel of channels) {
    if (channel.platform === "twitter") {
      const auth = await getTwitterAuth();
      if (!auth) {
        results.push({ channel: channel.name, platform: "twitter", success: false, error: "No Twitter credentials configured. Add keys to .dev.vars or connect via Clawnify." });
        continue;
      }
      const result = auth.mode === "bearer"
        ? await postTweetBearer(auth.accessToken, post.content)
        : await postTweetOAuth1(auth, post.content);
      results.push({ channel: channel.name, platform: "twitter", success: result.success, error: result.error, tweet_id: result.tweet_id });
    } else {
      results.push({ channel: channel.name, platform: channel.platform, success: false, error: `Publishing to ${channel.platform} not yet supported` });
    }
  }

  const allSuccess = results.every((r) => r.success);
  const anySuccess = results.some((r) => r.success);

  if (anySuccess) {
    await run(
      "UPDATE posts SET status = 'published', published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      [id]
    );
  }

  return c.json({ published: anySuccess, results });
});

// ── Stats ──

app.get("/api/stats", async (c) => {
  const totalPosts = await get<{ count: number }>("SELECT COUNT(*) as count FROM posts");
  const scheduled = await get<{ count: number }>("SELECT COUNT(*) as count FROM posts WHERE status = 'scheduled'");
  const drafts = await get<{ count: number }>("SELECT COUNT(*) as count FROM posts WHERE status = 'draft'");
  const published = await get<{ count: number }>("SELECT COUNT(*) as count FROM posts WHERE status = 'published'");
  const channels = await get<{ count: number }>("SELECT COUNT(*) as count FROM channels");

  const perChannel = await query(
    `SELECT c.id, c.name, c.platform, c.color, COUNT(pc.post_id) as post_count
     FROM channels c
     LEFT JOIN post_channels pc ON pc.channel_id = c.id
     GROUP BY c.id ORDER BY post_count DESC`
  );

  const perLabel = await query(
    `SELECT l.id, l.name, l.color, COUNT(pl.post_id) as post_count
     FROM labels l
     LEFT JOIN post_labels pl ON pl.label_id = l.id
     GROUP BY l.id ORDER BY post_count DESC`
  );

  // Posts per day for the last 30 days
  const daily = await query(
    `SELECT date(scheduled_at) as day, COUNT(*) as count
     FROM posts
     WHERE scheduled_at >= datetime('now', '-30 days')
     GROUP BY day ORDER BY day ASC`
  );

  return c.json({
    total: totalPosts?.count || 0,
    scheduled: scheduled?.count || 0,
    drafts: drafts?.count || 0,
    published: published?.count || 0,
    channels: channels?.count || 0,
    per_channel: perChannel,
    per_label: perLabel,
    daily,
  });
});

export default app;
