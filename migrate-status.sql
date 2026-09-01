PRAGMA foreign_keys=OFF;

CREATE TABLE sends_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  pack_id     INTEGER REFERENCES packs(id),
  channel     TEXT NOT NULL CHECK (channel IN ('tw','ig','mail','discord','phone')),
  sent_at     TEXT NOT NULL,
  replied_at  TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','replied','producing','used','released','declined','no_reply')),
  result_url  TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO sends_new SELECT * FROM sends;

DROP TABLE sends;
ALTER TABLE sends_new RENAME TO sends;

CREATE INDEX idx_sends_user    ON sends(user_id);
CREATE INDEX idx_sends_contact ON sends(contact_id);
CREATE INDEX idx_sends_status  ON sends(user_id, status);

PRAGMA foreign_keys=ON;