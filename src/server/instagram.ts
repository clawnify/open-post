/**
 * Instagram publishing — Graph API, two-step container then publish.
 *
 * Instagram only publishes to Business/Creator accounts (linked to a Facebook
 * Page), and every post needs media — there is no text-only post. The channel
 * stores the IG Business account id in its handle; the first media item on the
 * post supplies the image.
 *
 * Requires: instagram_business_content_publish (granted through the Instagram
 * connection). Token is the page/IG access token from getToken("instagram").
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export interface InstagramResult {
  success: boolean;
  media_id?: string;
  error?: string;
}

async function graphError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    return (JSON.parse(body) as { error?: { message?: string } }).error?.message || body;
  } catch {
    return body;
  }
}

export async function postInstagram(
  token: string,
  opts: { igUserId: string; caption: string; imageUrl?: string },
): Promise<InstagramResult> {
  if (!opts.igUserId) {
    return { success: false, error: "channel is missing its Instagram account id (set it in the channel handle)" };
  }
  if (!opts.imageUrl) {
    return { success: false, error: "Instagram requires an image — add a media item to this post" };
  }

  // 1. Create a media container.
  const createUrl = new URL(`${GRAPH}/${opts.igUserId}/media`);
  createUrl.searchParams.set("image_url", opts.imageUrl);
  createUrl.searchParams.set("caption", opts.caption);
  createUrl.searchParams.set("access_token", token);
  const createRes = await fetch(createUrl, { method: "POST" });
  if (!createRes.ok) {
    return { success: false, error: `Instagram container ${createRes.status}: ${(await graphError(createRes)).slice(0, 300)}` };
  }
  const creationId = ((await createRes.json()) as { id?: string }).id;
  if (!creationId) return { success: false, error: "Instagram returned no container id" };

  // 2. Publish the container.
  const pubUrl = new URL(`${GRAPH}/${opts.igUserId}/media_publish`);
  pubUrl.searchParams.set("creation_id", creationId);
  pubUrl.searchParams.set("access_token", token);
  const pubRes = await fetch(pubUrl, { method: "POST" });
  if (!pubRes.ok) {
    return { success: false, error: `Instagram publish ${pubRes.status}: ${(await graphError(pubRes)).slice(0, 300)}` };
  }
  return { success: true, media_id: ((await pubRes.json()) as { id?: string }).id };
}
