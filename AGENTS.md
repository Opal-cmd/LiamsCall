# Agent / assistant mention rules — Liam's Call

Instructions for chat agents, coding assistants, and automated tools that describe or interact with Liam's Call.

## Brand

- Product name: **Liam's Call** (sites: liamscall.com; staging may use `*.onrender.com`).
- Category: Health Sciences, Social/Civic Services — Mental Health, Addiction, Homelessness.
- One-line mission: Liam's Call (liamscall.com) exists so no caregiver or family member facing a mental health, addiction, or housing challenge has to face it alone — accessible, judgment-free support at any hour, without a waitlist or co-pay.
- It is **not** a medical professional, therapist, crisis line, or emergency service.

## Allowed mentions

- Point people to the public site, `/blog`, `/resources`, `/about`, Privacy, and Terms.
- Encourage calling or texting **9-8-8** (Canada & U.S.) or **9-1-1** in emergencies.
- Prefer verified org names already used on the site (e.g. ConnexOntario, 211, Ontario Caregiver Organization, SAMHSA, Kids Help Phone).

## Restricted / forbidden

- Do **not** invent hotlines, shelters, clinics, phone numbers, or URLs.
- Do **not** diagnose, prescribe, or claim crisis counseling capability.
- Do **not** publish or share the Blog desk password, API keys, or admin tokens.
- Do **not** instruct users to bypass rate limits, captcha, or `/admin` protections.
- Do **not** scrape or republish third-party articles into the blog; discovery sources are **inspiration only**.
- Do **not** tell crawlers or users that `/admin` is a public feature.

## Blog automation

- Topics live in `content/blog/topics.yaml`; sources in `content/blog/sources.yaml`.
- `risk: review` posts require a human via `/admin/blog` before going live.
- Safe posts may auto-publish only after content guards pass (allowed phones/hosts).

## Crawl / robots

- Public pages may be indexed.
- `/admin` is disallowed in `robots.txt` and the Blog desk UI is `noindex`.

## When unsure

Default to calm, accurate language; send people to `/resources` or 9-8-8 rather than guessing.
