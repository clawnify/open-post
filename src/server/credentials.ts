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

export interface ExecResult {
  data: unknown;
  error: string | null;
  successful: boolean;
}

export interface CredentialServiceBinding {
  getToken(service: string, orgId: string): Promise<string | null>;
  listConnected(orgId: string): Promise<string[]>;
  executeTool(
    service: string,
    toolSlug: string,
    args: Record<string, unknown>,
    orgId: string,
  ): Promise<ExecResult>;
}

// ── State ──

let _credentialService: CredentialServiceBinding | null = null;
let _orgId: string | null = null;

export function initCredentials(opts: {
  env: Record<string, string>;
  credentialService?: CredentialServiceBinding;
  orgId?: string;
}) {
  _credentialService = opts.credentialService ?? null;
  _orgId = opts.orgId ?? null;
}

// ── Composio execute ──
//
// Since the May 2026 Composio security incident, the "get connected account"
// API permanently redacts raw OAuth tokens, so getToken() can't return a usable
// token for Composio connections. Posting must go through Composio's execute
// path (Composio holds the real token server-side). Returns null off-platform
// (no service binding) so callers degrade gracefully.
export async function executeTool(
  service: string,
  toolSlug: string,
  args: Record<string, unknown>,
): Promise<ExecResult | null> {
  if (_credentialService && _orgId) {
    return _credentialService.executeTool(service, toolSlug, args, _orgId);
  }
  return null;
}
