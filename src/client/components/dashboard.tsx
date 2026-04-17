import { useEffect } from "preact/hooks";
import { FileText, ListOrdered, Send, Radio } from "lucide-preact";
import { useApp } from "../context";
import { PostCard } from "./post-card";

interface Props {
  navigate: (path: string) => void;
}

export function Dashboard({ navigate }: Props) {
  const { posts, stats, loadStats, deletePost } = useApp();

  useEffect(() => { loadStats(); }, []);

  const upcoming = posts
    .filter((p) => p.status === "scheduled" && p.scheduled_at)
    .sort((a, b) => (a.scheduled_at! > b.scheduled_at! ? 1 : -1))
    .slice(0, 5);

  const recentDrafts = posts
    .filter((p) => p.status === "draft")
    .slice(0, 3);

  return (
    <div class="p-6 max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold">Dashboard</h1>
        <button
          class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          onClick={() => navigate("/compose")}
        >
          New Post
        </button>
      </div>

      {/* Stats */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { icon: FileText, value: stats?.drafts ?? 0, label: "Drafts" },
          { icon: ListOrdered, value: stats?.scheduled ?? 0, label: "Scheduled" },
          { icon: Send, value: stats?.published ?? 0, label: "Published" },
          { icon: Radio, value: stats?.channels ?? 0, label: "Channels" },
        ].map(({ icon: Icon, value, label }) => (
          <div key={label} class="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <div class="p-2 bg-muted rounded-md">
              <Icon size={18} class="text-muted-foreground" />
            </div>
            <div>
              <div class="text-2xl font-semibold">{value}</div>
              <div class="text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section class="mb-8">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-semibold">Upcoming</h2>
            <button
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => navigate("/queue")}
            >
              View all
            </button>
          </div>
          <div class="space-y-3">
            {upcoming.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                onEdit={(id) => navigate(`/compose/${id}`)}
                onDelete={deletePost}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Drafts */}
      {recentDrafts.length > 0 && (
        <section class="mb-8">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-semibold">Recent Drafts</h2>
            <button
              class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => navigate("/drafts")}
            >
              View all
            </button>
          </div>
          <div class="space-y-3">
            {recentDrafts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                onEdit={(id) => navigate(`/compose/${id}`)}
                onDelete={deletePost}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {posts.length === 0 && (
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <Send size={48} class="text-muted-foreground/40 mb-4" />
          <h3 class="text-lg font-semibold mb-1">No posts yet</h3>
          <p class="text-muted-foreground mb-4">Create your first post to get started</p>
          <button
            class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={() => navigate("/compose")}
          >
            Create Post
          </button>
        </div>
      )}
    </div>
  );
}
