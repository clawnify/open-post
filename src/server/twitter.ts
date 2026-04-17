/**
 * Twitter/X API v2 client.
 *
 * Two auth modes:
 *   1. OAuth 2.0 Bearer token (Composio / Clawnify production) — just an access_token
 *   2. OAuth 1.0a (local dev with developer app keys) — 4 credentials + HMAC-SHA1 signing
 */

const TWEET_URL = "https://api.x.com/2/tweets";

// ── Types ──

export interface TweetResult {
  success: boolean;
  tweet_id?: string;
  error?: string;
}

// ── OAuth 2.0 Bearer (simple path — Composio) ──

export async function postTweetBearer(
  accessToken: string,
  text: string,
): Promise<TweetResult> {
  const res = await fetch(TWEET_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  return parseTweetResponse(res);
}

// ── OAuth 1.0a (local dev path) ──

export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export async function postTweetOAuth1(
  creds: OAuth1Credentials,
  text: string,
): Promise<TweetResult> {
  const authHeader = await buildOAuth1Header("POST", TWEET_URL, creds);

  const res = await fetch(TWEET_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  return parseTweetResponse(res);
}

// ── Shared ──

async function parseTweetResponse(res: Response): Promise<TweetResult> {
  if (!res.ok) {
    const body = await res.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.detail || parsed.errors?.[0]?.message || parsed.title || body;
    } catch {}
    return { success: false, error: `X API ${res.status}: ${detail}` };
  }

  const data = (await res.json()) as { data?: { id: string } };
  return { success: true, tweet_id: data.data?.id };
}

// ── OAuth 1.0a internals (Web Crypto, Workers-compatible) ──

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildOAuth1Header(
  method: string,
  url: string,
  creds: OAuth1Credentials,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const paramStr = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramStr)}`;
  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.accessTokenSecret)}`;

  const signature = await hmacSha1(signingKey, baseString);
  oauthParams.oauth_signature = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}
