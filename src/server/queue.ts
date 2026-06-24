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
 * queue. Deliveries are signed with the platform's ECDSA P-256 (ES256) key; we
 * verify with the public key from /.well-known/jwks.json — no shared secret, so
 * nothing breaks on token rotation. The signed message is `${timestamp}.${body}`
 * (Stripe-style); stale deliveries are rejected by the timestamp.
 *
 * ES256 (not Ed25519) because workerd verifies it reliably — the same path
 * app-router uses for Supabase JWT/JWKS validation.
 *
 * (Mirrors `verifyDelivery` from @clawnify/queue; inlined until that package
 * is published.)
 */
const JWKS_URL = "https://services.clawnify.com/.well-known/jwks.json";

type EcJwk = { kty: string; crv: string; x: string; y: string; kid?: string };

// Platform public verification keys, kid -> EC public JWK. Embedded so
// verification needs no network on the hot path; JWKS is consulted only for an
// unknown kid (key rotation).
const KNOWN_KEYS: Record<string, EcJwk> = {
  "queue-sig-1": {
    kty: "EC",
    crv: "P-256",
    x: "TjRZVA0w0Gkn1MJI9Mh8L2UWf9S6ACYj7rgyaJa9yfM",
    y: "Uc6qqZ5xnnTD0wbSKFdGmXF83MA4_qPqi5zZJvmzpcg",
  },
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function publicJwk(keyId?: string | null): Promise<EcJwk | null> {
  if (keyId && KNOWN_KEYS[keyId]) return KNOWN_KEYS[keyId];
  try {
    const res = await fetch(JWKS_URL);
    if (res.ok) {
      const { keys } = (await res.json()) as { keys: EcJwk[] };
      const jwk = keys.find((k) => k.kid === keyId) ?? keys[0];
      if (jwk?.x && jwk?.y) return jwk;
    }
  } catch {
    // fall through to the embedded key
  }
  return Object.values(KNOWN_KEYS)[0] ?? null;
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
    const jwk = await publicJwk(keyId);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const msg = new TextEncoder().encode(`${ts}.${rawBody}`);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64ToBytes(signature) as BufferSource,
      msg as BufferSource,
    );
  } catch {
    return false;
  }
}

// TEMPORARY diagnostic — surfaces exactly why a delivery fails verification.
// Remove once the queue path is confirmed working.
export async function verifyDeliveryDebug(
  rawBody: string,
  headers: { signature?: string | null; timestamp?: string | null; keyId?: string | null },
  toleranceSec = 300,
): Promise<{ ok: boolean; reason: string }> {
  const { signature, timestamp, keyId } = headers;
  if (!signature) return { ok: false, reason: "no signature header" };
  if (!timestamp) return { ok: false, reason: "no timestamp header" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "ts not finite" };
  const skew = Math.round(Date.now() / 1000 - ts);
  if (Math.abs(skew) > toleranceSec) return { ok: false, reason: `stale skew=${skew}s` };
  try {
    const jwk = await publicJwk(keyId);
    if (!jwk) return { ok: false, reason: "no jwk resolved" };
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const msg = new TextEncoder().encode(`${ts}.${rawBody}`);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64ToBytes(signature) as BufferSource,
      msg as BufferSource,
    );
    return { ok, reason: ok ? "ok" : `verify=false (rawLen=${rawBody.length}, kid=${jwk.kty}/${jwk.crv})` };
  } catch (e) {
    return { ok: false, reason: "threw: " + ((e as Error)?.message || String(e)) };
  }
}
