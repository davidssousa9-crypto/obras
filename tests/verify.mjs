import { chromium } from 'playwright';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

/* =========================================================================
   METRIC. multipage build — Playwright verification harness
   -------------------------------------------------------------------------
   Usage:   node verify.mjs [page...]
   Invoked via `npm test -- <page...>` from tests/.
   Page names are repo-root HTML filenames without extension.
   No args  ⇒ every *.html file present in the repo root is checked.
   Exit     ⇒ 0 when every check PASSes, 1 when any FAILs.

   Structure
   - Every existing page runs the five BASE checks, each reported
     independently (PASS <page> <check> / FAIL <page> <check>: <detail>).
   - PAGE_CHECKS is the per-page registry: page name → array of check
     functions. It runs AFTER the base checks. Later tasks append their
     per-page checks here (e.g. curtainOnce, filterWorks, formValidates,
     rendersDetail) by editing this file.
   - A base/per-page check whose target element is absent PASSes (skips).
     A requested page with no matching .html file is skipped as a PASS —
     later tasks run this harness while their page does not exist yet.
   ========================================================================= */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const server = await createStaticServer(ROOT);
const browser = await chromium.launch();

/* ------------------------- shared helpers ------------------------- */

function scrollToBottom(page) {
  // NB: Lenis scrollTo durations are in *seconds* (not ms).
  return page.evaluate(async () => {
    if (window.__lenis && typeof window.__lenis.scrollTo === 'function') {
      await window.__lenis.scrollTo(document.body.scrollHeight, { duration: 0.9 });
    } else {
      window.scrollTo(0, document.body.scrollHeight);
    }
  });
}

function scrollToTop(page) {
  return page.evaluate(async () => {
    if (window.__lenis && typeof window.__lenis.scrollTo === 'function') {
      await window.__lenis.scrollTo(0, { duration: 0.7 });
    } else {
      window.scrollTo(0, 0);
    }
  });
}

/** True when a computed clip-path is `none` or an all-zero `inset(...)`. */
export function isEffectivelyOpen(cp) {
  if (!cp || cp === 'none') return true;
  const m = cp.match(/inset\(\s*([^)]*)\)/);
  if (!m) return false;
  const parts = m[1].split(/[\s,]+/).map((x) => parseFloat(x.replace('%', '')));
  return parts.length > 0 && parts.every((n) => Number.isFinite(n) && Math.abs(n) <= 0.5);
}

