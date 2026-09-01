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

    return json({ error: "not found" }, 404);
  },
};