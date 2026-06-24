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
        target_url: `${opts.origin}/api/internal/publish`,
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
 * Verify an /api/internal/publish delivery is genuinely from the Clawnify
 * queue. Deliveries are signed with the platform's Ed25519 key; we verify with
 * the public key from /.well-known/jwks.json — no shared secret, so nothing
 * breaks on token rotation. The signed message is `${timestamp}.${rawBody}`
 * (Stripe-style); stale deliveries are rejected by the timestamp.
 *
 * (Mirrors `verifyDelivery` from @clawnify/queue; inlined until that package
 * is published.)
 */
const JWKS_URL = "https://services.clawnify.com/.well-known/jwks.json";
let jwksCache: { keys: Array<{ kty: string; crv: string; x: string; kid: string }> } | null = null;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifyDelivery(
  rawBody: string,
  headers: { signature?: string | null; timestamp?: string | null; keyId?: string | null },
  toleranceSec = 300,
): Promise<boolean> {
  const { signature, timestamp, keyId } = headers;
  if (!signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;

  try {
    if (!jwksCache) {
      const res = await fetch(JWKS_URL);
      if (!res.ok) return false;
      jwksCache = (await res.json()) as typeof jwksCache;
    }
    const jwk = jwksCache!.keys.find((k) => !keyId || k.kid === keyId) ?? jwksCache!.keys[0];
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
    const msg = new TextEncoder().encode(`${ts}.${rawBody}`);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      b64ToBytes(signature) as BufferSource,
      msg as BufferSource,
    );
  } catch {
    return false;
  }
}
