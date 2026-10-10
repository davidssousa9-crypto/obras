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
 * non-empty data-nav value and an href ending in .html, exactly the links for
 * the current page carry .is-active, and home carries none.
 */
export async function activeNavStated(ctx) {
  const page = await ctx.openPage();
  try {
    await page.goto(ctx.url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const body = document.body;
      const dataPage = (body && body.dataset ? body.dataset.page : '') || '';
      const navs = Array.from(document.querySelectorAll('[data-nav]'));
      const bad = [];
      navs.forEach((el, i) => {
        const v = el.getAttribute('data-nav');
        const href = el.getAttribute('href') || '';
        if (!v) bad.push('[data-nav][' + i + '] empty data-nav');
        if (!/\.html$/.test(href)) bad.push('[data-nav][' + i + '] href "' + href + '" does not end in .html');
      });
      const active = navs.filter((el) => el.classList.contains('is-active'));
      return {
        dataPage: dataPage,
        count: navs.length,
        bad: bad,
        activeCount: active.length,
        activeMatching: active.filter((el) => el.getAttribute('data-nav') === dataPage).length,
        activeWrong: active
          .filter((el) => el.getAttribute('data-nav') !== dataPage)
          .map((el) => el.getAttribute('data-nav')),
      };
    });

    const failures = [];
    if (!r.dataPage) failures.push('document.body[data-page] missing');
    if (r.count === 0) failures.push('no [data-nav] links found');
    if (r.bad.length) failures.push(r.bad.join('; '));
    if (r.dataPage === 'home') {
      if (r.activeCount !== 0) failures.push(`home: ${r.activeCount} active nav link(s), expected none`);
    } else if (r.dataPage) {
      if (r.activeMatching === 0) failures.push(`no active [data-nav] for data-page "${r.dataPage}"`);
      if (r.activeWrong.length) failures.push(`non-matching active link(s): ${r.activeWrong.join(', ')}`);
    }
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
 *   PAGE_CHECKS['projects'] = [filterWorks, activeNavStated];
 *   PAGE_CHECKS['contact'] = [formValidates, activeNavStated];
 *   PAGE_CHECKS['project'] = [rendersDetail, activeNavStated];
 *
 * activeNavStated is page-agnostic — include it in every page's entry so the
 * shell protocol is verified on every page.
 */
export const PAGE_CHECKS = {};
PAGE_CHECKS['index'] = [curtainOnce, activeNavStated];

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