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
2. Prefer copying an `og:image` from the topic/source URL **only** if the host is allowlisted (SAMHSA, ConnexOntario, 988, 211, Ontario Caregiver, Kids Help Phone, Mental Health Commission, toronto.ca, Unsplash).
3. If no safe source image exists, download a curated Unsplash stock photo via `scripts/lib/blog-images.js` (`ensurePostImage`).
4. Never invent clinic/shelter photos. Never hotlink third-party article images in production HTML — always save under `public/assets/blog/`.
5. After attaching images, run `node scripts/blog-build.js` so `/blog` cards show the art.

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

Blog index cards are WePresent-inspired: image-led masonry tiles, pastel section bands, bold serif titles (Fraunces), sans meta (DM Sans). Keep brand greens; avoid purple gradients.
