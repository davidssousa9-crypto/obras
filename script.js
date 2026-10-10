/* =========================================================
   METRIC. — interaction layer
   Lenis smooth scroll · GSAP/ScrollTrigger reveals (one-way) ·
   counters · magnetic buttons · services float · quote slider
   ========================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasST = typeof window.ScrollTrigger !== 'undefined';
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (hasGSAP && hasST) gsap.registerPlugin(ScrollTrigger);

  /* ---------- Smooth scroll (Lenis) ---------- */
  var lenis = null;
  (function initLenis() {
    if (reduced || typeof window.Lenis === 'undefined') return;
    lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6
    });
    if (hasGSAP && hasST) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  })();
  window.__lenis = lenis;

  /* ---------- Header state + scroll progress ---------- */
  var header = document.querySelector('[data-header]');
  var progressBar = document.querySelector('[data-progress-bar]');
  function updateScrollUI(y) {
    if (header) header.classList.toggle('is-scrolled', y > 40);
    if (progressBar) {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      progressBar.style.transform = 'scaleX(' + p + ')';
    }
  }
  window.addEventListener('scroll', function () { updateScrollUI(window.scrollY); }, { passive: true });
  updateScrollUI(window.scrollY);

  /* ---------- Mobile menu ---------- */
  var menu = document.querySelector('[data-menu]');
  var toggle = document.querySelector('[data-menu-toggle]');

  function openMenu() {
    if (!menu || !toggle) return;
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('menu-open');
    if (lenis) lenis.stop();
  }
  function closeMenu() {
    if (!menu || !toggle || !menu.classList.contains('is-open')) return;
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
    if (lenis) lenis.start();
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      menu.classList.contains('is-open') ? closeMenu() : openMenu();
    });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* ---------- Smooth anchor navigation ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('href');
      if (!id || id === '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      if (lenis) {
        lenis.scrollTo(target, { offset: -50, duration: 1.2 });
      } else {
        var top = target.getBoundingClientRect().top + window.scrollY - 50;
        window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
      }
      history.replaceState(null, '', id);
    });
  });

  /* ---------- Reveal animations ---------- */
  function initReveals() {
    if (!hasGSAP || reduced) return;

    // Hero headline — masked lines on load
    var heroLines = gsap.utils.toArray('[data-hero-line]');
    if (heroLines.length) {
      gsap.set(heroLines, { yPercent: 116 });
      gsap.to(heroLines, {
        yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: 0.09, delay: 0.3
      });
    }

    // Section titles — masked lines on scroll (one-way).
    // Titles flagged [data-split] are handled by initTextSplit() instead,
    // which reveals them word-by-word inside the same line masks.
    gsap.utils.toArray('.mask__in').forEach(function (el) {
      if (el.hasAttribute('data-hero-line')) return;
      if (el.closest('[data-split]')) return;
      gsap.set(el, { yPercent: 116 });
      gsap.to(el, {
        yPercent: 0, duration: 1.1, ease: 'power4.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // Fade-up blocks with a dissipating blur (one-way)
    gsap.utils.toArray('[data-fade]').forEach(function (el) {
      gsap.set(el, { y: 40, autoAlpha: 0, filter: 'blur(10px)' });
      gsap.to(el, {
        y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
    });

    // Media curtain reveal (projects)
    gsap.utils.toArray('[data-media]').forEach(function (el) {
      gsap.fromTo(el, { clipPath: 'inset(0% 0% 100% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: 'power3.inOut',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true }
        });
    });

    // Hero parallax
    var heroVideo = document.querySelector('[data-hero-video]');
    var hero = document.querySelector('[data-hero]');
    if (heroVideo && hero) {
      gsap.to(heroVideo, {
        yPercent: 12, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    // Number counters
    gsap.utils.toArray('[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-target') || '0');
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: 2, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onUpdate: function () { el.textContent = Math.round(obj.v).toLocaleString('en-US'); }
      });
    });
  }

  /* ---------- Text split (word-level masked reveal) ---------- */
  // Wraps every word inside a `.mask__in` into `.word > .word__in` so titles
  // can reveal word-by-word while the existing line masks clip them. Inline
  // elements (<em>, .dot) are preserved — we recurse instead of flattening.
  function wrapWords(parent) {
    Array.prototype.slice.call(parent.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        var frag = document.createDocumentFragment();
        node.nodeValue.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var w = document.createElement('span');
          w.className = 'word';
          var win = document.createElement('span');
          win.className = 'word__in';
          win.textContent = part;
          w.appendChild(win);
          frag.appendChild(w);
        });
        parent.replaceChild(frag, node);
      } else if (node.nodeType === 1) {
        wrapWords(node);
      }
    });
  }

  function initTextSplit() {
    var els = gsap.utils.toArray('[data-split]');
    if (!els.length) return;
    els.forEach(function (el) {
      el.querySelectorAll('.mask__in').forEach(wrapWords);
    });
    if (!hasGSAP || reduced) return; // words stay visible when motion is off

    els.forEach(function (el) {
      var words = el.querySelectorAll('.word__in');
      if (!words.length) return;
      gsap.set(words, { yPercent: 120 });
      gsap.to(words, {
        yPercent: 0, duration: 1, ease: 'power4.out', stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
    });
  }

  function setCountersFinal() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var t = parseFloat(el.getAttribute('data-target') || '0');
      el.textContent = Math.round(t).toLocaleString('en-US');
    });
  }

  /* ---------- Magnetic buttons ---------- */
  function initMagnetic() {
    if (reduced || !hasGSAP || !finePointer) return;
    gsap.utils.toArray('[data-magnetic]').forEach(function (el) {
      var xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      var yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.45);
      });
      el.addEventListener('mouseleave', function () {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
      });
    });
  }

  /* ---------- Testimonials slider ---------- */
  function initQuotes() {
    var track = document.querySelector('[data-quotes]');
    if (!track) return;
    var quotes = Array.prototype.slice.call(track.querySelectorAll('[data-quote]'));
    if (!quotes.length) return;
    var indexEl = document.querySelector('[data-quote-index]');
    var prev = document.querySelector('[data-quote-prev]');
    var next = document.querySelector('[data-quote-next]');
    var i = 0;
    var timer = null;

    function render(n) {
      quotes.forEach(function (q, idx) { q.classList.toggle('is-active', idx === n); });
      if (indexEl) indexEl.textContent = String(n + 1).padStart(2, '0');
    }
    function go(n) { i = (n + quotes.length) % quotes.length; render(i); }
    function startAuto() {
      if (reduced) return;
      clearInterval(timer);
      timer = setInterval(function () { go(i + 1); }, 6500);
    }
    function stopAuto() { clearInterval(timer); }

    render(0);
    startAuto();
    if (prev) prev.addEventListener('click', function () { go(i - 1); startAuto(); });
    if (next) next.addEventListener('click', function () { go(i + 1); startAuto(); });
    var stage = document.querySelector('.quotes__stage');
    if (stage) {
      stage.addEventListener('mouseenter', stopAuto);
      stage.addEventListener('mouseleave', startAuto);
    }
  }

  /* ---------- Page-load curtain ---------- */
  function initPageLoad() {
    var curtain = document.querySelector('[data-curtain]');
    if (!curtain) return;
    if (!hasGSAP || reduced) return; // CSS keeps it display:none when GSAP is gone / motion reduced
    gsap.set(curtain, { display: 'block' });
    gsap.to(curtain, {
      yPercent: -100,
      duration: 1.0,
      ease: 'power4.inOut',
      onComplete: function () { gsap.set(curtain, { display: 'none' }); }
    });
  }

  /* ---------- Active nav state ---------- */
  function initActiveNav() {
    var page = document.body && document.body.dataset ? document.body.dataset.page : '';
    if (!page) return;
    document.querySelectorAll('[data-nav]').forEach(function (el) {
      if (el.getAttribute('data-nav') === page) el.classList.add('is-active');
    });
  }

  /* ---------- Footer entrance + watermark parallax ---------- */
  function initFooter() {
    if (!hasGSAP || reduced) return;
    var footer = document.querySelector('.footer');
    if (!footer) return;

    var cols = footer.querySelector('.footer__cols');
    var children = cols ? Array.prototype.slice.call(cols.children) : [];
    if (children.length) {
      gsap.fromTo(children, { y: 36, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.9, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: { trigger: cols, start: 'top 85%', once: true }
      });
    }

    var watermark = footer.querySelector('.footer__watermark');
    if (watermark) {
      gsap.fromTo(watermark, { yPercent: 18 }, {
        yPercent: -18, ease: 'none',
        scrollTrigger: { trigger: footer, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    }
  }

  /* ---------- Marquee — velocity-reactive duration (home) ---------- */
  // Reads Lenis velocity on scroll and writes `--marquee-duration` to <html>;
  // CSS keeps animating the track via animation-duration. Never tweens layout.
  function initMarqueeVelocity() {
    if (reduced) return; // reduced motion: static marquee, no velocity wiring
    var lenis = window.__lenis;
    if (!lenis || typeof lenis.on !== 'function') return;
    if (!document.querySelector('.marquee__track')) return;
    var root = document.documentElement;
    lenis.on('scroll', function (e) {
      var v = 0;
      if (e && typeof e.velocity === 'number') v = Math.abs(e.velocity);
      else if (typeof lenis.velocity === 'number') v = Math.abs(lenis.velocity);
      var dur = Math.max(20, Math.min(70, 44 / (1 + v)));
      root.style.setProperty('--marquee-duration', dur.toFixed(2) + 's');
    });
  }

  /* ---------- Services — grouped entrance (home) ---------- */
  // Rows rise as a group on the section trigger; the index number fades in
  // separately. one-way (once:true) so entrances never replay on scroll-back.
  function initSrvEntrance() {
    if (!hasGSAP || reduced) return;
    var items = gsap.utils.toArray('[data-srv]');
    if (!items.length) return;
    var trigger = document.querySelector('[data-services]');
    if (!trigger) return;

    gsap.fromTo(items, { y: 44, autoAlpha: 0 }, {
      y: 0, autoAlpha: 1, duration: 0.9, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: trigger, start: 'top 78%', once: true }
    });

    var indexes = gsap.utils.toArray('[data-srv] .srv__index');
    if (indexes.length) {
      gsap.fromTo(indexes, { autoAlpha: 0, y: 14 }, {
        autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.35,
        scrollTrigger: { trigger: trigger, start: 'top 78%', once: true }
      });
    }
  }

  /* ---------- Services — sticky aside + active row (home) ---------- */
  // The aside sticks (CSS position: sticky) while the four rows scroll. As each
  // row crosses the viewport centre it becomes `.is-active` and updates the
  // aside index, preview image and progress bar. Reduced motion: first row
  // active, no triggers. Never tweens layout.
  function initServicesPin() {
    var rows = gsap.utils.toArray('[data-srv]');
    if (!rows.length) return;
    var indexEl = document.querySelector('[data-service-index]');
    var media = document.querySelector('[data-service-media]');
    var bar = document.querySelector('[data-service-bar]');
    var previews = rows.map(function (row) {
      var img = row.querySelector('.srv__thumb img');
      return img ? img.getAttribute('src') : '';
    });
    previews.forEach(function (src) { if (src) { var warm = new Image(); warm.src = src; } });

    function setActive(n) {
      rows.forEach(function (r, i) { r.classList.toggle('is-active', i === n); });
      if (indexEl) {
        indexEl.textContent = '[ ' + String(n + 1).padStart(2, '0') + ' / ' +
          String(rows.length).padStart(2, '0') + ' ]';
      }
      if (media && previews[n] && media.getAttribute('src') !== previews[n]) {
        media.setAttribute('src', previews[n]);
      }
      if (bar) bar.style.transform = 'scaleX(' + ((n + 1) / rows.length) + ')';
    }

    if (!hasGSAP || !hasST || reduced) { setActive(0); return; }

    rows.forEach(function (row, i) {
      ScrollTrigger.create({
        trigger: row,
        start: 'top center',
        end: 'bottom center',
        onEnter: function () { setActive(i); },
        onEnterBack: function () { setActive(i); }
      });
    });
    setActive(0);
  }

  /* ---------- Projects — inner image parallax scrub (home + projects) ---------- */
  // Non-layout-affecting scrub: shifts the inner img (yPercent ±6) inside the
  // overflow-hidden wrapper, baked under a scale so no edges show. Skipped when
  // reduced — no transform is left on the img.
  function initProjectParallax() {
    if (!hasGSAP || reduced) return;
    gsap.utils.toArray('[data-parallax]').forEach(function (el) {
      var img = el.querySelector('img');
      if (!img) return;
      gsap.fromTo(img, { yPercent: -6, scale: 1.12 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });
  }

  /* ---------- Quotes stage — entrance (home) ---------- */
  function initQuotesReveal() {
    if (!hasGSAP || reduced) return;
    var stage = document.querySelector('.quotes__stage');
    if (!stage) return;
    gsap.fromTo(stage, { y: 48, autoAlpha: 0 }, {
      y: 0, autoAlpha: 1, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: stage, start: 'top 88%', once: true }
    });
  }

  /* ---------- Roles (careers) — row entrance ---------- */
  // The six .role rows rise as a group on the section-head trigger. Rows are
  // anchors; we tween transform/opacity only (no layout). one-way (once:true)
  // so the entrance never replays on scroll-back.
  function initRoleEntrance() {
    if (!hasGSAP || reduced) return;
    var rows = gsap.utils.toArray('.role');
    if (!rows.length) return;
    var trigger = document.querySelector('.roles .section-head');
    if (!trigger) return;

    gsap.fromTo(rows, { y: 28, autoAlpha: 0 }, {
      y: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out', stagger: 0.07,
      scrollTrigger: { trigger: trigger, start: 'top 85%', once: true }
    });
  }

  /* ---------- Filter buttons (projects, news) — shared protocol ---------- */
  // root.querySelectorAll('[data-filter]') are the buttons;
  // [data-filter-item] are the filterable cards, each carrying a space-separated
  // sector list. Visibility toggles via `display` only (`.is-hidden { display:none }`)
  // — never a layout tween. Reused verbatim by news.html (Task 8).
  function initFilterButtons(rootSel) {
    var root = document.querySelector(rootSel);
    if (!root) return;
    var btns = root.querySelectorAll('[data-filter]');
    var items = root.querySelectorAll('[data-filter-item]');

    function apply(mode) {
      btns.forEach(function (b) {
        var on = b.getAttribute('data-filter') === mode;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      items.forEach(function (item) {
        var cats = item.getAttribute('data-filter-item').split(' ');
        item.classList.toggle('is-hidden', mode !== 'all' && cats.indexOf(mode) === -1);
      });
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-filter')); });
    });

    apply('all');
  }

  /* ---------- Boot ---------- */
  initPageLoad(); // curtain up while the hero lines rise
  initReveals();
  initTextSplit();
  initMarqueeVelocity();
  initSrvEntrance();
  initServicesPin();
  initProjectParallax();
  initQuotesReveal();
  initRoleEntrance();
  initFilterButtons('[data-filter-root]');
  initActiveNav();
  initMagnetic();
  initQuotes();
  initFooter();
  if (!hasGSAP || reduced) setCountersFinal();

  // Re-measure once assets settle
  function refresh() { if (hasST) ScrollTrigger.refresh(); }
  window.addEventListener('load', refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
})();
