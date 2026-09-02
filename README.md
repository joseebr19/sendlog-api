# Send Log

A CRM for music producers to track outreach: who you sent a beat or sound pack to, on which platform, and what happened next.

**Live:** [app.luvbesly.com](https://app.luvbesly.com)

## Why

As an underground producer, "who did I send this pack to, and did they ever get back to me?" used to live in a spreadsheet that fell out of date the moment I stopped looking at it. Send Log replaces that spreadsheet with something that actually tracks state: every contact has a history of sends, every send has a status, and stale conversations surface themselves instead of getting lost in a scroll.

## What it does

- **Contacts** — producers, artists, and labels you reach out to, with their type, subgenre, listener count, and whichever handle you use to contact them (Twitter/X, Instagram, Discord, or email).
- **Sends** — a log of every pack or beat you sent, per contact: channel, date, and status (`pending → replied → producing → used → released`, plus `declined` / `no_reply`). A contact can have any number of sends over time.
- **Follow-up view** — sends stuck in `pending` past a configurable number of days, so nothing silently dies in your inbox.
- **Bulk send** — select a batch of contacts and log a send to all of them at once, instead of one at a time.
- **Packs** — group sends by which pack/beat you sent, created inline as you log a send.
- **Result links** — mark a send as `released` and attach the link to the result (a video, a Spotify link, whatever proves the placement happened).
- **Google sign-in** — no separate account system; you log in with the Google account you already have.
- **Self-serve account deletion** — any user can permanently delete their account and all their data from inside the app.

## Stack

- **Backend:** a single [Cloudflare Worker](https://developers.cloudflare.com/workers/) (`src/index.js`) — no framework, just a router over `fetch()`. Handles auth, the REST-ish JSON API under `/api/*`, and serves the built frontend as static assets.
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite at the edge). Four tables — `users`, `contacts`, `packs`, `sends` — all scoped by `user_id`.
- **Frontend:** React + Vite (`web/`), built to `public/` and served by the same Worker.
- **Auth:** Google OAuth (authorization code flow), session kept in a signed, `HttpOnly`, `Secure` cookie — the signature is HMAC-SHA256 over the payload using a secret that never touches the client.
- **Rate limiting:** Cloudflare's native [Workers rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), applied per-IP to the whole API before auth even runs.

No ORM, no build step on the backend, no external services beyond Google (for sign-in) and Cloudflare (for everything else).

## Project layout

```
src/index.js       Worker: routing, auth, API, rate limiting
web/                React frontend (Vite)
  src/App.jsx       the entire UI — one component tree
  src/App.css       styling, matching the parent site's design tokens
schema.sql          D1 schema
migrate-*.sql       one-off migrations run by hand against D1
wrangler.jsonc      Worker config: bindings, routes, rate limit
```

## Running locally

```bash
npx wrangler dev        # Worker + API, in the project root
```
```bash
cd web && npm run dev   # frontend, proxies /api to the Worker above
```

Google sign-in doesn't work in local dev — the session cookie is `Secure`, so it's dropped over plain HTTP. Everything else (the API, the UI, styling) can be checked locally; auth-gated flows need a deploy to test end to end.

## Notes on scope

This is a solo project built to solve one specific, recurring annoyance in my own workflow — it isn't trying to be a general-purpose CRM. The data model and status pipeline are shaped around how outreach actually works for a beat producer, not abstracted into something more generic than it needs to be.
