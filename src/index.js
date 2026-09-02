const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const subgenre = (v) => v?.trim().toLowerCase() || null;

// --- CSV import helpers ---

const CSV_MONTHS = {
  enero: "01", febrero: "02", marzo: "03", abril: "04",
  mayo: "05", junio: "06", julio: "07", agosto: "08",
  septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};
const CSV_CHANNELS = { tw: "tw", mail: "mail", ig: "ig", discord: "discord" };
const CSV_STATUS = {
  pendiente: "pending", respondio: "replied", produciendo: "producing",
  usado: "used", publicado: "released", descartado: "declined",
  "sin respuesta": "no_reply",
};

function parseCSV(text) {
  const rows = [];
  let row = [], cellBuf = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cellBuf += '"'; i++; }
        else inQuotes = false;
      } else cellBuf += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(cellBuf); cellBuf = ""; }
    else if (c === "\n") { row.push(cellBuf); rows.push(row); row = []; cellBuf = ""; }
    else if (c !== "\r") cellBuf += c;
  }
  if (cellBuf !== "" || row.length) { row.push(cellBuf); rows.push(row); }
  return rows;
}

const cell = (v) => (v || "").replace(/\r|\n/g, " ").trim();

function listenersFromText(v) {
  const t = cell(v).toLowerCase().replace(/\s/g, "");
  if (!t) return null;
  const m = t.match(/^([\d.,]+)([km]?)$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  if (isNaN(n)) return null;
  if (m[2] === "k") return Math.round(n * 1000);
  if (m[2] === "m") return Math.round(n * 1000000);
  return Math.round(n);
}

function dateFromText(v, year) {
  const t = cell(v).toLowerCase();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\s+([a-zá-ú]+)$/);
  if (!m) return null;
  const month = CSV_MONTHS[m[2]];
  if (!month) return null;
  return `${year}-${month}-${m[1].padStart(2, "0")}`;
}

const typeFromText = (v) => cell(v).replace(/\s*\+\s*/, "+").toLowerCase() || null;
const normalizedName = (v) => cell(v).toLowerCase().replace(/\s+/g, " ");

// --- CSV export helpers ---

