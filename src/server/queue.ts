/**
 * Scheduling adapter — talks to the Clawnify managed queue service
 * (services.clawnify.com/queue). Same role as db.ts / credentials.ts: a thin
 * local seam over a platform primitive.
 *
 * Production: env.CLAWNIFY_TOKEN is injected by the Clawnify builder. We POST a
 * deferred job that calls this app's own /internal/publish at the scheduled
 * time; the queue handles the clock, retries and at-least-once delivery.
 *
 * Local dev: no CLAWNIFY_TOKEN → scheduling is a no-op (scheduled posts simply
 * wait to be published manually). The whole module degrades gracefully.
 *
 * Swap for the `@clawnify/queue` package once it's published to npm.
 */

const QUEUE_URL = "https://services.clawnify.com/queue";

/**
 * Schedule a delivery to this app's own /internal/publish endpoint.
 * Returns the job id (to store for later cancel/reschedule), or null if
 * scheduling is unavailable (local dev) or the service rejected the request.
 */
export async function scheduleDelivery(opts: {
  token: string;
  origin: string;
  postId: number;
  runAt: string; // ISO-8601
}): Promise<string | null> {
  const runAtMs = Date.parse(opts.runAt);
  try {
    const res = await fetch(`${QUEUE_URL}/enqueue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_url: `${opts.origin}/internal/publish`,
        payload: { post_id: opts.postId },
        run_at: new Date(runAtMs).toISOString(),
        // Reschedule to a new time = new key = new job; a retried identical
        // submit dedupes to the same job.
        idempotency_key: `post:${opts.postId}:${runAtMs}`,
      }),
    });
    if (!res.ok) {
      console.error("queue enqueue failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const body = (await res.json()) as { job_id?: string };
    return body.job_id ?? null;
  } catch (err) {
    console.error("queue enqueue threw:", err);
    return null;
  }
}

/** Cancel a previously scheduled job (best effort). */
export async function cancelDelivery(token: string, jobId: string): Promise<void> {
  try {
    await fetch(`${QUEUE_URL}/jobs/${jobId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("queue cancel threw:", err);
  }
}

/**
 * Verify an /internal/publish delivery is genuinely from the Clawnify queue:
 * HMAC-SHA256 of the raw body, keyed by this org's CLAWNIFY_TOKEN, in the
 * `X-Clawnify-Signature: sha256=<hex>` header.
 */
export async function verifyDeliverySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  token: string | undefined,
): Promise<boolean> {
  if (!signatureHeader || !token) return false;
  const expected = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actual = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
