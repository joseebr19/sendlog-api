CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  avatar_url  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  type        TEXT,
  subgenre    TEXT,
  listeners   INTEGER,
  twitter     TEXT,
  instagram   TEXT,
  discord     TEXT,
  email       TEXT,
  phone       TEXT,
  priority    INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT
);

CREATE TABLE packs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  url         TEXT,
  released_at TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sends (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  pack_id     INTEGER REFERENCES packs(id),
  channel     TEXT NOT NULL CHECK (channel IN ('tw','ig','mail','discord','phone')),
  sent_at     TEXT NOT NULL,
  replied_at  TEXT,
  status      TEXT NOT NULL DEFAULT 'pendiente'
              CHECK (status IN ('pendiente','respondio','produciendo','placement','descartado','sin_respuesta')),
  result_url  TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_contacts_user  ON contacts(user_id);
CREATE INDEX idx_packs_user     ON packs(user_id);
CREATE INDEX idx_sends_user     ON sends(user_id);
CREATE INDEX idx_sends_contact  ON sends(contact_id);
CREATE INDEX idx_sends_status   ON sends(user_id, status);