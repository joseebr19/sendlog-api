const USER_ID = "me"; // fijo hasta que haya login

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

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

    // --- escritura ---

    if (path === "/api/contacts" && request.method === "POST") {
      const b = await request.json();
      if (!b.name || !b.name.trim()) return json({ error: "falta el nombre" }, 400);

      const { results } = await env.DB.prepare(
        `INSERT INTO contacts (user_id, name, type, subgenre, listeners, twitter, instagram, discord, email, phone, priority, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      ).bind(
        USER_ID, b.name.trim(), b.type || null, b.subgenre || null,
        b.listeners ?? null, b.twitter || null, b.instagram || null,
        b.discord || null, b.email || null, b.phone || null,
        b.priority ?? 0, b.notes || null
      ).all();

      return json(results[0], 201);
    }

    const mEdit = path.match(/^\/api\/contacts\/(\d+)$/);

    if (mEdit && request.method === "PUT") {
      const b = await request.json();
      if (!b.name || !b.name.trim()) return json({ error: "falta el nombre" }, 400);

      const { results } = await env.DB.prepare(
        `UPDATE contacts SET
           name = ?, type = ?, subgenre = ?, listeners = ?,
           twitter = ?, instagram = ?, discord = ?, email = ?, phone = ?,
           priority = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?
         RETURNING *`
      ).bind(
        b.name.trim(), b.type || null, b.subgenre || null, b.listeners ?? null,
        b.twitter || null, b.instagram || null, b.discord || null,
        b.email || null, b.phone || null, b.priority ?? 0, b.notes || null,
        mEdit[1], USER_ID
      ).all();

      if (!results.length) return json({ error: "no encontrado" }, 404);
      return json(results[0]);
    }

    if (mEdit && request.method === "DELETE") {
      const r = await env.DB.prepare(
        `DELETE FROM contacts WHERE id = ? AND user_id = ?`
      ).bind(mEdit[1], USER_ID).run();

      if (!r.meta.changes) return json({ error: "no encontrado" }, 404);
      return json({ ok: true });
    }

        // --- packs ---

    if (path === "/api/packs" && request.method === "POST") {
      const b = await request.json();
      if (!b.name || !b.name.trim()) return json({ error: "name required" }, 400);

      const { results } = await env.DB.prepare(
        `INSERT INTO packs (user_id, name, url, released_at, notes)
         VALUES (?, ?, ?, ?, ?) RETURNING *`
      ).bind(USER_ID, b.name.trim(), b.url || null, b.released_at || null, b.notes || null).all();

      return json(results[0], 201);
    }

    // --- sends ---

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