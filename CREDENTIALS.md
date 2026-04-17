# Credential Service Binding — Integration Guide

## Architecture

```
App Worker ──(service binding RPC)──> CredentialService.getToken("twitter", orgId)
  → Check in-memory cache (5 min TTL)
  → Try vault secret: credential_{service}_{orgId} (org-level)
  → Fall back to: credential_{service}_{serverId} (server override)
  → Fetch fresh access_token from Composio
  → Cache & return
```

## Sandbox Builder Change

When `clawnify.json` contains `app.credentials`, add to the generated `wrangler.jsonc`:

```jsonc
{
  "services": [{
    "binding": "CREDENTIALS",
    "service": "clawnify-credentials",
    "entrypoint": "CredentialService"
  }],
  "vars": {
    "CLAWNIFY_ORG_ID": "<org-uuid-from-deploy-context>"
  }
}
```

In `sandbox-builder.ts` params, add:

```ts
credentials?: string[];  // from clawnify.json app.credentials
orgId?: string;          // deploying org's UUID
```

In the wrangler.jsonc generation, add after r2_buckets:

```ts
...(params.credentials?.length ? {
  services: [{
    binding: "CREDENTIALS",
    service: "clawnify-credentials",
    entrypoint: "CredentialService",
  }],
  vars: {
    CLAWNIFY_ORG_ID: params.orgId,
  },
} : {}),
```

## How the app uses it

```ts
// Production (service binding available)
const token = await c.env.CREDENTIALS.getToken("twitter", c.env.CLAWNIFY_ORG_ID);

// Local dev (falls back to .dev.vars)
// TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET,
// TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
```

## Vault secret naming

- `credential_{service}_{orgId}` — org-level (preferred for Worker apps)
- `credential_{service}_{serverId}` — server-specific override (VPS)

The credentials Worker tries org-level first, then falls back to any server in the org.
