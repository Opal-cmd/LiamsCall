# Supervisor demo checklist (Phase 0)

Use this before walking staging with your supervisor.

**Staging:** https://liamscall-1.onrender.com  
**Branch:** `staging` (do not treat as production until merged to `main`)

## Confirm on Render (env vars)

- [ ] `GEMINI_API_KEY` set (chat + blog generation)
- [ ] `BLOG_ADMIN_PASSWORD` set (share only with reviewers)
- [ ] `ALLOWED_ORIGIN=https://liamscall-1.onrender.com`
- [ ] Optional: Turnstile keys if captcha should be on
- [ ] Optional later: `ADSENSE_CLIENT_ID` / `ADSENSE_SLOT_SIDEBAR` (leave empty until AdSense approval)

## Demo path (5–7 minutes)

1. **Home** — open chat, mention Gemini powers replies; note crisis disclaimer.
2. **Blog** — `/blog` → show categories / filters → open one article (links + structure).
3. **Blog desk** — `/admin/blog` → log in → open sample draft → show preview → explain Approve & publish (optionally publish then Move back to drafts).
4. **Workflow pitch** — sources allowlist → discover → Gemini draft → human approve → static pages on Render.
5. **Honest gaps** — ad slots are reserved placeholders until Google AdSense is approved; Blog desk is a shared password (audit log + login throttling added); category filters are on the blog index.

## Talking points (her email)

| She asked | Answer |
|-----------|--------|
| Source materials | `content/blog/sources.yaml` allowlisted RSS + seeds; discovery invents original angles only |
| Blog creation | Discover → Gemini compose → safe/auto or review draft → Blog desk approve → `blog:build` |
| Compute / hosting | Render Node hosting; AI compute via Gemini API (optional OpenAI fallback for chat) |
| Guardrails / login | Prompt rules, phone/URL allowlists, rate limits; desk password + HMAC token + login throttle + audit log |
| Front-end / media / links | Markdown → HTML (headings, lists, bold, links, images); shared site shell |
| Geo / category | Categories + optional `region` frontmatter; visitor filters on `/blog` |
| Ad spaces | Standard sidebar + in-article slots (`data-ad-slot`); CTAs stay separate from ads |

## Do not oversell

- Sidebar Chat card is a **site CTA**, not a Google ad.
- AdSense application is a **process** (domain age/content) — slots are ready when a publisher ID is set at build time.
- Staging filesystem publishes can be wiped on redeploy; lasting publishes should live in git after merge to `main`.
