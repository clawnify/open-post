/**
 * LinkedIn publishing — OAuth 2.0 bearer (Composio / Clawnify).
 *
 * Personal profile and company pages share the Posts API; only the `author`
 * URN differs. For a personal post we resolve the member URN from /v2/userinfo
 * (OpenID `sub`); for a page the channel stores `urn:li:organization:<id>` in
 * its handle.
 *
 * Requires scopes: openid, profile, w_member_social (personal) and
 * w_organization_social (pages) — granted through the LinkedIn connection.
 */

const POSTS_URL = "https://api.linkedin.com/rest/posts";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
// LinkedIn requires a dated version header on the versioned (/rest) APIs.
const LINKEDIN_VERSION = "202401";

export interface LinkedInResult {
  success: boolean;
  post_urn?: string;
  error?: string;
}

async function resolveAuthorUrn(token: string, handle: string | undefined): Promise<string> {
  if (handle && handle.startsWith("urn:li:organization:")) return handle;
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`userinfo ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = (await res.json()) as { sub?: string };
  if (!data.sub) throw new Error("userinfo returned no member id");
  return `urn:li:person:${data.sub}`;
}

export async function postLinkedIn(
  token: string,
  text: string,
  handle?: string,
): Promise<LinkedInResult> {
  let author: string;
  try {
    author = await resolveAuthorUrn(token, handle);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "could not resolve author" };
  }

  const res = await fetch(POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body;
    try {
      detail = (JSON.parse(body) as { message?: string }).message || body;
    } catch {}
    return { success: false, error: `LinkedIn API ${res.status}: ${detail.slice(0, 300)}` };
  }

  // The created post URN comes back in a response header, not the body.
  return { success: true, post_urn: res.headers.get("x-restli-id") ?? undefined };
}
