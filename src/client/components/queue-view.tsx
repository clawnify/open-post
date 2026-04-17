import { useEffect } from "preact/hooks";
import { useApp } from "../context";
import { PostCard } from "./post-card";
import { ListOrdered } from "lucide-preact";

interface Props {
  navigate: (path: string) => void;
}

export function QueueView({ navigate }: Props) {
  const { posts, loadPosts, deletePost, publishPost } = useApp();

  useEffect(() => { loadPosts("status=scheduled"); }, []);

  const scheduled = posts
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => (a.scheduled_at! > b.scheduled_at! ? 1 : -1));

  return (
    <div class="p-6 max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <h1 class="text-xl font-semibold">Queue</h1>
          <span class="text-sm text-muted-foreground">{scheduled.length} scheduled</span>
        </div>
      </div>

      {scheduled.length === 0 ? (
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <ListOrdered size={48} class="text-muted-foreground/40 mb-4" />
          <h3 class="text-lg font-semibold mb-1">Queue is empty</h3>
          <p class="text-muted-foreground mb-4">Schedule posts from the composer to see them here</p>
          <button
            class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={() => navigate("/compose")}
          >
            Compose
          </button>
        </div>
      ) : (
        <div class="space-y-3">
          {scheduled.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onEdit={(id) => navigate(`/compose/${id}`)}
              onDelete={deletePost}
              onPublish={publishPost}
            />
          ))}
        </div>
      )}
    </div>
  );
}
