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
              CHECK (status IN ('pending','replied','producing','placement','declined','no_reply')),
  result_url  TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO sends_new (id, user_id, contact_id, pack_id, channel, sent_at, replied_at, status, result_url, notes, created_at)
SELECT id, user_id, contact_id, pack_id, channel, sent_at, replied_at,
  CASE status
    WHEN 'pendiente'     THEN 'pending'
    WHEN 'respondio'     THEN 'replied'
    WHEN 'produciendo'   THEN 'producing'
    WHEN 'descartado'    THEN 'declined'
    WHEN 'sin_respuesta' THEN 'no_reply'
    ELSE status
  END,
  result_url, notes, created_at
FROM sends;

DROP TABLE sends;
ALTER TABLE sends_new RENAME TO sends;

CREATE INDEX idx_sends_user    ON sends(user_id);
CREATE INDEX idx_sends_contact ON sends(contact_id);
CREATE INDEX idx_sends_status  ON sends(user_id, status);

PRAGMA foreign_keys=ON;