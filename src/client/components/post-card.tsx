import { Clock, Edit2, Trash2, Send } from "lucide-preact";
import type { Post } from "../types";
import { PLATFORM_LABELS } from "../types";

interface Props {
  post: Post;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onPublish?: (id: number) => void;
}

function formatDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d + (d.includes("T") ? "" : "T00:00:00"));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-50 text-blue-700",
  published: "bg-green-50 text-green-700",
};

export function PostCard({ post, onEdit, onDelete, onPublish }: Props) {
  const preview = post.content.length > 140 ? post.content.slice(0, 140) + "..." : post.content;

  return (
    <div class="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
      <p class="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
        {preview || "(empty)"}
      </p>

      {post.channels.length > 0 && (
        <div class="flex flex-wrap gap-1.5 mt-3">
          {post.channels.map((ch) => (
            <span
              key={ch.id}
              class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ background: ch.color }}
            >
              {PLATFORM_LABELS[ch.platform] || ch.platform}
            </span>
          ))}
        </div>
      )}

      {post.labels.length > 0 && (
        <div class="flex flex-wrap gap-1.5 mt-2">
          {post.labels.map((l) => (
            <span
              key={l.id}
              class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ borderColor: l.color, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      <div class="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div class="flex items-center gap-2">
          <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[post.status] || ""}`}>
            {post.status}
          </span>
          {post.scheduled_at && (
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock size={12} /> {formatDate(post.scheduled_at)}
            </span>
          )}
        </div>
        <div class="flex items-center gap-1">
          {onPublish && post.status === "scheduled" && (
            <button
              onClick={() => onPublish(post.id)}
              class="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Publish now"
            >
              <Send size={14} />
            </button>
          )}
          <button
            onClick={() => onEdit(post.id)}
            class="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Edit"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => onDelete(post.id)}
            class="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-destructive transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
