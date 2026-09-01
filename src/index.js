const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const subgenre = (v) => v?.trim().toLowerCase() || null;

// --- sesion: cookie firmada con HMAC ---

const enc = new TextEncoder();

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makeSession(userId, secret) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 dias
  const payload = `${userId}.${exp}`;
  return `${payload}.${await sign(payload, secret)}`;
}

async function readSession(request, secret) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!m) return null;

  const parts = decodeURIComponent(m[1]).split(".");
  if (parts.length !== 3) return null;

  const [userId, exp, sig] = parts;
  if (await sign(`${userId}.${exp}`, secret) !== sig) return null;
  if (Number(exp) < Date.now()) return null;

  return userId;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = url.origin;

    // --- auth ---

    if (path === "/api/auth/login") {
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: `${origin}/api/auth/callback`,
        response_type: "code",
        scope: "openid email profile",
        access_type: "online",
        prompt: "select_account",
      });
      return Response.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302
      );
    }

    if (path === "/api/auth/callback") {
      const code = url.searchParams.get("code");
      if (!code) return Response.redirect(origin, 302);

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${origin}/api/auth/callback`,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) return json({ error: "auth failed" }, 401);
      const { access_token } = await tokenRes.json();

      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { authorization: `Bearer ${access_token}` },
      });
      if (!infoRes.ok) return json({ error: "auth failed" }, 401);
      const info = await infoRes.json();

      const userId = `g_${info.id}`;
      await env.DB.prepare(
        `INSERT INTO users (id, email, name, avatar_url) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url`
      ).bind(userId, info.email, info.name || null, info.picture || null).run();

      const session = await makeSession(userId, env.SESSION_SECRET);
      return new Response(null, {
        status: 302,
        headers: {
          location: origin,
          "set-cookie": `session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
        },
      });
    }

    if (path === "/api/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          location: origin,
          "set-cookie": "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        },
      });
    }

    // --- a partir de aqui hace falta sesion ---

    if (path.startsWith("/api/")) {
      const USER_ID = await readSession(request, env.SESSION_SECRET);
      if (!USER_ID) return json({ error: "unauthorized" }, 401);

      if (path === "/api/me" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT id, email, name, avatar_url FROM users WHERE id = ?`
        ).bind(USER_ID).all();
        return json(results[0] || null);
      }

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
    }

    return json({ error: "not found" }, 404);
  },
};