# Metric — Multi-page build & motion layer

Date: 2026-10-09 · Status: Approved design · Scope: architectural

## 1. Context

The deliverable is a heavy-civil landing page (`index.html`) built with vanilla
HTML/CSS/JS, GSAP 3.12 + ScrollTrigger and Lenis smooth scroll. The client
approved expanding it into a complete multi-page company site and adding a
full scroll/interaction animation layer to every page and section.

Hard constraints (locked in previous sessions — not for discussion):

- Vanilla HTML/CSS/JS. No build step, no frameworks, no package manager.
  Pages are standalone files the client can double-click open (`file://`).
- Animation stack stays GSAP + ScrollTrigger + Lenis. No framer-motion import.
- Entrances are one-way (`once: true`), never replay on scroll-back.
- `prefers-reduced-motion: reduce` renders everything instant/static.
- No layout-thrash animation: never tween `height`/`width`/`top`/`left`.
- Reuse the existing design system; no new visual world.

## 2. Site map

| File | Page | Content |
|---|---|---|
| `index.html` (exists) | Home | Updated nav/footer to real links. All sections kept. |
| `about.html` | About | Story, values grid, capabilities stats, leadership, timeline, CTA. |
| `services.html` | Services | 4 service blocks (Earthworks/Utilities/Roadworks/Environmental) with capabilities + process section + CTA. |
| `projects.html` | Projects | Filter bar + full project grid; cards link to `project.html?id=<slug>`. |
| `careers.html` | Careers | Culture, benefits, open-role list, hiring CTA. |
| `news.html` | News | Featured detail block + article list with category filter; clicking an item switches detail. |
| `contact.html` | Contact | Inquiry form (validation + success), 3 office cards, key contacts. |
| `project.html` | Project detail (template) | Hero, meta grid, scope, stats, gallery, prev/next nav. Content driven by placeholder dataset keyed by `?id=`; unknown/failed id falls back to the first project. |

## 3. Shared shell

The header (logo, nav, magnetic CTA, burger), scroll-progress bar, mobile menu,
grain overlay and footer are duplicated verbatim across all pages and kept in
sync by hand (explicit trade-off of the no-build constraint). One `style.css`
and one `script.js` serve every page.

- Active nav state: `<body data-page="about">` etc.; CSS `.is-active` on the
  matching `.nav__link` / `.menu__link`.
- Footer links updated: About, Services, Projects, News, Careers, Contact all
  point to real files; service links point to `services.html#<anchor>`.
- Cross-links: "See open roles" → `careers.html`; office cards → `contact.html#...`;
  article rows → toggle the detail block on `news.html` (no separate detail page);
  project cards → `project.html?id=...`.
- Page-load entrance on every page: hero masked-line title reveal + fixed
  curtain wipe (covers viewport, slides up and is removed after its end state).
  Skipped under reduced motion and when GSAP is unavailable.

## 4. Design system

Reuse existing tokens, type scale (Archivo/Hanken), buttons, masks, section-head,
stats grid, focus list, media reveals. New CSS components are built only for
page-specific needs and follow the existing `.block__elem` naming and token
usage:

- `.filter` pill bar (projects + news) with `.is-active` and `aria-pressed`.
- `.role` rows (careers), `.news-*` block/list, `.office` cards (contact),
  `.form` fields/errors/success, `.gallery`/`.detail-*` meta grid + crumbs (project).

## 5. Animation inventory (GSAP + ScrollTrigger + Lenis)

Global (runs on every page via existing discovery):

- Page-load: hero mask lines + curtain wipe (new, shared).
- `[data-fade]`, `.mask__in`, `[data-media]`, `[data-count]` — existing
  `initReveals` behavior already applies wherever these attributes are placed.

New, per area:

- **Marquee (Home):** label `[data-fade]`; track scroll duration reacts to Lenis
  velocity (CSS variable updated on scroll, clamped min/max), paused on hover.
- **Services rows (Home):** grouped/ staggered entrance — each `.srv` rises
  (y + autoAlpha) on section trigger; index number fades in separately. The
  floating hover preview is unchanged.
- **Stats (Home):** `.stat` items stagger in (already `data-fade`); counters
  unchanged.
- **Quotes stage (Home):** `.quotes__stage` entrance reveal.
- **Footer (all pages):** `.footer__cols` children stagger fade; `.footer__watermark`
  slow `y` parallax scrubbed between footer top/bottom; footer link underline/title
  hover somewhere handled in CSS.
- **Projects (Home + projects.html):** cards stagger; `[data-media] img` gets a
  subtle inner parallax scrub (`yPercent` ±6) in addition to the existing curtain.
- **Project detail:** meta grid `[data-fade]`; gallery images `[data-media]` curtain.
- **Roles (careers):** `.role` rows stagger entrance + hover lift/arrow.
- **News (news.html):** detail block `[data-fade]`; `.news-row` stagger.
- **Contact:** form + office cards stagger.

Rules enforced by the shared layer: every entrance is `once: true`;
ScrollTrigger is killed for that element after completion; counters/curtain skip
under reduced motion; parallax and velocity-reactive marquee are dropped under
reduced motion.

## 6. Interactions

- Magnetic buttons (`[data-magnetic]`) reused on every page.
- Projects filter: buttons toggle `.project` visibility by sector; hidden via
  `display` toggling (instant) — no tween on layout. Accessible labels +
  `aria-pressed`.
- News filter: category pills filter article list similarly.
- Contact form: required-field validation with inline error text; on valid
  submit builds a `mailto:` fallback link and shows an animated success state
  (no backend). Buttons use `type=submit`.
- Role/news rows: hover arrow + background shift (CSS).
- Footer links: underline draw hover (CSS).

## 7. Placeholder data & assets

All copy authored in Metric's voice (short, direct, construction-grade).
All imagery from the already-verified Unsplash pool (hero `w=1600`, thumbs
`w=900`, `loading="lazy"`, meaningful `alt`). Everything is swappable by the
client — structure and tokens are the deliverable.

- Projects dataset: 6 items — slug, title, year, sectors, location, value,
  duration, summary, scope bullets, 3–4 stats, gallery (3–4 images), one hero
  image. `project.html` renders from `projects` keyed by `?id=`.
- News: 6 items — category, date, title, excerpt, body paragraphs.
- Roles: 6 roles — title, location, type, blurb.
- Offices: Vancouver / Scarborough / Calgary (match footer) + key contacts.

## 8. Testing / verification

Playwright, batched, over every page:

- 0 console errors / warnings after each interaction path.
- No horizontal overflow at 390 / 768 / 1024 / 1440.
- Entrances complete once and stay (scroll up → still in end state).
- Reduced-motion: all static/instant, no parallax, counters at final.
- Filters (projects, news) show/hide correctly; `aria-pressed` reflects state.
- Contact form: empty submit shows errors; valid submit shows success; mailto
  fallback present.
- `project.html` renders for `?id=slug` and for an unknown id (fallback).
- Home regression: quote slider, services float, magnetic, mobile menu, anchors.
- Cross-file links resolved (headers/footers point at real files).

## 9. Deliverables

New: `about.html`, `services.html`, `projects.html`, `careers.html`,
`news.html`, `contact.html`, `project.html`.
Updated: `index.html`, `style.css`, `script.js`.

## 10. Non-goals

No build step, no framework/SPA routing, no backend, no CMS, no new visual
world, no real legal/privacy pages, no real photography.