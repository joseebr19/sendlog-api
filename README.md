# luvbesly.com

Official website and beat-selling platform for **luvbesly**. A static site with
no framework and no build step, plus a single server function for the YouTube
feed. Deployed on Cloudflare Pages.

🔗 [luvbesly.com](https://luvbesly.com)

---

## Stack

HTML, CSS, and JavaScript with native ES modules. No runtime dependencies and
no bundler: what's in `public/` is exactly what gets served. Wrangler is only
used for local dev and deployment.

---

## Structure

```
.
├── public/                 Public root. Everything here is served as-is
│   ├── *.html              Pages
│   ├── _headers            Security and cache headers
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── css/style.css
│   ├── js/
│   │   ├── main.js         Router: nav and lazy module loading
│   │   ├── dom.js          DOM-creation and fetch helpers
│   │   ├── player.js       Global audio player
│   │   ├── beats.js        Beats page
│   │   ├── kits.js         Sound kits page
│   │   ├── vsts.js         VST Vault with search
│   │   └── videos.js       YouTube feed (client)
│   ├── data/               Editable content, no code changes needed
│   │   ├── beats.json
│   │   ├── kits.json
│   │   └── vsts.json
│   ├── images/
│   └── audio/
├── functions/
│   └── api/videos.js       Cached proxy to the YouTube API
├── check.sh                Structure and integrity check
├── wrangler.jsonc
└── .dev.vars               Local secrets — git-ignored
```

---

## Development

Requires Node.js 20 or newer.

```bash
git clone https://github.com/joseebr19/luvbesly-web.git
cd luvbesly-web
npx wrangler pages dev
```

Runs on `http://localhost:8788`. Don't open the HTML files by double-clicking
them: they use absolute paths and `fetch`, so they need to be served from a
server.

Before deploying, run the check:

```bash
bash check.sh
```

It verifies the structure is complete, that JSON references point to files
that actually exist, and that there are no stray keys in `public/`.

---

## Environment variables

| Variable | Description |
|---|---|
| `YOUTUBE_KEY` | YouTube Data API v3 key, restricted to that single API |
| `YOUTUBE_CHANNEL_ID` | Channel ID, starts with `UC` |

**Locally:** `.dev.vars` file at the project root.

```
YOUTUBE_KEY=...
YOUTUBE_CHANNEL_ID=UC...
```

**In production:** Cloudflare Pages dashboard → Settings → Variables and
Secrets, Production environment. `YOUTUBE_KEY` must be marked as **Secret**.

Variables are injected at deploy time, so after adding or changing one you
need to redeploy.

---

## Deployment

Every push to `main` deploys automatically. Manually:

```bash
npx wrangler pages deploy
```

---

## Editing content

Content lives in `public/data/`, not in the code. To publish a new beat, add
an entry to `beats.json` and upload the MP3 to `public/audio/`:

```json
{
  "id": 7,
  "title": "NAME",
  "bpm": "150 BPM",
  "key": "C MAJOR",
  "audioUrl": "/audio/Name.mp3",
  "buyUrl": "https://www.beatstars.com/luvbesly"
}
```

Same process for `kits.json` and `vsts.json`.

> **Important:** Cloudflare is case-sensitive for filenames; Windows isn't. A
> `Beat.mp3` referenced as `beat.mp3` works locally and fails in production.
> `check.sh` catches these cases.

---

## Security notes

- No credentials reach the client. The browser calls `/api/videos`, and the
  key lives as a server-side secret.
- The function uses `playlistItems` (1 quota unit) instead of `search` (100),
  with a one-hour edge cache. Approximate usage: ~24 units/day against a
  10,000 daily quota.
- All DOM is built with `textContent`; no data is interpolated into HTML.
- Strict CSP in `_headers`, no `unsafe-inline` or `unsafe-eval`. If an inline
  style or script is ever needed, its hash should be declared rather than
  loosening the policy.

---

## License

The **source code** in this repository is released under the MIT license (see
[LICENSE](LICENSE)).

That license does **not** cover the creative content: the audio files in
`public/audio/`, the artwork and images in `public/images/`, the logo, or the
**luvbesly** brand identity. All rights to that material are reserved. Use,
distribution, or resale requires explicit permission.

VST Vault links point to third-party software hosted externally. This
repository doesn't distribute or store any of those files.
