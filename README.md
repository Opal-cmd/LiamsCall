# Liams Call AI

Mental health support chatbot for caregivers and families. Express backend that
streams responses from Groq, OpenAI, or Anthropic, with a single-page frontend.

## Project structure

```
public/          Everything served to the browser (index.html, assets/)
server.js        Express server: static files + /api/chat streaming endpoint
.env             Secrets and configuration (never commit this)
.env.example     Template for .env
```

Only `public/` is exposed to the web. Server code, env files, and backups are
not reachable from a browser.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and set at least `GROQ_API_KEY`
   (free keys at https://console.groq.com).
3. Install and start:

```bash
npm install
npm start
```

4. Open http://localhost:3000

## Configuration (.env)

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `groq`, `openai`, or `anthropic` |
| `FALLBACK_PROVIDER` | Optional second provider tried if the first fails |
| `GROQ_MODEL` / `GROQ_FALLBACK_MODEL` | Primary and fallback Groq models |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | Per-IP rate limiting for /api/chat |
| `ALLOWED_ORIGIN` | Set to your site origin in production (CORS) |
| `CHAT_API_TOKEN` | Optional shared token required in `x-chat-token` header |
| `SYSTEM_PROMPT` | Override the default bot persona |

## Blog (`/blog`)

Crawlable Markdown → HTML blog for SEO.

```bash
npm run blog:build                 # rebuild public/blog + sitemap
npm run blog:discover              # pull idea angles from allowlisted RSS/seeds into topics.yaml
npm run blog:generate              # next topic from topics.yaml (needs GEMINI_API_KEY)
npm run blog:approve -- my-slug    # publish a draft from content/blog/drafts/
```

- Published posts: `content/blog/*.md`
- Review drafts: `content/blog/drafts/`
- Topic queue: `content/blog/topics.yaml` (`risk: safe` can auto-publish; `risk: review` lands in Blog desk drafts for a human to approve)
- Idea sources: `content/blog/sources.yaml` (RSS + curated seeds - inspiration only, never copied)
- **Blog desk (for non-coders):** open [http://localhost:3000/admin/blog](http://localhost:3000/admin/blog) (or `/admin/blog` on the live site). Set `BLOG_ADMIN_PASSWORD` in `.env` / Render. Log in → **Needs review** → edit if needed → **Approve & publish**. **Live on site** can move a post back to drafts.
- Cron: [`.github/workflows/blog-cron.yml`](.github/workflows/blog-cron.yml) (Mon/Thu generate) + [`.github/workflows/blog-discover.yml`](.github/workflows/blog-discover.yml) (weekly ideas) — set repo secret `GEMINI_API_KEY`

## Deploy (Render)

### Production
1. Push `main` to GitHub.
2. On https://render.com create a **Web Service** from the repo (branch `main`):
   - Build command: `npm install && npm run blog:build`
   - Start command: `npm start`
3. Add environment variables in the Render dashboard (`GEMINI_API_KEY`,
   `BLOG_ADMIN_PASSWORD`, and `ALLOWED_ORIGIN=https://your-domain.com`).
4. Attach a custom domain under Settings → Custom Domains. TLS is automatic.

### Staging (share with supervisor before merging to main)
1. Push the `staging` branch to GitHub.
2. Create a **second** Web Service on Render (do not reuse production):
   - Name: `liamscall-staging` (or similar)
   - Branch: `staging`
   - Build: `npm install && npm run blog:build`
   - Start: `npm start`
   - Or use the Blueprint in [`render.yaml`](render.yaml)
3. Copy the same API keys as production, plus:
   - `BLOG_ADMIN_PASSWORD` — share only with reviewers
   - `ALLOWED_ORIGIN=https://liamscall-staging.onrender.com` (use your real staging URL)
4. Send reviewers: the staging site URL + `/admin/blog` + the blog desk password.

Staging is separate from production. Merging `staging` → `main` is what updates the live site.

The server already sets `trust proxy`, so rate limiting works correctly behind
Render's proxy.

## Safety note

This bot is not a medical professional and the UI says so. Keep the crisis
disclaimer visible and consider a dedicated crisis-resources page before
launch.
