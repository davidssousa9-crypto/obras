# Metric Multi-page Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Metric Civil vanilla landing page into a complete 8-page company site plus a full GSAP/ScrollTrigger/Lenis motion layer, verified per page with Playwright.

**Architecture:** One shared `style.css` + `script.js` serve every page (client can double-click any `.html` open). The header/curtain/menu/footer shell is hand-duplicated verbatim across pages and kept in sync by copying from `index.html`. Each new page is one focused HTML file whose page-specific CSS/JS hooks get appended to the two shared files. A dev-only Playwright harness under `tests/` (separate from the client deliverable) drives all verification.

**Tech Stack:** Vanilla HTML/CSS/JS, GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.14 (CDN), Playwright (dev-only, `tests/`).

**Spec:** `docs/superpowers/specs/2026-10-09-multipage-build-design.md`

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include this section:

- Vanilla HTML/CSS/JS. No build step, no frameworks, no package manager. Pages are standalone files the client can double-click open (`file://`). The `tests/` dir is dev tooling only and never part of the deliverable.
- Animation stack stays GSAP + ScrollTrigger + Lenis. No framer-motion import.
- Entrances are one-way (`once: true`), never replay on scroll-back.
- `prefers-reduced-motion: reduce` renders everything instant/static.
- No layout-thrash animation: never tween `height`/`width`/`top`/`left`.
- Reuse the existing design system; no new visual world.
- Design system tokens and `.block__elem` naming; new CSS components follow existing patterns and live in `style.css`.
- All imagery from the already-verified Unsplash pool already used in `index.html` (photo IDs below); hero crops `w=1600`, thumbs `w=900`, `loading="lazy"`, meaningful `alt`. No new/guessed URLs except these IDs at the same image host.
  - Pool IDs: `1711618734250` (earthworks), `1638207849658` (utilities), `1757030689705` (roadworks/paving), `1746099053648` (remediation), `1723369962534` (aerial interchange), `1761896118911` (harbour line), `1517089596392` (quarry), `1731251097551` (route 7), `1766791789983` (skyline foundations).
- All copy authored in Metric's voice: short, direct, construction-grade. No lorem ipsum, no placeholder text. Non-goals: no real legal/privacy pages, no real photography (people/avatars use monograms, never photos).
- Every entrance ScrollTrigger is killed for that element after completion. Existing `initReveals` already does this; new per-page entrances follow the same pattern.
- `script.js` is one file for all pages; all feature inits are functions registered in the boot section at the bottom, each guarded by existence checks.
- Shell sync: header, curtain, scroll-progress bar, mobile menu, grain overlay and footer are copied verbatim from `index.html` (Task 2 edits it once; later page tasks copy those blocks and change only `data-page`, active `data-nav`, and page content).

## Review Focus

The five input classes most likely to bite a person using this software (each is exercised by a test in the task that owns the code):

1. **CDN/GSAP unavailable (offline `file://`):** every page must still render readable static content with no curtain, no stuck hidden elements, and decorative `[data-fade]` content visible. (Task 1 base check + Task 2 curtain)
2. **Reduced-motion user:** no entrance/marquee/parallax, counters land at final values, everything visible instantly. (Task 1 base check)
3. **Unknown/typo `?id=` on `project.html`:** must render the first project without a broken gallery/nav. (Task 10)
4. **Contact form: empty submit and unparsable email:** inline errors appear, nothing emailed; valid submit shows success and a `mailto:` fallback exists. (Task 9)
5. **Narrow viewport with oversized fixed metadata (hero coords, watermark `nowrap`, breadcrumbs at 390px):** no horizontal overflow at 390/768/1024/1440. (Task 1 base check)

---

### Task 1: Playwright verification harness

Sets up dev-only infra (`tests/`) so every later task has a concrete PASS/FAIL gate. Initializes git and takes the baseline commit (repo is not yet a git repo).

**Files:**
- Create: `tests/package.json`
- Create: `tests/serve.mjs`
- Create: `tests/verify.mjs`

**Interfaces:**
- Consumes: `index.html`, `style.css`, `script.js` as they exist today.
- Produces:
  - `npm test -- <page...>` (runs `node verify.mjs`, passing through page args). Pages are keyed by filename without extension: `index`, `about`, `services`, `projects`, `careers`, `news`, `contact`, `project`. With no args, all existing page files in the repo root are checked.
  - `verify.mjs` behavior: starts a static server on an ephemeral port, opens Chromium, runs **base checks** on every page, then **per-page checks** for pages present in the filesystem. Exits non-zero on any failure; prints one line per check (`PASS`/`FAIL <page> <check>: <detail>`).
  - Base check helpers (functions `verify.mjs` exports): `consoleClean`, `noOverflow`, `entrancesOnce`, `reducedMotionStatic`, `noGsapStillRenders`.

- [ ] **Step 1: `git init` baseline**

Run in repo root: `git init` then `git add -A && git commit -m "chore: baseline landing page"`. Expected: clean working tree, baseline commit exists.

