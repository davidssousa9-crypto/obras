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
      duration: 1.15,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
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

    // Section titles — masked lines on scroll (one-way)
    gsap.utils.toArray('.mask__in').forEach(function (el) {
      if (el.hasAttribute('data-hero-line')) return;
      gsap.set(el, { yPercent: 116 });
      gsap.to(el, {
        yPercent: 0, duration: 1.1, ease: 'power4.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // Fade-up blocks (one-way)
    gsap.utils.toArray('[data-fade]').forEach(function (el) {
      gsap.set(el, { y: 42, autoAlpha: 0 });
      gsap.to(el, {
        y: 0, autoAlpha: 1, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true }
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

  /* ---------- Services — floating preview ---------- */
  function initServices() {
    var section = document.querySelector('[data-services]');
    var float = document.querySelector('[data-float]');
    var floatImg = document.querySelector('[data-float-img]');
    if (!section || !float || !floatImg) return;
    if (!finePointer || reduced || !hasGSAP) return; // touch shows inline thumbs (CSS)

    // Preload lighter preview srcs up-front so a hover never pops a half-loaded frame.
    var items = gsap.utils.toArray('[data-srv]');
    var previewSrcs = items.map(function (item) {
      var raw = item.getAttribute('data-img');
      return raw ? raw.replace('w=1200&q=80', 'w=800&q=75') : '';
    });
    previewSrcs.forEach(function (src) {
      if (src) { var warm = new Image(); warm.src = src; }
    });
    if (previewSrcs[0]) floatImg.src = previewSrcs[0];

    gsap.set(float, { xPercent: -50, yPercent: -50, scale: 0.86, autoAlpha: 0 });
    var xTo = gsap.quickTo(float, 'x', { duration: 0.45, ease: 'power3' });
    var yTo = gsap.quickTo(float, 'y', { duration: 0.45, ease: 'power3' });

    section.addEventListener('mousemove', function (e) {
      xTo(e.clientX);
      yTo(e.clientY);
    });
    items.forEach(function (item, i) {
      item.addEventListener('mouseenter', function () {
        if (previewSrcs[i] && floatImg.getAttribute('src') !== previewSrcs[i]) floatImg.src = previewSrcs[i];
        gsap.to(float, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'power3.out' });
      });
    });
    section.addEventListener('mouseleave', function () {
      gsap.to(float, { autoAlpha: 0, scale: 0.86, duration: 0.4, ease: 'power2.out' });
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

  /* ---------- Boot ---------- */
  initReveals();
  initMagnetic();
  initServices();
  initQuotes();
  if (!hasGSAP || reduced) setCountersFinal();

  // Re-measure once assets settle
  function refresh() { if (hasST) ScrollTrigger.refresh(); }
  window.addEventListener('load', refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
})();
