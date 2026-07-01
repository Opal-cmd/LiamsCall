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

## Deploy (Render)

1. Push this repo to GitHub.
2. On https://render.com create a **Web Service** from the repo:
   - Build command: `npm install`
   - Start command: `npm start`
3. Add environment variables in the Render dashboard (`GROQ_API_KEY`,
   `AI_PROVIDER`, and `ALLOWED_ORIGIN=https://your-domain.com`).
4. Attach a custom domain under Settings → Custom Domains. TLS is automatic.

The server already sets `trust proxy`, so rate limiting works correctly behind
Render's proxy.

## Safety note

This bot is not a medical professional and the UI says so. Keep the crisis
disclaimer visible and consider a dedicated crisis-resources page before
launch.