- [ ] **Step 2: Write the failing harness checks**

`npm install` inside `tests/` after writing `tests/package.json`:

```json
{
  "name": "metric-tests",
  "private": true,
  "scripts": { "test": "node verify.mjs" },
  "devDependencies": { "playwright": "^1.45.0" }
}
```

`tests/serve.mjs`: a static file server (~30 lines, `node:http`/`fs`) serving the repo root with correct MIME types, `Cache-Control: no-store`, URL-decoded paths, and `.html` fallback for `/` → `index.html`.

`tests/verify.mjs` implements, for each requested page file that exists:
- **consoleClean** — collect every `page.on('console')` message of type `error` or `warning` across load + interactions; fail if any.
- **noOverflow** — for viewport widths `[390, 768, 1024, 1440]` (height 900), reload and assert `document.documentElement.scrollWidth <= window.innerWidth + 1`.
- **entrancesOnce** — viewport 1440: load, wait 1600ms, scroll to bottom (use `window.__lenis` if present else `window.scrollTo`), wait 1500ms, scroll back to top, wait 800ms, then assert for a sample of `[data-fade]`, `.mask__in`, `[data-media]`: computed `opacity >= 0.99` and no `inset(...%)` clip-path / no `translateY` offset (inline transforms at end state). Implement via one `page.evaluate` sampling the first 3 of each selector.
- **reducedMotionStatic** — `page.emulateMedia({ reducedMotion: 'reduce' })`, load, wait 400ms: assert `[data-fade]` opacity `>= 0.99`, every `[data-count]` text equals its formatted `data-target` (`toLocaleString('en-US')`, rounded), and `[data-media]` has no clip-path.
- **noGsapStillRenders** — on load, `page.route('**/gsap*.js')`, `'**/ScrollTrigger*'`, `'**/lenis*'`, `'**cdn.coverr.co**'`, `'**images.unsplash.com**'` all `route.abort()`; then assert `document.title` matches the page, `body` text length > 200, and every `[data-fade]` has `opacity >= 0.99` (nothing stuck hidden).

- [ ] **Step 3: Run harness against `index.html` and confirm the baseline passes**

Run: `npm test -- index`
Expected: all base checks PASS for `index`, exit 0. (Curtain check is intentionally deferred to Task 2 — absent `[data-curtain]` counts as pass.)

- [ ] **Step 4: Commit**

```bash
git add tests
git commit -m "test: add Playwright verification harness"
```

---

### Task 2: Shared shell — real links, active nav, page curtain, page-hero component

Refactors `index.html` into the canonical shell that every page duplicates, and lands the shell's shared CSS/JS once. `style.css` and `script.js` get their first multi-page additions; all later pages reuse the `data-page`/`data-nav`/`data-curtain`/`page-hero` hooks.

**Files:**
- Modify: `index.html`
- Modify: `style.css` (append section `18. PAGE SHELL` and reduce `.nav__list` gap clamp max to `2.4rem` at `@media (max-width:1120px)`)
- Modify: `script.js` (add `initPageLoad`, `initActiveNav`, `initFooter`; register in boot)

**Interfaces:**
- Consumes: Task 1 harness.
- Produces (consumed by every later page task):
  - Shell blocks in `index.html`: `<div class="grain">`, `<div class="progress" data-progress>`, `<div class="curtain" data-curtain aria-hidden="true">` inserted before `<header>`, `<header data-header>`, `<div class="menu" id="mobile-menu" data-menu aria-hidden="true">`, `<footer class="footer" id="contact">`.
  - Nav protocol: nav and menu links carry `data-nav="home|about|services|projects|careers|news|contact"`; nav links point to real files (`about.html`, `services.html`, `projects.html`, `careers.html`, `news.html`, `contact.html`) on *every* page including home. On home, the in-page anchors (`#about`, `#services`, `#projects`, `#careers`) remain only for the hero scroll link and inline CTAs. Desktop nav gains a `News` link (6 links total).
  - Body tag: `<body data-page="home">` (each page sets its own).
  - `data-hero-line` masked lines on every inner-page hero title; hero masked-line entrance already exists in `initReveals`.
  - `.page-hero` component (markup + CSS): `<section class="page-hero">` with `container`, `eyebrow` (`data-fade`), `h1.display.page-hero__title` composed of `.mask > .mask__in[data-hero-line]` lines, and a `.page-hero__meta` bar (`data-fade`) topped with a `.page-hero__crumb` link back to the relevant index page. CSS: `padding-top: calc(9rem)` (clears fixed header, scaled by `clamp`), big display type, bottom border `--line`, `.section--paper` compatible.
  - Footer links updated: Company column = About/Projects/Careers/News; Services column = `services.html#earthworks`, `#utilities`, `#roadworks`, `#environmental`; Resources column stays `#` (non-goal); Contact column = `mailto:`/`tel:` + 3 office lines; "See open roles" CTA → `careers.html`.
  - `initPageLoad()` in `script.js`: if `!hasGSAP || reduced` return; tween curtain (`[data-curtain]`) `yPercent: 0 → -100` (`power4.inOut`, 1.0s, no delay) and on `onComplete` `gsap.set(curtain, {display:'none'})`. Hero `[data-hero-line]` tween already in `initReveals`; keep.
  - `initActiveNav()`: read `document.body.dataset.page`; for each `[data-nav]` add `.is-active` when its value matches. Ignore home (no link has `data-nav="home"`).
  - `initFooter()`: `.footer__cols` children: `from {y:36; autoAlpha:0}` → `to {y:0; autoAlpha:1}` stagger 0.08, trigger `.footer__cols`, `start:'top 85%'`, `once:true`. `.footer__watermark`: `gsap.fromTo(watermark, {yPercent: 18}, {yPercent:-18, ease:'none', scrollTrigger:{trigger:footer, start:'top bottom', end:'bottom top', scrub:true}})`; kill/guard with `once` not needed (scrub), but skip when `reduced`.
