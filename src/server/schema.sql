-- Social media channels
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'twitter',
  handle TEXT DEFAULT '',
  color TEXT NOT NULL DEFAULT '#1da1f2',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Labels for categorizing posts
CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Posts (core entity)
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Many-to-many: posts <-> channels
CREATE TABLE IF NOT EXISTS post_channels (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, channel_id)
);

-- Many-to-many: posts <-> labels
CREATE TABLE IF NOT EXISTS post_labels (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, label_id)
);

-- Media attachments
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'image',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_post_channels_post ON post_channels(post_id);
CREATE INDEX IF NOT EXISTS idx_post_channels_channel ON post_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_post_labels_post ON post_labels(post_id);
CREATE INDEX IF NOT EXISTS idx_post_labels_label ON post_labels(label_id);
CREATE INDEX IF NOT EXISTS idx_media_post ON media(post_id);
