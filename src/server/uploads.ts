// Thin R2 wrapper for uploaded post images. The bucket is bound as `UPLOADS`
// when clawnify.json declares `app.storage: true`.

let _bucket: R2Bucket | null = null;

export function initUploads(bucket: R2Bucket | undefined) {
  _bucket = bucket ?? null;
}

export function uploadsEnabled(): boolean {
  return _bucket !== null;
}

export async function putUpload(
  key: string,
  data: ArrayBuffer | Uint8Array | ReadableStream,
  contentType: string,
): Promise<void> {
  if (!_bucket) throw new Error("uploads not configured");
  await _bucket.put(key, data, { httpMetadata: { contentType } });
}

export async function getUpload(
  key: string,
): Promise<{ data: ReadableStream; contentType: string } | null> {
  if (!_bucket) return null;
  const obj = await _bucket.get(key);
  if (!obj) return null;
  return {
    data: obj.body,
    contentType: obj.httpMetadata?.contentType || "application/octet-stream",
  };
}

// Collision-resistant, URL-safe, single-segment key (no '/') derived from the
// original filename. The random prefix keeps the public URL unguessable.
export function makeKey(filename: string): string {
  const clean = (filename || "image")
    .toLowerCase()
    .replace(/[^a-z0-9.\-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "image";
  return `${crypto.randomUUID().slice(0, 8)}-${clean}`;
}
