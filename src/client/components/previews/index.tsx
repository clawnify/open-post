import type { Channel } from "../../types";
import { LinkedInPreview } from "./linkedin-preview";

// Platforms that have a native-looking preview today. Instagram and X slot in
// here as their preview components land.
const PREVIEW_PLATFORMS = new Set(["linkedin"]);

export function hasPreview(platform: string): boolean {
  return PREVIEW_PLATFORMS.has(platform);
}

interface Props {
  channel: Channel;
  content: string;
  imageUrl?: string;
  timeLabel?: string;
}

// Renders the post as it will appear on the channel's platform. Returns null for
// platforms without a preview yet (caller should gate on hasPreview()).
export function PostPreview({ channel, content, imageUrl, timeLabel }: Props) {
  switch (channel.platform) {
    case "linkedin":
      return (
        <LinkedInPreview
          authorName={channel.name}
          authorHeadline={channel.handle || undefined}
          content={content}
          imageUrl={imageUrl}
          timeLabel={timeLabel}
        />
      );
    default:
      return null;
  }
}
