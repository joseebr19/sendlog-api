const USER_ID = "me"; // fijo hasta que haya login

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const subgenre = (v) => v?.trim().toLowerCase() || null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- lectura ---

    if (path === "/api/contacts" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT * FROM contacts WHERE user_id = ? ORDER BY name COLLATE NOCASE`
      ).bind(USER_ID).all();
      return json(results);
    }

    if (path === "/api/sends" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT s.*, c.name AS contact_name, p.name AS pack_name
           FROM sends s
           JOIN contacts c ON c.id = s.contact_id
           LEFT JOIN packs p ON p.id = s.pack_id
          WHERE s.user_id = ?
          ORDER BY s.sent_at DESC`
      ).bind(USER_ID).all();
      return json(results);
    }

    if (path === "/api/packs" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT * FROM packs WHERE user_id = ? ORDER BY created_at DESC`
      ).bind(USER_ID).all();
      return json(results);
    }

    if (path === "/api/followups" && request.method === "GET") {
      const days = Number(url.searchParams.get("days") || 14);
      const { results } = await env.DB.prepare(
        `SELECT s.*, c.name AS contact_name, c.twitter, c.instagram, c.discord, c.email,
                p.name AS pack_name,
                CAST(julianday('now') - julianday(s.sent_at) AS INTEGER) AS days_ago
           FROM sends s
           JOIN contacts c ON c.id = s.contact_id
           LEFT JOIN packs p ON p.id = s.pack_id
          WHERE s.user_id = ?
            AND s.status = 'pending'
            AND julianday('now') - julianday(s.sent_at) >= ?
          ORDER BY s.sent_at ASC`
      ).bind(USER_ID, days).all();
      return json(results);
    }

    // --- contacts: escritura ---

    if (path === "/api/contacts" && request.method === "POST") {
      const b = await request.json();
      if (!b.name || !b.name.trim()) return json({ error: "name required" }, 400);

      const { results } = await env.DB.prepare(
        `INSERT INTO contacts (user_id, name, type, subgenre, listeners, twitter, instagram, discord, email, phone, priority, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      ).bind(
        USER_ID, b.name.trim(), b.type || null, subgenre(b.subgenre),
        b.listeners ?? null, b.twitter || null, b.instagram || null,
        b.discord || null, b.email || null, b.phone || null,
        b.priority ?? 0, b.notes || null
      ).all();

      return json(results[0], 201);
    }

    const mContact = path.match(/^\/api\/contacts\/(\d+)$/);

    if (mContact && request.method === "PUT") {
      const b = await request.json();
      if (!b.name || !b.name.trim()) return json({ error: "name required" }, 400);

      const { results } = await env.DB.prepare(
        `UPDATE contacts SET
           name = ?, type = ?, subgenre = ?, listeners = ?,
           twitter = ?, instagram = ?, discord = ?, email = ?, phone = ?,
           priority = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?
         RETURNING *`
      ).bind(
        b.name.trim(), b.type || null, subgenre(b.subgenre), b.listeners ?? null,
        b.twitter || null, b.instagram || null, b.discord || null,
        b.email || null, b.phone || null, b.priority ?? 0, b.notes || null,
        mContact[1], USER_ID
      ).all();

      if (!results.length) return json({ error: "not found" }, 404);
      return json(results[0]);
    }

    if (mContact && request.method === "DELETE") {
      const r = await env.DB.prepare(
        `DELETE FROM contacts WHERE id = ? AND user_id = ?`
      ).bind(mContact[1], USER_ID).run();

      if (!r.meta.changes) return json({ error: "not found" }, 404);
      return json({ ok: true });
    }

    // --- packs: escritura ---

    if (path === "/api/packs" && request.method === "POST") {
      const b = await request.json();
      if (!b.name || !b.name.trim()) return json({ error: "name required" }, 400);

      const { results } = await env.DB.prepare(
        `INSERT INTO packs (user_id, name, url, released_at, notes)
         VALUES (?, ?, ?, ?, ?) RETURNING *`
      ).bind(USER_ID, b.name.trim(), b.url || null, b.released_at || null, b.notes || null).all();

      return json(results[0], 201);
    }

    // --- sends: escritura ---

    if (path === "/api/sends/bulk" && request.method === "POST") {
      const b = await request.json();
      if (!Array.isArray(b.contacts) || !b.contacts.length) {
        return json({ error: "contacts required" }, 400);
      }
      if (b.contacts.length > 200) return json({ error: "too many" }, 400);
      if (!b.sent_at) return json({ error: "sent_at required" }, 400);

      const stmt = env.DB.prepare(
        `INSERT INTO sends (user_id, contact_id, pack_id, channel, sent_at, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      );

      await env.DB.batch(
        b.contacts.map((c) =>
          stmt.bind(USER_ID, c.id, b.pack_id || null, c.channel, b.sent_at)
        )
      );

      const { results } = await env.DB.prepare(
        `SELECT s.*, c.name AS contact_name, p.name AS pack_name
           FROM sends s
           JOIN contacts c ON c.id = s.contact_id
           LEFT JOIN packs p ON p.id = s.pack_id
          WHERE s.user_id = ? AND s.sent_at = ?
          ORDER BY s.id DESC
          LIMIT ?`
      ).bind(USER_ID, b.sent_at, b.contacts.length).all();

      return json(results, 201);
    }

    if (path === "/api/sends" && request.method === "POST") {
      const b = await request.json();
      if (!b.contact_id || !b.channel || !b.sent_at) {
        return json({ error: "contact_id, channel and sent_at required" }, 400);
      }

      const { results } = await env.DB.prepare(
        `INSERT INTO sends (user_id, contact_id, pack_id, channel, sent_at, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
      ).bind(
        USER_ID, b.contact_id, b.pack_id || null, b.channel,
        b.sent_at, b.status || "pending", b.notes || null
      ).all();

      return json(results[0], 201);
    }

    const mSend = path.match(/^\/api\/sends\/(\d+)$/);

    if (mSend && request.method === "PUT") {
      const b = await request.json();

      const { results } = await env.DB.prepare(
        `UPDATE sends SET
           pack_id = ?, channel = ?, sent_at = ?, replied_at = ?,
           status = ?, result_url = ?, notes = ?
         WHERE id = ? AND user_id = ?
         RETURNING *`
      ).bind(
        b.pack_id || null, b.channel, b.sent_at, b.replied_at || null,
        b.status, b.result_url || null, b.notes || null,
        mSend[1], USER_ID
      ).all();

      if (!results.length) return json({ error: "not found" }, 404);
      return json(results[0]);
    }

    if (mSend && request.method === "DELETE") {
      const r = await env.DB.prepare(
        `DELETE FROM sends WHERE id = ? AND user_id = ?`
      ).bind(mSend[1], USER_ID).run();

      if (!r.meta.changes) return json({ error: "not found" }, 404);
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  },
};