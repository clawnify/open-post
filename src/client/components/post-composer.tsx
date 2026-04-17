import { useState, useEffect, useMemo } from "preact/hooks";
import { Send, Save, ArrowLeft, Image, X } from "lucide-preact";
import { useApp } from "../context";
import { PLATFORM_LIMITS, PLATFORM_LABELS } from "../types";
import type { Platform } from "../types";

interface Props {
  editId: number | null;
  navigate: (path: string) => void;
}

export function PostComposer({ editId, navigate }: Props) {
  const { channels, labels, posts, createPost, updatePost } = useApp();

  const existing = editId ? posts.find((p) => p.id === editId) : null;

  const [content, setContent] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<number[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<number[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setContent(existing.content);
      setSelectedChannels(existing.channels.map((c) => c.id));
      setSelectedLabels(existing.labels.map((l) => l.id));
      setScheduledAt(existing.scheduled_at ? existing.scheduled_at.slice(0, 16) : "");
      setMediaUrls(existing.media.map((m) => m.url));
    }
  }, [existing?.id]);

  const charLimit = useMemo(() => {
    if (selectedChannels.length === 0) return null;
    const selected = channels.filter((c) => selectedChannels.includes(c.id));
    const limits = selected.map((c) => PLATFORM_LIMITS[c.platform as Platform] || 10000);
    return Math.min(...limits);
  }, [selectedChannels, channels]);

  const overLimit = charLimit !== null && content.length > charLimit;

  const toggleChannel = (id: number) => {
    setSelectedChannels((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleLabel = (id: number) => {
    setSelectedLabels((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addMedia = () => {
    if (newMediaUrl.trim()) {
      setMediaUrls((prev) => [...prev, newMediaUrl.trim()]);
      setNewMediaUrl("");
    }
  };

  const removeMedia = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (status: string) => {
    if (overLimit) return;
    setSaving(true);
    const data = {
      content,
      status,
      scheduled_at: scheduledAt ? scheduledAt + ":00" : undefined,
      channel_ids: selectedChannels,
      label_ids: selectedLabels,
      media_urls: mediaUrls,
    };
    if (editId) {
      await updatePost(editId, data);
    } else {
      await createPost(data);
    }
    setSaving(false);
    navigate(status === "draft" ? "/drafts" : "/queue");
  };

  return (
    <div class="p-6 max-w-6xl mx-auto">
      <div class="flex items-center gap-3 mb-6">
        <button
          class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 class="text-xl font-semibold">{editId ? "Edit Post" : "New Post"}</h1>
      </div>

      <div class="flex gap-6">
        {/* Main editor */}
        <div class="flex-1 space-y-4">
          <div class="relative">
            <textarea
              class={`w-full min-h-[200px] p-4 bg-card border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring transition-colors ${
                overLimit ? "border-destructive focus:ring-destructive" : "border-border"
              }`}
              placeholder="What do you want to share?"
              value={content}
              onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
            />
            <div class="flex justify-end mt-1.5">
              <span class={`text-xs ${overLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {content.length}
                {charLimit !== null && ` / ${charLimit}`}
              </span>
            </div>
          </div>

          {/* Media */}
          <div>
            <h3 class="text-sm font-medium mb-2">Media</h3>
            <div class="flex gap-2">
              <input
                type="url"
                placeholder="Paste image URL..."
                value={newMediaUrl}
                onInput={(e) => setNewMediaUrl((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === "Enter" && addMedia()}
                class="flex-1 px-3 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                class="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
                onClick={addMedia}
                disabled={!newMediaUrl.trim()}
              >
                <Image size={14} /> Add
              </button>
            </div>
            {mediaUrls.length > 0 && (
              <div class="flex gap-2 mt-3 flex-wrap">
                {mediaUrls.map((url, i) => (
                  <div key={i} class="relative group w-20 h-20 rounded-md overflow-hidden border border-border">
                    <img src={url} alt="" class="w-full h-full object-cover" />
                    <button
                      class="absolute top-0.5 right-0.5 p-0.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeMedia(i)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div class="w-72 shrink-0 space-y-5">
          {/* Schedule */}
          <div>
            <h3 class="text-sm font-medium mb-2">Schedule</h3>
            <input
              type="datetime-local"
              class="w-full px-3 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={scheduledAt}
              onInput={(e) => setScheduledAt((e.target as HTMLInputElement).value)}
            />
          </div>

          {/* Channels */}
          <div>
            <h3 class="text-sm font-medium mb-2">Channels</h3>
            {channels.length === 0 ? (
              <p class="text-sm text-muted-foreground">
                No channels yet.{" "}
                <a href="/channels" onClick={(e) => { e.preventDefault(); navigate("/channels"); }} class="text-blue-600 hover:underline">Add one</a>
              </p>
            ) : (
              <div class="space-y-2">
                {channels.map((ch) => {
                  const active = selectedChannels.includes(ch.id);
                  return (
                    <label key={ch.id} class="flex items-center justify-between gap-3 cursor-pointer group">
                      <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ch.color }} />
                        <span class="text-sm">{ch.name}</span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        onClick={() => toggleChannel(ch.id)}
                        class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          active ? "bg-primary" : "bg-input"
                        }`}
                      >
                        <span
                          class={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                            active ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Labels */}
          <div>
            <h3 class="text-sm font-medium mb-2">Labels</h3>
            {labels.length === 0 ? (
              <p class="text-sm text-muted-foreground">No labels yet</p>
            ) : (
              <div class="flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <button
                    key={l.id}
                    class={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedLabels.includes(l.id)
                        ? "text-white border-transparent"
                        : "border-border text-foreground hover:bg-accent"
                    }`}
                    style={selectedLabels.includes(l.id) ? { background: l.color, borderColor: l.color } : {}}
                    onClick={() => toggleLabel(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div class="space-y-2 pt-2">
            <button
              class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              onClick={() => handleSave("draft")}
              disabled={saving || !content.trim()}
            >
              <Save size={14} /> Save Draft
            </button>
            <button
              class="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              onClick={() => handleSave(scheduledAt ? "scheduled" : "draft")}
              disabled={saving || !content.trim() || overLimit}
            >
              <Send size={14} /> {scheduledAt ? "Schedule" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