function toCSVField(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCSV(headers, rows) {
  const lines = [headers.map(toCSVField).join(",")];
  for (const row of rows) lines.push(row.map(toCSVField).join(","));
  return lines.join("\r\n") + "\r\n";
}

function csvResponse(filename, csv) {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

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

      if (path === "/api/contacts/export" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT * FROM contacts WHERE user_id = ? ORDER BY name COLLATE NOCASE`
        ).bind(USER_ID).all();

        const headers = [
          "name", "type", "subgenre", "listeners",
          "twitter", "instagram", "discord", "email", "phone",
          "priority", "notes", "created_at",
        ];
        const rows = results.map((c) => headers.map((h) => c[h]));
        return csvResponse("contacts.csv", toCSV(headers, rows));
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

      if (path === "/api/sends/export" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT s.*, c.name AS contact_name, p.name AS pack_name
             FROM sends s
             JOIN contacts c ON c.id = s.contact_id
             LEFT JOIN packs p ON p.id = s.pack_id
            WHERE s.user_id = ?
            ORDER BY s.sent_at DESC`
        ).bind(USER_ID).all();

        const headers = [
          "contact_name", "pack_name", "channel", "sent_at",
          "replied_at", "status", "result_url", "notes",
        ];
        const rows = results.map((s) => headers.map((h) => s[h]));
        return csvResponse("sends.csv", toCSV(headers, rows));
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

      // --- contacts: import ---

      if (path === "/api/contacts/import" && request.method === "POST") {
        const year = url.searchParams.get("year") || String(new Date().getFullYear());

        const rows = parseCSV(await request.text());
        if (!rows.length) return json({ error: "empty CSV" }, 400);

        const headers = rows.shift().map(cell);
        const idx = (n) => headers.indexOf(n);
        const col = {
          name: idx("Nombre"), type: idx("Tipo"), subgenre: idx("Subg"),
          contact: idx("Contacto"), rs: idx("RS"), date: idx("Fecha Envío"),
          pack: idx("Pack Enviado"), status: idx("Estado"),
          notes: idx("Notas"), listeners: idx("Oyentes"),
        };
        if (col.name === -1) return json({ error: "missing 'Nombre' column" }, 400);

        const [existingPacks, existingContacts, existingSends] = await Promise.all([
          env.DB.prepare(`SELECT id, name FROM packs WHERE user_id = ?`).bind(USER_ID).all(),
          env.DB.prepare(`SELECT id, name FROM contacts WHERE user_id = ?`).bind(USER_ID).all(),
          env.DB.prepare(`SELECT contact_id, channel, sent_at FROM sends WHERE user_id = ?`).bind(USER_ID).all(),
        ]);

        const packByName = new Map(existingPacks.results.map((p) => [p.name, p.id]));
        const contactByName = new Map(existingContacts.results.map((c) => [normalizedName(c.name), c.id]));
        const sendKeys = new Set(existingSends.results.map((s) => `${s.contact_id}|${s.channel}|${s.sent_at}`));

        const warnings = [];
        let contactsCreated = 0, contactsUpdated = 0;
        let sendsCreated = 0, sendsSkipped = 0;

        for (let i = 0; i < rows.length; i++) {
          const f = rows[i];
          const name = cell(f[col.name]);
          if (!name) continue;

          const contact = cell(f[col.contact]);
          const rs = cell(f[col.rs]).toLowerCase();
          const channel = CSV_CHANNELS[rs] || null;

          let twitter = null, instagram = null, email = null, discord = null;
          if (contact) {
            if (channel === "tw") twitter = contact;
            else if (channel === "ig") instagram = contact;
            else if (channel === "mail") email = contact;
            else if (channel === "discord") discord = contact;
            else warnings.push(`row ${i + 2} (${name}): unrecognized RS "${f[col.rs]}"`);
          }

          const key = normalizedName(name);
          let contactId = contactByName.get(key);

          if (contactId) {
            const sets = [], values = [];
            const setIfPresent = (column, value) => {
              if (value !== null && value !== undefined && value !== "") {
                sets.push(`${column} = ?`);
                values.push(value);
              }
            };
            setIfPresent("type", typeFromText(f[col.type]));
            setIfPresent("subgenre", subgenre(f[col.subgenre]));
            const listeners = listenersFromText(f[col.listeners]);
            if (listeners !== null) setIfPresent("listeners", listeners);
            setIfPresent("twitter", twitter);
            setIfPresent("instagram", instagram);
            setIfPresent("discord", discord);
            setIfPresent("email", email);
            setIfPresent("notes", cell(f[col.notes]) || null);

            if (sets.length) {
              values.push(contactId, USER_ID);
              await env.DB.prepare(
                `UPDATE contacts SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
              ).bind(...values).run();
              contactsUpdated++;
            }
          } else {
            const { results } = await env.DB.prepare(
              `INSERT INTO contacts (user_id, name, type, subgenre, listeners, twitter, instagram, discord, email, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
            ).bind(
              USER_ID, name, typeFromText(f[col.type]), subgenre(f[col.subgenre]),
              listenersFromText(f[col.listeners]), twitter, instagram, discord, email,
              cell(f[col.notes]) || null
            ).all();
            contactId = results[0].id;
            contactByName.set(key, contactId);
            contactsCreated++;
          }

          const packName = cell(f[col.pack]);
          const statusRaw = cell(f[col.status]);
          const sentAtParsed = dateFromText(f[col.date], year);
          if (!packName && !statusRaw && !sentAtParsed) continue;

          const status = CSV_STATUS[statusRaw.toLowerCase()] || "pending";
          if (statusRaw && !CSV_STATUS[statusRaw.toLowerCase()]) {
            warnings.push(`row ${i + 2} (${name}): unrecognized status "${statusRaw}", saved as pending`);
          }
          if (!channel) {
            warnings.push(`row ${i + 2} (${name}): send has no valid channel, skipped`);
            continue;
          }

          let packId = null;
          if (packName) {
            packId = packByName.get(packName);
            if (!packId) {
              const { results } = await env.DB.prepare(
                `INSERT INTO packs (user_id, name) VALUES (?, ?) RETURNING id`
              ).bind(USER_ID, packName).all();
              packId = results[0].id;
              packByName.set(packName, packId);
            }
          }

          const sentAt = sentAtParsed || "1970-01-01";
          const sendKey = `${contactId}|${channel}|${sentAt}`;
          if (sendKeys.has(sendKey)) { sendsSkipped++; continue; }

          await env.DB.prepare(
            `INSERT INTO sends (user_id, contact_id, pack_id, channel, sent_at, status)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(USER_ID, contactId, packId, channel, sentAt, status).run();
          sendKeys.add(sendKey);
          sendsCreated++;
        }

        return json({ contactsCreated, contactsUpdated, sendsCreated, sendsSkipped, warnings });
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