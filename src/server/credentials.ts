/**
 * Credential adapter — same pattern as db.ts and uploads.ts.
 *
 * Production (Clawnify):
 *   App calls env.CREDENTIALS.getToken("twitter", orgId) via service binding.
 *   The credential Worker fetches a fresh token from Composio.
 *
 * Local dev:
 *   Falls back to env vars (.dev.vars) or channel api_key from DB.
 *   No service binding available locally.
 */

// ── Service binding interface ──

export interface CredentialServiceBinding {
  getToken(service: string, orgId: string): Promise<string | null>;
  listConnected(orgId: string): Promise<string[]>;
}

// ── State ──

let _env: Record<string, string> = {};
let _credentialService: CredentialServiceBinding | null = null;
let _orgId: string | null = null;

export function initCredentials(opts: {
  env: Record<string, string>;
  credentialService?: CredentialServiceBinding;
  orgId?: string;
}) {
  _env = opts.env;
  _credentialService = opts.credentialService ?? null;
  _orgId = opts.orgId ?? null;
}

function getEnv(key: string): string | null {
  return _env[key] || null;
}

// ── Generic getToken ──

/**
 * Get a fresh access token for a service.
 * Uses service binding in production, env vars locally.
 */
export async function getToken(service: string): Promise<string | null> {
  // Production: service binding
  if (_credentialService && _orgId) {
    return _credentialService.getToken(service, _orgId);
  }

  // Local fallback: env var
  const envKey = `${service.toUpperCase()}_BEARER_TOKEN`;
  const bearer = getEnv(envKey);
  if (bearer) return bearer;

  return null;
}

// ── Twitter-specific (supports both Bearer and OAuth 1.0a locally) ──

export type TwitterAuth =
  | { mode: "bearer"; accessToken: string }
  | { mode: "oauth1"; consumerKey: string; consumerSecret: string; accessToken: string; accessTokenSecret: string };

export async function getTwitterAuth(): Promise<TwitterAuth | null> {
  // Production: service binding → always Bearer
  if (_credentialService && _orgId) {
    const token = await _credentialService.getToken("twitter", _orgId);
    if (token) return { mode: "bearer", accessToken: token };
  }

  // Local dev: OAuth 1.0a keys from .dev.vars
  const ck = getEnv("TWITTER_CONSUMER_KEY");
  const cs = getEnv("TWITTER_CONSUMER_SECRET");
  const at = getEnv("TWITTER_ACCESS_TOKEN");
  const ats = getEnv("TWITTER_ACCESS_TOKEN_SECRET");
  if (ck && cs && at && ats) {
    return { mode: "oauth1", consumerKey: ck, consumerSecret: cs, accessToken: at, accessTokenSecret: ats };
  }

  return null;
}
