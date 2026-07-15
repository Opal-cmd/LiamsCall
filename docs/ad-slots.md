# Ad insertion areas

Liam's Call reserves standard monetization slots separate from product CTAs.

## Slots

| Slot | Location | `data-ad-slot` | Env at build time |
|------|----------|----------------|-------------------|
| Sidebar | Blog + legal page sidebars | `sidebar` | `ADSENSE_SLOT_SIDEBAR` |
| In-article | Below post body on article pages | `article` | `ADSENSE_SLOT_ARTICLE` |

Also set `ADSENSE_CLIENT_ID=ca-pub-…`.

## Behavior

- **Without** AdSense env vars: placeholder “Sponsored / Ad space” boxes render so layout is ready for review.
- **With** env vars during `npm run blog:build`: real `adsbygoogle` units are injected.

## Not ads

The dark **Chat** sidebar card is a site CTA (`sidebar-cta`), not an ad inventory slot.

## Process before going live

1. Custom domain on production (not only `*.onrender.com`).
2. Enough original content + Privacy/Terms.
3. Apply in Google AdSense; wait for approval.
4. Set the three env vars on Render; redeploy so `blog:build` can wire the units.

See also [`adsense-audit.html`](../adsense-audit.html) and [`.env.example`](../.env.example).
