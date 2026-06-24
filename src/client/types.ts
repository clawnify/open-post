export type PostStatus = "draft" | "scheduled" | "published" | "partial" | "failed";

// Per-channel delivery state on a post's channel (Postiz-style). Present on the
// Channel objects returned inside a Post; absent in the standalone channel list.
export type DeliveryStatus = "pending" | "published" | "failed";
export type Platform = "twitter" | "linkedin" | "instagram" | "facebook" | "bluesky" | "mastodon" | "threads" | "tiktok";

export const PLATFORM_LIMITS: Record<Platform, number> = {
  twitter: 280,
  linkedin: 3000,
  instagram: 2200,
  facebook: 63206,
  bluesky: 300,
  mastodon: 500,
  threads: 500,
  tiktok: 2200,
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  twitter: "#1da1f2",
  linkedin: "#0a66c2",
  instagram: "#e4405f",
  facebook: "#1877f2",
  bluesky: "#0085ff",
  mastodon: "#6364ff",
  threads: "#000000",
  tiktok: "#00f2ea",
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  threads: "Threads",
  tiktok: "TikTok",
};

export interface Channel {
  id: number;
  name: string;
  platform: Platform;
  handle: string;
  color: string;
  created_at: string;
  // Per-channel delivery state — only populated on channels nested in a Post.
  delivery_status?: DeliveryStatus;
  delivery_ref?: string | null;
  delivery_url?: string | null;
  delivery_error?: string | null;
  delivery_published_at?: string | null;
}

export interface Label {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Media {
  id: number;
  post_id: number;
  url: string;
  type: string;
  created_at: string;
}

export interface Post {
  id: number;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  channels: Channel[];
  labels: Label[];
  media: Media[];
}

export interface Stats {
  total: number;
  scheduled: number;
  drafts: number;
  published: number;
  channels: number;
  per_channel: Array<Channel & { post_count: number }>;
  per_label: Array<Label & { post_count: number }>;
  daily: Array<{ day: string; count: number }>;
}

export type View = "dashboard" | "compose" | "calendar" | "queue" | "drafts" | "channels" | "analytics";