/** Parse <title> out of a raw HTML string, or '' when absent. */
function readTitle(html) {
  const m = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

/* ------------------------- base checks ------------------------- */

/**
 * consoleClean — collect every browser console message of type error or
 * warning, plus uncaught page errors, across load + scroll interactions.
 * Fail if any.
 */
export async function consoleClean(ctx) {
  const page = await ctx.openPage();
  try {
    const problems = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        problems.push(`${msg.type()}: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1600); // let reveals / counters / autoplay settle
    await scrollToBottom(page);
    await page.waitForTimeout(1200);
    await scrollToTop(page);
    await page.waitForTimeout(800);
    if (problems.length) throw new Error(problems.slice(0, 5).join(' | '));
  } finally {
    await page.close();
  }
}

/**
 * noOverflow — reload at 390/768/1024/1440 × 900 and assert no horizontal
 * scroll overflow beyond a 1px tolerance.
 */
export async function noOverflow(ctx) {
  const problems = [];
  for (const width of [390, 768, 1024, 1440]) {
    const page = await ctx.openPage();
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(800);
      const dims = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }));
      if (dims.scrollW > dims.innerW + 1) {
        problems.push(`${width}px: scrollWidth ${dims.scrollW} > innerWidth ${dims.innerW} + 1`);
      }
    } finally {
      await page.close();
    }
  }
  if (problems.length) throw new Error(problems.join('; '));
}

/**
 * entrancesOnce — viewport 1440×900. Load, scroll to bottom, scroll back to
 * top, then sample the first 3 of [data-fade], .mask__in, [data-media] and
 * assert they are in their end state: visible, un-clipped, untranslated.
 * One-way entrances must never replay/re-hide on scroll-back.
 */
export async function entrancesOnce(ctx) {
  const page = await ctx.openPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1600);
    await scrollToBottom(page);
    await page.waitForTimeout(1500);
    await scrollToTop(page);
    await page.waitForTimeout(800);

    const sample = await page.evaluate(() => {
      const read = (el) => {
        const cs = getComputedStyle(el);
        const tr = new DOMMatrixReadOnly(cs.transform);
        return { opacity: parseFloat(cs.opacity), clipPath: cs.clipPath, tx: tr.m41, ty: tr.m42 };
      };
      const out = [];
      for (const sel of ['[data-fade]', '.mask__in', '[data-media]']) {
        out.push({ sel, sampled: Array.from(document.querySelectorAll(sel)).slice(0, 3).map(read) });
      }
      return out;
    });

    const failures = [];
    for (const { sel, sampled } of sample) {
      if (!sampled.length) continue; // absent on this page → graceful pass
      sampled.forEach((s, i) => {
        if (!(s.opacity >= 0.99)) failures.push(`${sel}[${i}] opacity=${s.opacity}`);
        if (!isEffectivelyOpen(s.clipPath)) failures.push(`${sel}[${i}] clip-path=${s.clipPath}`);
        if (Math.abs(s.tx) > 0.5 || Math.abs(s.ty) > 0.5) {
          failures.push(`${sel}[${i}] transform translate(${s.tx}, ${s.ty})`);
        }
      });
    }
    if (failures.length) throw new Error(failures.join('; '));
  } finally {
    await page.close();
  }
}

/**
 * reducedMotionStatic — emulate prefers-reduced-motion: reduce before load.
 * Everything must render instant/static: [data-fade] fully visible, every
 * [data-count] already at its formatted data-target, [data-media] un-clipped.
 */
export async function reducedMotionStatic(ctx) {
  const page = await ctx.openPage({ reducedMotion: true });
  try {
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => {
      const fades = Array.from(document.querySelectorAll('[data-fade]')).map((el) => ({
        opacity: parseFloat(getComputedStyle(el).opacity),
      }));
      const counts = Array.from(document.querySelectorAll('[data-count]')).map((el) => ({
        text: el.textContent,
        expected: Math.round(parseFloat(el.getAttribute('data-target') || '0')).toLocaleString('en-US'),
      }));
      const media = Array.from(document.querySelectorAll('[data-media]')).map((el) => getComputedStyle(el).clipPath);
      return { fades, counts, media };
    });

    const failures = [];
    result.fades.forEach((f, i) => {
      if (!(f.opacity >= 0.99)) failures.push(`[data-fade][${i}] opacity=${f.opacity}`);
    });
    result.counts.forEach((c, i) => {
      if (c.text !== c.expected) failures.push(`[data-count][${i}] "${c.text}" != "${c.expected}"`);
    });
    result.media.forEach((cp, i) => {
      if (cp !== 'none') failures.push(`[data-media][${i}] clip-path=${cp}`);
    });
    if (failures.length) throw new Error(failures.join('; '));
  } finally {
    await page.close();
  }
}

/**
 * noGsapStillRenders — abort every external animation/media dependency
 * (gsap, ScrollTrigger, lenis, coverr video, unsplash images) and assert the
 * page still renders readable, static, fully-visible content.
 */
export async function noGsapStillRenders(ctx) {
  const page = await ctx.openPage({
    routeAborts: [
      '**/gsap*.js',
      '**/ScrollTrigger*',
      '**/lenis*',
      '**cdn.coverr.co**',
      '**images.unsplash.com**',
    ],
  });
  try {
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(600);
    const result = await page.evaluate(() => ({
      title: document.title,
      bodyLen: (document.body ? document.body.innerText : '').trim().length,
      hiddenFades: Array.from(document.querySelectorAll('[data-fade]'))
        .map((el) => parseFloat(getComputedStyle(el).opacity))
        .filter((o) => o < 0.99).length,
    }));

    const failures = [];
    const expected = ctx.expectedTitle;
    if (expected) {
      if (result.title !== expected) failures.push(`title "${result.title}" != "${expected}"`);
    } else if (!result.title) {
      failures.push('title is empty');
    }
    if (result.bodyLen <= 200) failures.push(`body text length ${result.bodyLen} <= 200`);
    if (result.hiddenFades > 0) failures.push(`${result.hiddenFades} [data-fade] element(s) below 0.99 opacity`);
    if (failures.length) throw new Error(failures.join('; '));
  } finally {
    await page.close();
  }
}

/* ------------------------- shell checks (shared) ------------------------- */

/**
 * curtainOnce — the page-load curtain must exist (presence assertion, so the
 * check fails before the shell lands) and must be gone ~1800ms after load
 * (initPageLoad reveals it, wipes it up, then sets display:none on complete;
 * it stays display:none by default when GSAP is absent / motion reduced).
 */
export async function curtainOnce(ctx) {
  const page = await ctx.openPage();
  try {
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    const exists = await page.evaluate(() => !!document.querySelector('[data-curtain]'));
    if (!exists) throw new Error('[data-curtain] element not found');
    await page.waitForTimeout(1800);
    const stillShown = await page.evaluate(() => {
      const el = document.querySelector('[data-curtain]');
      if (!el) return false;
      return getComputedStyle(el).display !== 'none';
    });
    if (stillShown) throw new Error('curtain still visible ~1800ms after load');
  } finally {
    await page.close();
  }
}

/**
 * activeNavStated — runs for any page in the registry. Asserts the shell's
 * active-nav protocol: <body data-page> present, every [data-nav] link has a
 * non-empty data-nav value and an href ending in .html, exactly ONE active
 * link per nav context (.nav header and .menu mobile), every .is-active
 * link's data-nav equals data-page, and home carries none.
 */
export async function activeNavStated(ctx) {
  const page = await ctx.openPage();
  try {
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const body = document.body;
      const dataPage = (body && body.dataset ? body.dataset.page : '') || '';
      const all = Array.from(document.querySelectorAll('[data-nav]'));
      const bad = [];
      all.forEach((el, i) => {
        if (!el.getAttribute('data-nav')) bad.push('[data-nav][' + i + '] empty data-nav');
        if (!/\.html$/.test(el.getAttribute('href') || '')) {
          bad.push('[data-nav][' + i + '] href "' + el.getAttribute('href') + '" does not end in .html');
        }
      });
      const active = all.filter((el) => el.classList.contains('is-active'));
      const contexts = ['.nav', '.menu']
        .map((sel) => {
          const links = Array.from(document.querySelectorAll(sel + ' [data-nav]'));
          return {
            selector: sel,
            count: links.length,
            active: links
              .filter((el) => el.classList.contains('is-active'))
              .map((el) => el.getAttribute('data-nav') || ''),
          };
        })
        .filter((c) => c.count > 0);
      return {
        dataPage: dataPage,
        count: all.length,
        bad: bad,
        activeTotal: active.length,
        activeWrong: active
          .filter((el) => el.getAttribute('data-nav') !== dataPage)
          .map((el) => el.getAttribute('data-nav')),
        contexts: contexts,
      };
    });

    const failures = [];
    if (!r.dataPage) failures.push('document.body[data-page] missing');
    if (r.count === 0) failures.push('no [data-nav] links found');
    if (r.bad.length) failures.push(r.bad.join('; '));
    if (r.dataPage === 'home') {
      if (r.activeTotal !== 0) failures.push(`home: ${r.activeTotal} active nav link(s), expected none`);
    } else if (r.dataPage) {
      for (const c of r.contexts) {
        if (c.active.length !== 1) {
          failures.push(`${c.selector}: expected exactly 1 active nav link, got ${c.active.length}`);
        } else if (c.active[0] !== r.dataPage) {
          failures.push(`${c.selector}: active data-nav "${c.active[0]}" does not match data-page "${r.dataPage}"`);
        }
      }
      if (r.activeWrong.length) failures.push(`non-matching active link(s): ${r.activeWrong.join(', ')}`);
      if (r.activeTotal !== r.contexts.length) {
        failures.push(`active total ${r.activeTotal} != ${r.contexts.length} nav context(s) with active links (one active link per context)`);
      }
    }
    if (failures.length) throw new Error(failures.join('; '));
  } finally {
    await page.close();
  }
}

/* ------------------------- home (index) checks ------------------------- */

/**
 * marqueeReactive — the marquee's CSS animation duration must be driven by
 * Lenis velocity: `--marquee-duration` on <html> stays empty until the page
 * scrolls, then is written and changes with velocity. The check samples the
 * custom property across a synthetic Lenis scroll. Fails before
 * initMarqueeVelocity lands (property never set).
 */
export async function marqueeReactive(ctx) {
  const page = await ctx.openPage();
  try {
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(700);

    const hasLenis = await page.evaluate(
      () => !!(window.__lenis && typeof window.__lenis.scrollTo === 'function')
    );
    if (!hasLenis) throw new Error('window.__lenis absent — velocity-reactive marquee cannot run');

    const before = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--marquee-duration').trim()
    );

    await page.evaluate(() => {
      window.__mqSamples = [];
      window.__mqId = setInterval(() => {
        window.__mqSamples.push(
          getComputedStyle(document.documentElement).getPropertyValue('--marquee-duration').trim()
        );
      }, 40);
      window.__lenis.scrollTo(window.innerHeight * 2, { duration: 0.8 });
    });
    await page.waitForTimeout(500);

    const samples = await page.evaluate(() => {
      clearInterval(window.__mqId);
      return window.__mqSamples;
    });

    const seen = Array.from(new Set(samples.filter(Boolean)));
    if (!seen.length) throw new Error('--marquee-duration never set during scroll');
    if (seen.every((v) => v === before)) {
      throw new Error(`--marquee-duration never deviated from "${before || '(empty)'}"`);
    }
  } finally {
    await page.close();
  }
}

/**
 * srvEntranceOnce — the four service rows must run their one-way entrance:
 * after the standard bottom→top scroll pass each `.srv` is fully opaque AND
 * carries a GSAP inline transform (proof the tween ran, not just default
 * visibility). Fails before initSrvEntrance lands.
 */
export async function srvEntranceOnce(ctx) {
  const page = await ctx.openPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1600);

    const count = await page.evaluate(() => document.querySelectorAll('[data-srv]').length);
    if (!count) throw new Error('[data-srv] elements not found');

    await scrollToBottom(page);
    await page.waitForTimeout(1200);
    await scrollToTop(page);
    await page.waitForTimeout(600);

    const result = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-srv]')).map((el) => ({
        opacity: parseFloat(getComputedStyle(el).opacity),
        inline: !!el.style.transform,
      }))
    );

    const failures = [];
    result.forEach((r, i) => {
      if (!(r.opacity >= 0.99)) failures.push(`[${i}] opacity=${r.opacity}`);
      if (!r.inline) failures.push(`[${i}] no GSAP transform (entrance did not run)`);
    });
    if (failures.length) throw new Error(failures.join('; '));
  } finally {
    await page.close();
  }
}

/**
 * projectParallax — each `[data-project] [data-parallax]` wraps its img in an
 * overflow-hidden scrub: after scrolling so the card passes the viewport top
 * the img carries an inline transform with a non-zero translateY. Under
 * reduced motion no inline transform is left on the img.
 */
export async function projectParallax(ctx) {
  const page = await ctx.openPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1200);

    const hasTarget = await page.evaluate(
      () => !!document.querySelector('[data-project] [data-parallax]')
    );
    if (!hasTarget) throw new Error('[data-project] [data-parallax] not found');

    await scrollToBottom(page);
    await page.waitForTimeout(1000);

    const active = await page.evaluate(() => {
      const wrap = document.querySelector('[data-project] [data-parallax]');
      const img = wrap ? wrap.querySelector('img') : null;
      if (!img) return { found: false };
      const inline = img.style.transform || '';
      let ty = 0;
      try {
        // GSAP emits e.g. "translate(0%, 6%) scale(1.12, 1.12)"; DOMMatrix
        // cannot resolve translate() percentages, so read the y token and
        // resolve % against the img's own height (CSS translate-y % is
        // relative to the element's height).
        const m = /translate(?:3d)?\(([^)]*)\)/.exec(inline);
        if (m) {
          const parts = m[1].split(',').map((s) => s.trim());
          const yv = parts.length >= 2 ? parts[1] : '';
          if (yv.endsWith('%')) ty = (parseFloat(yv) / 100) * img.offsetHeight;
          else if (Number.isFinite(parseFloat(yv))) ty = parseFloat(yv);
        } else {
          ty = new DOMMatrixReadOnly(inline || 'none').m42;
        }
      } catch { ty = 0; }
      return { found: true, inline, ty };
    });

    if (!active.found) throw new Error('[data-project] [data-parallax] img not found');
    if (!active.inline || Math.abs(active.ty) < 0.5) {
      throw new Error(`parallax inactive: inline transform "${active.inline}" translateY=${active.ty}`);
    }
  } finally {
    await page.close();
  }

  const rp = await ctx.openPage({ reducedMotion: true });
  try {
    await rp.setViewportSize({ width: 1440, height: 900 });
    await rp.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await rp.waitForTimeout(600);
    await scrollToBottom(rp);
    await rp.waitForTimeout(800);
    const still = await rp.evaluate(() => {
      const wrap = document.querySelector('[data-project] [data-parallax]');
      const img = wrap ? wrap.querySelector('img') : null;
      return img ? (img.style.transform || '') : 'missing';
    });
    if (still === 'missing') throw new Error('[data-project] [data-parallax] img not found (reduced)');
    if (still) throw new Error(`reduced motion: parallax left inline transform "${still}"`);
  } finally {
    await rp.close();
  }
}

/**
 * quotesStageEntrance — `.quotes__stage` must run its one-way entrance: fully
 * opaque AND carrying a GSAP inline transform after the bottom→top scroll pass.
 * Fails before initQuotesReveal lands.
 */
export async function quotesStageEntrance(ctx) {
  const page = await ctx.openPage();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1600);

    const has = await page.evaluate(() => !!document.querySelector('.quotes__stage'));
    if (!has) throw new Error('.quotes__stage not found');

    await scrollToBottom(page);
    await page.waitForTimeout(1200);
    await scrollToTop(page);
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => {
      const el = document.querySelector('.quotes__stage');
      return { opacity: parseFloat(getComputedStyle(el).opacity), inline: !!el.style.transform };
    });

    const failures = [];
    if (!(r.opacity >= 0.99)) failures.push(`opacity=${r.opacity}`);
    if (!r.inline) failures.push('no GSAP transform (entrance did not run)');
    if (failures.length) throw new Error(failures.join('; '));
  } finally {
    await page.close();
  }
}

/* ------------------------- per-page check registry ------------------------- */

/**
 * Later page tasks append per-page checks here, keyed by page name
 * (filename without extension). Each entry is an array of async check
 * functions receiving the same ctx as base checks. Example:
 *
 *   PAGE_CHECKS['projects'] = [filterWorks, ...SHELL_CHECKS];
 *   PAGE_CHECKS['contact'] = [formValidates, ...SHELL_CHECKS];
 *   PAGE_CHECKS['project'] = [rendersDetail, ...SHELL_CHECKS];
 *
 * SHELL_CHECKS is the shared spread every keyed page receives: the page-load
 * curtain protocol and the active-nav protocol are page-agnostic, so no page
 * entry ever duplicates the base checks (consoleClean, noOverflow,
 * entrancesOnce, reducedMotionStatic, noGsapStillRenders) — those run for
 * every existing page automatically.
 */
const SHELL_CHECKS = [curtainOnce, activeNavStated];

export const PAGE_CHECKS = {};
PAGE_CHECKS['index'] = [
  ...SHELL_CHECKS,
  marqueeReactive,
  srvEntranceOnce,
  projectParallax,
  quotesStageEntrance,
];
PAGE_CHECKS['about'] = [...SHELL_CHECKS];

/* ------------------------- runner ------------------------- */

const BASE_CHECKS = [consoleClean, noOverflow, entrancesOnce, reducedMotionStatic, noGsapStillRenders];

function discoverPages() {
  return readdirSync(ROOT)
    .filter((f) => f.toLowerCase().endsWith('.html'))
    .map((f) => f.slice(0, -5))
    .sort();
}

const args = process.argv.slice(2);
const requested = args.length ? args : discoverPages();

let total = 0;
let failures = 0;
const seen = new Set();

for (const page of requested) {
  const pagePath = join(ROOT, `${page}.html`);
  if (!existsSync(pagePath)) {
    console.log(`PASS ${page} (page file not found — skipped)`);
    continue;
  }
  if (seen.has(page)) continue;
  seen.add(page);

  const html = readFileSync(pagePath, 'utf8');
  const ctx = {
    browser,
    baseURL: server.baseURL,
    pageName: page,
    url: `${server.baseURL}${page}.html`,
    expectedTitle: readTitle(html),
    async openPage(options = {}) {
      const p = await browser.newPage();
      p.setDefaultTimeout(15000);
      if (options.reducedMotion) await p.emulateMedia({ reducedMotion: 'reduce' });
      if (options.routeAborts) {
        for (const pattern of options.routeAborts) {
          await p.route(pattern, (route) => route.abort());
        }
      }
      return p;
    },
  };

  for (const check of BASE_CHECKS) {
    total += 1;
    try {
      await check(ctx);
      console.log(`PASS ${page} ${check.name}`);
    } catch (err) {
      failures += 1;
      console.log(`FAIL ${page} ${check.name}: ${err.message}`);
    }
  }

  for (const check of PAGE_CHECKS[page] || []) {
    total += 1;
    try {
      await check(ctx);
      console.log(`PASS ${page} ${check.name}`);
    } catch (err) {
      failures += 1;
      console.log(`FAIL ${page} ${check.name}: ${err.message}`);
    }
  }
}

await browser.close();
await server.close();

console.log('');
console.log(`${seen.size} page(s), ${total} check(s), ${failures} failure(s).`);
process.exitCode = failures ? 1 : 0;