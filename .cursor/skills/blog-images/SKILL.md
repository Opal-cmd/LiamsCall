---
name: blog-images
description: >-
  When generating or editing Liam's Call blog posts, attach a local hero image
  for every post by copying an allowlisted source og:image when available, or a
  curated Unsplash stock photo matched to the category. Use this whenever the
  user asks to write, generate, publish, or improve blog posts or blog visuals.
---

# Blog hero images

## Required behavior

1. Every published/draft post must have frontmatter `image: "/assets/blog/{slug}.jpg"`.
2. **First choice — Unsplash search on the post's own keywords.** With `UNSPLASH_ACCESS_KEY` set, `ensurePostImage` searches the Search API using the post title's salient words, then the theme's curated phrases (landscape orientation, high content filter).
3. **Second choice — curated theme pool.** Falls back to per-theme photo pools scored against title + angle + description + category (housing, recovery, grief, boundaries, sleep, siblings-family, identity, guilt-anger, connection, rest, routine, crisis-support, caregiving). Prefer human, calm scenes that match the post subject.
4. **Last resort — inspiration source og:image.** Fetch `source_url`'s `og:image` when the host is curated (SAMHSA, ConnexOntario, 988, 211, Ontario Caregiver, Kids Help Phone, Mental Health Commission, toronto.ca, or other .gov/.ca/.org sources) and the image lives on the article's own domain or an allowlisted CDN.
5. **No repeats.** Every choice is recorded in `content/blog/image-manifest.json` (photo id + file hash). A photo id or identical image already used by another post is skipped, so no two posts share a hero. Commit the manifest with the post.
6. `ensurePostImage` returns `{ path, origin, photoId?, credit? }` — log the origin (`search:<query>`, `stock:<theme>`, `source`, `existing`) so it is auditable.
7. Never invent clinic/shelter photos. Never hotlink third-party article images in production HTML — always save under `public/assets/blog/`.
8. After attaching images, run `node scripts/blog-build.js` so `/blog` cards show the art.

## Commands

```bash
# Backfill all published posts
node scripts/blog-attach-images.js

# Force re-download
node scripts/blog-attach-images.js --force

# Include drafts
node scripts/blog-attach-images.js --drafts

# Generate a post (auto-attaches image when wired)
node scripts/blog-generate.js --topic=some-id
```

## Design note

Blog layout is WePresent-inspired (polaroid cards with inset images + centered captions, white section containers, asymmetric two-up rows, tinted story pages) but **all colors come from the Liam's Call brand kit**: green-dark `#0f4a3a`, green-send `#1f6b52`, beige-main `#e8dfd3`, beige-widget `#ddd2c4`. Card/band/story tints are sage, mint, moss, sand, cream, and clay tints of those (see `--pl-*`, `--band-*`, `--story-*` in `scripts/lib/blog-utils.js`). Fonts: self-hosted Inter only (same as the main app) — display headings are bold Inter (weight 700, letter-spacing -0.02em, like `.font-serif-brand`); never load Google Fonts or add other families. Never introduce off-brand hues (no purples, corals, or saturated blues/yellows).