- CSS additions: `.curtain` (fixed inset-0, z-index 500, background `--ink`, `display:none` under `@media (prefers-reduced-motion: reduce)`), `.nav__link.is-active::after scaleX(1)` and color `--bone`, `.menu__link.is-active .menu__word` accent underline, `.page-hero*` set, `.page-hero__crumb`, and footer underline-draw hover: `.footer__col a` gets the same `span::after`-style underline scaleX technique used by `.nav__link` (positioned `span` wrapper on the footer link text, `::after scaleX(0)→1` on hover, accent color).

- [ ] **Step 1: Write the failing checks (curtain + nav)**

Add per-page checks to `verify.mjs` keyed `index`:
- `curtainOnce`: load, wait 1800ms, assert `element('[data-curtain]')` is not visible (offsetParent null, since `display:none` after onComplete).
- `activeNavStated`: assert every `[data-nav]` el has a non-empty href and (for non-home pages only) exactly one `[data-nav]` matches `document.body.dataset.page` and carries `.is-active`.

Run: `npm test -- index` — expected: `activeNavStated` FAILS (`data-nav` attrs and real links don't exist yet).

- [ ] **Step 2: Edit `script.js` — add `initPageLoad`, `initActiveNav`, `initFooter` and register in boot**

Signatures above. Guard every one with DOM-existence checks and the `reduced`/`hasGSAP` rules exactly as listed.

- [ ] **Step 3: Edit `index.html` into the canonical shell**

Add `.curtain`, `data-page="home"`, `data-nav` on all desktop + mobile nav links, real file hrefs (About/Services/Projects/Careers/News/Contact), update footer links per the protocol, keep all existing sections, add `News` link to desktop nav.

- [ ] **Step 4: Edit `style.css` — shell CSS + nav gap tweak + reduced-motion curtain**

Per Interfaces. Reuse tokens only.

- [ ] **Step 5: Run checks**

Run: `npm test -- index`
Expected: `curtainOnce`, `activeNavStated`, and all base checks PASS; exit 0.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css script.js
git commit -m "feat(shell): real nav links, active state, page-load curtain, page-hero component"
```

---

### Task 3: Home motion layer

Adds the remaining index-only animation inventory from spec §5 to `index.html`'s existing sections. No markup changes beyond attribute hooks already implied.

**Files:**
- Modify: `index.html` (add `data-parallax` to the 6 `.project__media` containers)
- Modify: `script.js` (add `initMarqueeVelocity`, `initSrvEntrance`, `initProjectParallax`; register in boot)
- Modify: `style.css` (CSS var plumbing for marquee; `.nav__list` responsive gap already done in Task 2)

**Interfaces:**
- Consumes: Task 2 shell, `[data-srv]`, `[data-media]`, `.marquee__track`, `.project__media` existing markup.
- Produces (consumed by Task 7 projects.html): `data-parallax` attribute = "apply inner `[data-parallax] img` parallax scrub".
  - `initMarqueeVelocity()`: listen on Lenis `scroll` (via existing `window.__lenis`), and write to `document.documentElement.style` a CSS var `--marquee-duration` computed as `Math.max(20, Math.min(70, 44 / (1 + Math.abs(v))))` seconds from lenis velocity (trailing `s`). CSS: `.marquee__track { animation-duration: var(--marquee-duration, 44s); }`. Skip if `reduced` or no lenis. Never tween layout.
  - `initSrvEntrance()`: `[data-srv]` → `fromTo {y:44, autoAlpha:0} to {y:0, autoAlpha:1, duration:0.9, ease:'power3.out', stagger:0.1, scrollTrigger:{trigger:'[data-services]', start:'top 78%', once:true}}`; separate `gsap.to` for `.srv__index` children: `from {autoAlpha:0, y:14}` fade in `delay:0.35` after parent, same trigger.
  - `initProjectParallax()`: for each `[data-parallax] img`: `gsap.fromTo(img, {yPercent: -6, scale: 1.12}, {yPercent: 6, ease:'none', scrollTrigger:{trigger:el, start:'top bottom', end:'bottom top', scrub:true}})`; skip when `reduced`. CSS hover `scale(1.07)` stays but is overridden by GSAP transform; do not remove. (Parallax baked via `scale:1.12` so no edges show.)
  - `initQuotesReveal()`: `.quotes__stage` → `fromTo {y:48, autoAlpha:0} to {y:0, autoAlpha:1, duration:1, ease:'power3.out', scrollTrigger:{trigger:'.quotes__stage', start:'top 88%', once:true}}`; skip when `reduced`.

- [ ] **Step 1: Write the failing checks (marquee + srv + parallax)**

Add per-page checks keyed `index` in `verify.mjs`:
- `marqueeReactive`: with Lenis present, `page.evaluate` a synthetic wheel/large scroll, wait 300ms, assert `getComputedStyle(document.documentElement).getPropertyValue('--marquee-duration')` is non-empty and differs from un-scrolled default.
- `srvEntranceOnce`: after `entrancesOnce` scroll pass, all `[data-srv]` have `opacity >= 0.99`.
- `projectParallax`: after scrolling such that a `[data-project]` bottom passes viewport top, assert its `[data-parallax] img` inline `transform` is a matrix whose `translateY` ≠ 0 (scrub active). Under `reducedMotionStatic`, assert no inline transform on that img.
- `quotesStageEntrance`: after the `entrancesOnce` scroll pass, `.quotes__stage` computed `opacity >= 0.99`.

Run: `npm test -- index` — expected: `projectParallax` FAILS (no `data-parallax` yet).

- [ ] **Step 2: Edit `script.js` — add the four inits and register**

Per Interfaces signatures. All guarded by `reduced`/existence; never tween layout.

- [ ] **Step 3: Edit `index.html` — add `data-parallax` to the 6 project media containers**

- [ ] **Step 4: Edit `style.css` — marquee CSS var**

`.marquee__track { animation-duration: var(--marquee-duration, 44s); }`

- [ ] **Step 5: Run checks**

Run: `npm test -- index`
Expected: all index checks PASS (including new ones), exit 0.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css script.js
git commit -m "feat(home): velocity-reactive marquee, services stagger, project parallax"
```

---

### Task 4: About page

**Files:**
- Create: `about.html`
- Modify: `style.css` (append `19. ABOUT`)
- Modify: `script.js` (register no new init; page uses existing `initReveals`, `initCounters` via `data-count`, `initFooter`)

**Interfaces:**
- Consumes: Task 2 shell blocks (copy header/curtain/menu/footer verbatim from `index.html`, set `<body data-page="about">`, `.is-active` handled by JS), `.page-hero`, `[data-fade]`, `.mask__in[data-hero-line]`, `data-count`, `.section--paper`, `.display`, `.eyebrow`, `.label`, `.section-head`, `.focus`, `.stat`.
- Produces: page content sections with these hooks (consumed by Task 11 link-resolution + Task 1 verify when file exists):
  - `.page-hero` — eyebrow "Who we are", masked title lines, crumb → index.
  - `.about-story` (`section--paper`) — two-col: heading `.display` + lede `[data-fade]`.
  - `.about-values` (`bg --ink`) — `.section-head` + 4-col `.focus` values grid (reuse `.focus` classes, `data-fade` items).
  - `.about-caps` (`section--paper`) — `.section-head` + `.stats__grid` with 4 `.stat` counters (`data-count`).
  - `.about-team` (`bg --ink`) — `.section-head` + leadership list: rows (`.team-row`) with monogram block (initials, never photos), name, role, blurb; hover arrow like `.srv`.
  - `.about-timeline` (`section--paper`) — `.section-head` + vertical list of `.tl-item` (year `.tl-item__year`, title, text) with `data-fade`.
  - `.about-cta` — reuse `.footer__top`-style CTA block (label + `display` title + `.btn btn--solid btn--lg` to `careers.html`).

- [ ] **Step 1: Write the failing checks**

Add per-page checks keyed `about` in `verify.mjs`: alias to base checks only (consoleClean, noOverflow, entrancesOnce, reducedMotionStatic, noGsapStillRenders). `activeNavStated` runs generically for any page with `data-page`.

Run: `npm test -- about` — expected: ALL checks FAIL with page not found (404 from server).

- [ ] **Step 2: Build `about.html`**

Copy the shell from `index.html` (Task 2 version). Replace `<main>` content with the sections above, every image from the pool (story/hero crop `w=1600`, thumbs `w=900`, `loading="lazy"`, real alt), counters using `data-count` with `data-target`, all copy in Metric voice.

- [ ] **Step 3: Append the `.about-*`, `.team-row`, `.tl-item` CSS to `style.css`**

Follow `--ink`/`--paper` alternation and `.block__elem` naming; reuse `.focus`/`.stat`/`.srv` patterns; no new visual world. `.team-row` hover arrow transitions only (transform/color).

- [ ] **Step 4: Run checks**

Run: `npm test -- about`
Expected: all about checks PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add about.html style.css
git commit -m "feat(about): story, values, capabilities, team, timeline"
```

---

### Task 5: Services page

**Files:**
- Create: `services.html`
- Modify: `style.css` (append `20. SERVICES PAGE`)
- Modify: `script.js` (no new init)

**Interfaces:**
- Consumes: Task 2 shell, `.page-hero`, `[data-fade]`, `.mask__in[data-hero-line]`, `.section--paper`, `.label`, `.section-head`, `.focus`, buttons.
- Produces:
  - `.page-hero` — eyebrow "What we do", masked lines, crumb → index.
  - `.svc-page` intro (`bg --ink`): `.svc-intro` (heading + lede).
  - Four `.svc-block` sections, `id="earthworks"`, `id="utilities"`, `id="roadworks"`, `id="environmental"` (so footer `services.html#<anchor>` deep links resolve). Each: `.section-head` (label `##`), `figure.svc-block__media` `[data-media]` with pool image (`w=1600`), `h2.display` title, lede `[data-fade]`, `.focus` capability grid (4 items), and a `.stat` counters row (3 stats, `data-count`) for that service.
  - `.svc-process` (`section--paper`) — `.section-head` + numbered `.process` list (4 `.process__item` `data-fade`: number, title, text).
  - `.svc-cta` — CTA block ("Get a site assessment") → `contact.html`.

- [ ] **Step 1: Write the failing checks**

Add per-page checks keyed `services`: base checks + `anchorsResolve`: `document.querySelectorAll('main a[href^="#"]')` each resolves in-page; and every `#earthworks|#utilities|#roadworks|#environmental` id exists.

Run: `npm test -- services` — expected: ALL FAIL (404).

- [ ] **Step 2: Build `services.html`** (shell copy + sections; ids and pool images per Interfaces; Metric-voice copy)

- [ ] **Step 3: Append `.svc-block*`, `.process*` CSS** (reuse tokens/patterns)

- [ ] **Step 4: Run checks**

Run: `npm test -- services` — expected: ALL PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add services.html style.css
git commit -m "feat(services): four service blocks, process, CTA"
```

---

### Task 6: Careers page

**Files:**
- Create: `careers.html`
- Modify: `style.css` (append `21. CAREERS`)
- Modify: `script.js` (add `initRoleEntrance`; register in boot)

**Interfaces:**
- Consumes: Task 2 shell, `.page-hero`, `[data-fade]`, `.section--paper`, `.label`, `.section-head`, `.focus`.
- Produces:
  - `.page-hero` — eyebrow "Careers", masked lines, crumb → index.
  - `.careers-story` (`section--paper`) — heading + lede + pull stat `[data-count]`.
  - `.careers-benefits` (`bg --ink`) — `.section-head` + `.focus` benefits grid (4–5 items).
  - `.roles` (`bg --ink`) — `.section-head` + `.role` rows list: 6 rows, each `<a class="role" href="mailto:hello@metriccivil.ca?subject=Application: <Role title>">` with `.role__title`, `.role__meta` (location · type), `.role__blurb`, `.role__arrow` (`↗`, hidden on touch). Hover: bg shift `--paper` on the row + arrow/kbe accent (CSS).
  - `.careers-cta` — `.section-head`-style CTA ("Don't see your role?") → `contact.html`.
  - `initRoleEntrance()`: `.role` rows `fromTo {y:28, autoAlpha:0} to {y:0, autoAlpha:1, duration:0.8, ease:'power3.out', stagger:0.07, scrollTrigger:{trigger:'.roles .section-head', start:'top 85%', once:true}}`.

- [ ] **Step 1: Write the failing checks**

Add per-page checks keyed `careers`: base checks + `roleRowsPost`: exactly 6 `.role` rows; each `.role` has an email `mailto:` href.

Run: `npm test -- careers` — expected: ALL FAIL (404).

- [ ] **Step 2: Build `careers.html`** (shell + sections + 6 roles, Metric-voice copy)

- [ ] **Step 3: Append `.role*`, `.careers-*` CSS**

- [ ] **Step 4: Add `initRoleEntrance` to `script.js` and register in boot**

- [ ] **Step 5: Run checks**

Run: `npm test -- careers` — expected: ALL PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add careers.html style.css script.js
git commit -m "feat(careers): culture, benefits, role list, CTA"
```

---

### Task 7: Projects page + shared filter

Lands the reusable filter protocol in `script.js` (news.html consumes it in Task 8) and the filterable projects grid.

**Files:**
- Create: `projects.html`
- Modify: `style.css` (append `22. PROJECTS PAGE` + `.filter` block)
- Modify: `script.js` (add `initFilterButtons`; register in boot)

**Interfaces:**
- Consumes: Task 2 shell, `.page-hero`, `[data-fade]`, `[data-media]`, Task 3 `data-parallax`, `.project` card styles.
- Produces (consumed by Task 8, Task 10, Task 11):
  - `initFilterButtons(rootSel)` in `script.js`: `var root = document.querySelector(rootSel); if (!root) return; var btns = root.querySelectorAll('[data-filter]'); var items = root.querySelectorAll('[data-filter-item]');` click handler: set `.is-active` + `aria-pressed="true|false"` on buttons; for each item toggle `item.classList.toggle('is-hidden', mode !== 'all' && cats.indexOf(mode) === -1)` where `cats = item.getAttribute('data-filter-item').split(' ')`. Visibility toggled via `display` only (`.is-hidden { display:none }`) — no layout tween.
  - Filter markup: `.filter` (wrap allows scroll on mobile) with `.filter__btn` buttons: `data-filter="all|roadworks|utilities|earthworks|environmental"`, `aria-pressed`, `.is-active` default on `all`.
  - Grid markup: `.projects__grid` clone of home's 6 projects as **links**: `<a class="project" href="project.html?id=<slug>" data-fade>` with `.project__media[data-media][data-parallax]` img (pool, `w=1600`), `.project__overlay` title/year/tags; each with `data-filter-item="<sector...>"` and `data-slug="<slug>"`. Slugs: `northgate-interchange`, `harbour-line-utilities`, `granite-ridge-quarry`, `route-7-resurfacing`, `skyline-foundations`, `delta-wetland-restoration` (order matches home).
  - Cards get stagger entrance: reuse existing `[data-fade]`.

- [ ] **Step 1: Write the failing checks (filter protocol)**

Add per-page checks keyed `projects`:
- `filterWorks`: click a sector button (e.g. `utilities`): expected ≥1 `.project` with `is-hidden` and 0 visible `.project` lacking the sector in `data-filter-item`; `aria-pressed` true only on clicked button; click `all` → 0 `is-hidden`.
- `cardsLinkToDetail`: every `.project` href matches `project.html?id=<slug>` and `data-slug` equals the last URL segment.

Run: `npm test -- projects` — expected: ALL FAIL (404).

- [ ] **Step 2: Add `initFilterButtons` to `script.js`** (exact protocol above) and register in boot with `initFilterButtons('[data-filter-root]');` — add `data-filter-root` attribute to the filter's wrapper on both projects + news pages.

- [ ] **Step 3: Build `projects.html`** (shell + `.page-hero` + `.filter` + 6 link cards per Interfaces; copy stays Metric-voice)

- [ ] **Step 4: Append `.filter*`, `.projects-page*`, `.project.is-hidden` CSS**

Reuse `.project__media`/`.project__overlay` styles; `.project` needs `display:block` when used as `<a>`. `.filter` = full-bleed row of pill buttons (border `--line`, `.is-active` → `background: var(--bone); color: var(--ink)`).

- [ ] **Step 5: Run checks**

Run: `npm test -- projects`
Expected: all projects checks PASS (including `filterWorks`, `cardsLinkToDetail`), exit 0.

- [ ] **Step 6: Commit**

```bash
git add projects.html style.css script.js
git commit -m "feat(projects): filterable grid, shared filter protocol, detail links"
```

---

### Task 8: News page

**Files:**
- Create: `news.html`
- Modify: `style.css` (append `23. NEWS`)
- Modify: `script.js` (add `initNewsDetail`; register in boot)

**Interfaces:**
- Consumes: Task 7 `initFilterButtons` + `data-filter`/`data-filter-item` protocol, Task 2 shell, `.page-hero`, `[data-fade]`, `.section--paper`, `.section-head`.
- Produces:
  - `.page-hero` — eyebrow "News", masked lines, crumb → index.
  - `.news-featured` (`bg --ink`) — detail block `<article class="news-detail" data-news-detail>` with `[data-news-title]`, `[data-news-meta]` (category · date), `[data-news-excerpt]`, `[data-news-body]` (2–3 `p`), and a cover image container `[data-news-cover]` (`data-media`) whose `img` swaps per article. `[data-fade]` on the block.
  - `.news-list` (`section--paper`) — `.section-head` + `.filter` (categories: `all|company|projects|team`) + `.news-row` list: 6 `<article class="news-row" data-filter-item="<category>" data-news-id="<n>">` with title, category tag, date, excerpt line, arrow. `.news-row` is a `<button type="button">` (swap detail, no navigation). Rows `data-fade`, stagger via individual `data-fade`.
  - `initNewsDetail()` in `script.js`: from the 6 inline `<template>`-free approach — data literal `NEWS_ITEMS` array of 6 `{id, category, date, title, excerpt, cover, body[]}` (defined in `script.js`); clicking a `.news-row[data-news-id]` sets the detail's title/meta/excerpt/body/cover (update `alt` too) and moves detail into view (`focus()`/scroll). First article shown on load.

- [ ] **Step 1: Write the failing checks (news swap + filter)**

Add per-page checks keyed `news`:
- `newsFilters`: click a category pill → `.news-row.is-hidden` count > 0; `all` restores.
- `newsDetailSwaps`: click row with `data-news-id="2"` → `[data-news-title]` text equals that row's title; scrollIntoView fired (assert element scrolled to top of viewport).

Run: `npm test -- news` — expected: ALL FAIL (404).

- [ ] **Step 2: Add `initNewsDetail` + `NEWS_ITEMS` to `script.js`** (6 Metric-voice articles; each body 3 short paragraphs) and register in boot. Categories: `company`, `projects`, `team`.

- [ ] **Step 3: Build `news.html`** (shell + detail block + filter + 6 rows; images from pool `w=900`)

- [ ] **Step 4: Append `.news-*`, `.news-row*`, `.is-hidden` CSS** (reuse `.filter`/`.role` hover patterns)

- [ ] **Step 5: Run checks**

Run: `npm test -- news` — expected: all news checks PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add news.html style.css script.js
git commit -m "feat(news): featured detail with category filter and click-to-swap"
```

---

### Task 9: Contact page + form validation

**Files:**
- Create: `contact.html`
- Modify: `style.css` (append `24. CONTACT`)
- Modify: `script.js` (add `initForm`; register in boot)

**Interfaces:**
- Consumes: Task 2 shell, `.page-hero`, `[data-fade]`, `.section--paper`, `.section-head`.
- Produces (consumed by Task 11):
  - `initForm()` in `script.js` — operates on `[data-form]`. Fields inside with `data-field`; each has a `data-error` element (hidden, visible on validation failure). Validates: `name` non-empty; `email` matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; `message` non-empty. On submit (`submit` event, button `type="submit"`): preventDefault; toggle `.is-error`/`.is-valid` classes; if valid, build `mailto:hello@metriccivil.ca?subject=<name>: Website enquiry&body=<message>` into a real `<a data-mailto>` appended to the form, set `.form__success` visible (`.is-visible`), and hide the fieldset. If invalid, inline errors show; focus first invalid. Reduced-motion agnostic (no animation dependence).
  - `.office` cards: 3 `<article class="office" data-fade>` — Vancouver / Scarborough / Calgary (address + phone + email lines matching footer), `id="vancouver" | "scarborough" | "calgary"`. Each is a link? No — static card; the `contact.html#alvarez`… cross-links from footer/index resolve to these ids via `#`. Add `id` values so `contact.html#vancouver` etc. are reachable.
  - `.contact-key` list (`section--paper` or `bg --ink`): key contacts (name · role · email) as rows, `data-fade`.
  - Form + offices stagger on scroll (each block `data-fade`; fine).

- [ ] **Step 1: Write the failing checks (form)**

Add per-page checks keyed `contact`:
- `formValidates`: submit empty → 3 `.form__field.is-error` (or `[data-error]` visible) and 0 success; fill bad email → email error only; fill valid → `.form__success.is-visible`, a `<a[data-mailto]>` with `href^="mailto:"`, and 0 `.is-error`.
- `officesReachable`: ids `vancouver`, `scarborough`, `calgary` exist and each `.office` has a `mailto:` and address text.

Run: `npm test -- contact` — expected: ALL FAIL (404).

- [ ] **Step 2: Add `initForm` to `script.js`** (exact validation + mailto + success protocol) and register in boot.

- [ ] **Step 3: Build `contact.html`** (shell + `.page-hero` + direct office links + form with `data-form`/`data-field`/`data-error`/`.form__success[data-success]` + key contacts; Metric-voice copy)

- [ ] **Step 4: Append `.form*`, `.office*`, `.contact-*` CSS** (fields: bottom-border `--line`, focus accent; errors accent-red? — no: keep system: `.form__error { color: var(--accent); font-size: .75rem; }`; success: `.form__success { display:none; } .form__success.is-visible { display:block }`)

- [ ] **Step 5: Run checks**

Run: `npm test -- contact` — expected: all contact checks PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add contact.html style.css script.js
git commit -m "feat(contact): validated form with mailto fallback, office cards, key contacts"
```

---

### Task 10: Project detail template + dataset

**Files:**
- Create: `project.html`
- Modify: `style.css` (append `25. PROJECT DETAIL`)
- Modify: `script.js` (add `window.METRIC_PROJECTS` dataset + `initProjectPage`; register in boot)

**Interfaces:**
- Consumes: Task 7 slugs + home project copy/sectors, Task 2 shell, `.page-hero` (crumb variant), `[data-fade]`, `[data-media]`.
- Produces:
  - `window.METRIC_PROJECTS` — array of exactly 6 objects matching the 6 slugs, each: `{ slug, title, year, sectors: [], location, value, duration, summary, scope: [], stats: [{value, suffix?, label}, x3–4], hero, gallery: [x4] }`. `hero` and `gallery` URLs built only from the pool IDs (`hero` `w=1600`, gallery `w=900`). Reuse across projects as needed.
  - `initProjectPage()` — reads `location.search` `id`; project = dataset item whose `slug === id`, else fallback to `dataset[0]`. Renders into hooks:
    - `[data-ph-hero]` img src/alt
    - `[data-ph-title]`, `[data-ph-year]`, `[data-ph-sectors]` (pill list), `[data-ph-location]`, `[data-ph-value]`, `[data-ph-duration]`, `[data-ph-summary]` (paragraph), `[data-ph-scope]` (ul), `[data-ph-stats]` (stat rows matching `.stat` markup from data)
    - `[data-ph-gallery]` — 4 `[data-media]` figures from `gallery`
    - `[data-ph-prev]` / `[data-ph-next]` — `<a href="project.html?id=<prevSlug|nextSlug>">` in array order, wrapping, with titles. Also update `document.title` and meta description with the project name.
  - Shell note: `project.html` sets `<body data-page="projects">` so the Projects nav item stays highlighted on the detail page (satisfies the generic `activeNavStated` check, which expects exactly one match on non-home pages).
  - Page structure: `.crumb` (back to `projects.html`), `.page-hero` (hero image as `[data-ph-hero]` media + title + meta grid `.detail-meta` `[data-fade]`), `.detail-body` (`section--paper`: summary + scope 2-col), `.detail-stats` (`bg --ink`, `.stats__grid`), `.gallery` (`bg --ink`, 4 `[data-media]` figures), `.detail-nav` (two big prev/next cards).

- [ ] **Step 1: Write the failing checks (render + fallback)**

Add per-page checks keyed `project`:
- `rendersDetail`: with `?id=northgate-interchange`, `[data-ph-title]` text is non-empty; `[data-ph-gallery]` has 4 figures; prev/next hrefs differ from current and match `project.html?id=`.
- `unknownIdFallsBack`: with `?id=zzz`, `[data-ph-title]` equals the dataset first project's title; gallery still 4 figures; no console errors.

Run: `npm test -- project` (verify must navigate `project.html?id=northgate-interchange` and `?id=zzz` for these keys) — expected: ALL FAIL (404).

- [ ] **Step 2: Add `window.METRIC_PROJECTS` (6 items) + `initProjectPage` to `script.js`** (exact field shape; Metric-voice summary/scope; stats with `data-count`-compatible markup so counters animate on scroll and `reducedMotionStatic` fixes to `data-target`.) Important: stats rendered as `<span data-count data-target="…">` so base checks pass on this page.

- [ ] **Step 3: Build `project.html`** (shell + crumb + hero/meta/body/stats/gallery/nav hooks only — content is rendered by JS; keep `<noscript>` fallback text in Metric voice? No — non-goal; keep static skeleton with `[data-ph-*]` elements empty/placeholder-free. The dataset lives in `script.js` so `file://` works.)

- [ ] **Step 4: Append `.detail-*`, `.gallery`, `.crumb`, `.detail-nav` CSS**

- [ ] **Step 5: Run checks**

Run: `npm test -- project`
Expected: all project checks PASS (both render + fallback), exit 0.

- [ ] **Step 6: Commit**

```bash
git add project.html style.css script.js
git commit -m "feat(project): template rendering from dataset with unknown-id fallback"
```

---

### Task 11: Cross-site integration + full verification sweep

Closes the loop: every shell link resolves, every page passes the full base + per-page battery, home regression intact. Any discovered failure is fixed here.

**Files:**
- Modify: any of `index.html`, `*.html`, `style.css`, `script.js` as fixes require.
- Modify: `tests/verify.mjs` (add cross-page `linksResolve` check)

**Interfaces:**
- Consumes: all pages, all shared files.
- Produces: the finished, verified multi-page site.

- [ ] **Step 1: Write the failing checks (link resolution + home regression)**

Add to `verify.mjs`, running against `index` after it scans every page file in the repo root:
- `linksResolve` — for every `index.html`, `about.html`, `services.html`, `projects.html`, `careers.html`, `news.html`, `contact.html`, `project.html`: every `a[href]` that is not `#`-only and not `mailto:`/`tel:` points to an existing file in the repo root or an in-page fragment on that file's page. Collect all failures before asserting.
- `homeRegression` — on `index` at 1440 with JS: quote `next` button advances `.quote.is-active`; services `mousemove` over `[data-services]` sets `.services__float` opacity > 0 (only when `finePointer`); burger opens `.menu.is-open` at 390; hero scroll link target `#about` scrolls. Run after the motion-layer pass.

Run: `npm test` (all pages) — expected: `linksResolve` FAILS (e.g. nav/footer links to pages that exist now should pass, but any stale href/`#id` gaps surface); everything else passes.

- [ ] **Step 2: Fix all link/regression failures** (repair hrefs, missing ids, broken anchors across the 8 pages)

- [ ] **Step 3: Full sweep**

Run: `npm test` (all pages)
Expected: every base check + every per-page check PASS for all 8 pages, exit 0. Confirm visible output: 8 pages, no FAIL lines.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: cross-site link resolution and full verification sweep"
```