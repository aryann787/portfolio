/* ==========================================================================
   aryan-portfolio-v2 — app.js
   Shared interaction engine. Hand-written rAF spring physics:
   interruptible, velocity handoff, transform/opacity only.

   Robustness (lessons from previous builds):
   - localStorage access is throw-safe (Brave Shields can make it throw
     SecurityError — that once killed an entire boot).
   - Every subsystem boots in its own try/catch: one failure can never kill
     the rest of the page.
   - The rAF loop body is guarded so a single bad frame never stops the loop.
   - NO custom cursor anywhere. The OS default cursor is used everywhere.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- throw-safe storage ---------------- */
  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage blocked: degrade gracefully */ }
  }

  /* ---------------- spring physics ---------------- */
  // stiffness/damping tuned for smooth, slow, non-snappy motion
  function makeSpring(stiffness, damping, x) {
    return { x: x || 0, v: 0, target: x || 0, k: stiffness, d: damping };
  }
  function stepSpring(s, dt) {
    var force = -s.k * (s.x - s.target) - s.d * s.v;
    s.v += force * dt;
    s.x += s.v * dt;
    // snap to rest once residual motion is invisible (sub-pixel / sub-0.01deg)
    if (Math.abs(s.x - s.target) < 0.004 && Math.abs(s.v) < 0.02) { s.x = s.target; s.v = 0; }
  }
  function snapSpring(s) { s.x = s.target; s.v = 0; }

  /* ---------------- motion mode (Auto / On / Off) ---------------- */
  var MOTION_KEY = 'aryan-v2-motion';
  var motionMode = 'auto'; // 'auto' | 'on' | 'off'
  var osReducedQuery = null;

  function osPrefersReduced() {
    try {
      if (!osReducedQuery) osReducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      return !!osReducedQuery.matches;
    } catch (e) { return false; }
  }
  function isReduced() {
    if (motionMode === 'off') return true;
    if (motionMode === 'on') return false;
    return osPrefersReduced();
  }
  function motionLabel() {
    return motionMode === 'auto' ? 'Auto' : (motionMode === 'on' ? 'On' : 'Off');
  }

  function initMotionMode() {
    var saved = safeGet(MOTION_KEY);
    if (saved === 'on' || saved === 'off' || saved === 'auto') motionMode = saved;
    applyMotionMode();
    try {
      if (!osReducedQuery) osReducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onChange = function () { if (motionMode === 'auto') applyMotionMode(); };
      if (osReducedQuery.addEventListener) osReducedQuery.addEventListener('change', onChange);
      else if (osReducedQuery.addListener) osReducedQuery.addListener(onChange);
    } catch (e) { /* media query listeners unavailable */ }
  }

  function applyMotionMode() {
    var reduced = isReduced();
    document.body.classList.toggle('reduced-motion', reduced);
    document.querySelectorAll('.reveal').forEach(function (el) {
      if (reduced) el.classList.add('visible');
    });
    if (reduced) {
      hoverCards.forEach(function (c) {
        c.lift.target = 0; c.zoom.target = 1;
        snapSpring(c.lift); snapSpring(c.zoom);
        c.el.style.transform = '';
        if (c.img) c.img.style.transform = '';
      });
      carousels.forEach(function (c) {
        c.pos.target = c.index; snapSpring(c.pos); applyTrack(c);
      });
    }
  }

  /* ---------------- content.js: editable image map ---------------- */
  function initContent() {
    var map = (typeof SITE_CONTENT !== 'undefined') ? SITE_CONTENT : null;
    if (!map) return;
    if (map.images) {
      document.querySelectorAll('[data-img]').forEach(function (el) {
        var path = map.images[el.getAttribute('data-img')];
        if (!path) return;
        if (el.tagName === 'VIDEO') el.setAttribute('poster', path);
        else el.setAttribute('src', path);
      });
    }
    if (map.videos) {
      document.querySelectorAll('[data-video]').forEach(function (el) {
        var path = map.videos[el.getAttribute('data-video')];
        if (path) el.setAttribute('src', path);
      });
    }
  }

  /* ---------------- scroll reveals ---------------- */
  function initReveals() {
    var els = document.querySelectorAll('.reveal');
    // Retire the entrance transition once it has played: the rAF hover loop
    // writes transforms every frame, and a lingering CSS transform transition
    // (+ stagger delay) would smear/delay hover motion unevenly per card.
    function settle(el) {
      if (el.classList.contains('revealed')) return;
      setTimeout(function () { el.classList.add('revealed'); }, 1600);
    }
    function show(el) { el.classList.add('visible'); settle(el); }
    if (isReduced()) { els.forEach(function (el) { el.classList.add('visible'); el.classList.add('revealed'); }); return; }
    if (!('IntersectionObserver' in window)) {
      els.forEach(show);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { show(entry.target); io.unobserve(entry.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5%' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------------- hover springs (uniform lift + image zoom + info glide) ---------------- */
  /* Every tile on every page behaves identically: a gentle lift, a soft media
     zoom, and the info gliding up (CSS). No rotation, no tilt. */
  var hoverCards = [];
  var finePointer = false;
  try { finePointer = window.matchMedia('(hover:hover) and (pointer:fine)').matches; } catch (e) {}

  function initHoverSprings() {
    if (!finePointer) return;
    // media tiles: home cards + section bento tiles (carousel / video / still)
    document.querySelectorAll('.practice, .btile.b-media').forEach(function (el) {
      registerHover(el, true);
    });
    // text tiles + CTA band: lift only
    document.querySelectorAll('.btile-text, .cta-band').forEach(function (el) {
      registerHover(el, false);
    });
  }
  function registerHover(el, zoomable) {
    var img = null;
    try { img = el.querySelector(':scope > img, :scope > video, :scope > .ct-viewport'); } catch (e) {}
    if (!img) { try { img = el.querySelector('.practice-visual img'); } catch (e2) {} }
    var card = {
      el: el, img: img, zoomable: !!zoomable,
      lift: makeSpring(180, 30, 0),   // slightly overdamped: settles with no overshoot
      zoom: makeSpring(160, 28, 1)    // slightly overdamped: settles with no overshoot
    };
    hoverCards.push(card);
    el.addEventListener('pointerenter', function () {
      if (isReduced()) return;
      card.lift.target = -6;
      if (card.zoomable) card.zoom.target = 1.03;
    });
    el.addEventListener('pointerleave', function () {
      card.lift.target = 0; card.zoom.target = 1;
    });
  }

  /* ---------------- carousels (spring-driven, mid-flight catchable) ---------------- */
  var carousels = [];

  function initCarousels() {
    document.querySelectorAll('[data-carousel]').forEach(function (root) {
      try { buildCarousel(root); } catch (e) { /* one bad carousel never kills the page */ }
    });
  }
  function buildCarousel(root) {
    var track = root.querySelector('.ct-track');
    var slides = Array.prototype.slice.call(root.querySelectorAll('.ct-slide'));
    if (!track || slides.length < 2) return;
    var label = root.querySelector('.ct-label-pill');
    var dotsWrap = root.querySelector('.ct-dots');
    var labels = slides.map(function (s) {
      var dl = s.getAttribute('data-label');
      if (dl) return dl;
      var cap = s.querySelector('figcaption');
      return cap ? cap.textContent : ('View ' + (slides.indexOf(s) + 1));
    });
    var c = {
      root: root, track: track, label: label, dots: [],
      count: slides.length, index: 0, shown: -1,
      labels: labels,
      pos: makeSpring(120, 26, 0) // smooth glide with no overshoot, catchable mid-flight
    };
    if (dotsWrap) {
      slides.forEach(function (_, i) {
        var d = document.createElement('button');
        d.type = 'button';
        d.setAttribute('aria-label', 'Go to view ' + (i + 1) + ': ' + labels[i]);
        d.addEventListener('click', function () { goTo(c, i); });
        dotsWrap.appendChild(d);
        c.dots.push(d);
      });
    }
    var prev = root.querySelector('.ct-prev');
    var next = root.querySelector('.ct-next');
    if (prev) prev.addEventListener('click', function () { goTo(c, (c.index - 1 + c.count) % c.count); });
    if (next) next.addEventListener('click', function () { goTo(c, (c.index + 1) % c.count); });
    root.setAttribute('tabindex', '0');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Image carousel: use left and right arrow keys to change view');
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(c, (c.index + 1) % c.count); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(c, (c.index - 1 + c.count) % c.count); }
    });
    updateDots(c);
    carousels.push(c);
  }
  function goTo(c, i) {
    c.index = i;
    c.pos.target = i;
    if (isReduced()) { snapSpring(c.pos); applyTrack(c); updateDots(c); }
  }
  function applyTrack(c) {
    c.track.style.transform = 'translate3d(' + (-c.pos.x * 100).toFixed(3) + '%,0,0)';
    var nearest = Math.round(c.pos.x);
    if (nearest !== c.shown) {
      c.shown = nearest;
      if (c.label) c.label.textContent = c.labels[nearest] || ('View ' + (nearest + 1));
      updateDots(c);
    }
  }
  function updateDots(c) {
    c.dots.forEach(function (d, i) {
      if (i === c.index) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
  }

  /* ---------------- video viewer (large overlay) ---------------- */
  /* Shared by every page: opens a clip large with native controls, prev/next
     stepping, Esc/backdrop/close exit. Tiles marked [data-inline-video]
     (game-dev) play in their tile instead and reach the viewer only through
     their expand button — initInlineVideos owns their clicks, so the viewer
     never attaches its own click handler to them. */
  var openViewerAt = null; // assigned below: openViewerAt(tileIndex, startSeconds)
  function initVideoViewer() {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-video-tile], [data-inline-video]'));
    var box = document.getElementById('videobox');
    if (!tiles.length || !box) return;
    var video = box.querySelector('.vb-video');
    var count = box.querySelector('.vb-count');
    var idx = 0, lastFocus = null, seq = 0;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function applyClip(startTime) {
      var v = tiles[idx].querySelector('video');
      video.poster = v.getAttribute('poster') || '';
      video.src = v.currentSrc || v.src;
      count.textContent = (idx + 1) + ' / ' + tiles.length;
      if (startTime > 0.05) {
        // resume where the inline tile left off (e.g. via its expand button)
        var setT = function () { try { video.currentTime = startTime; } catch (e) {} };
        if (video.readyState >= 1) setT();
        else video.addEventListener('loadedmetadata', function h() {
          video.removeEventListener('loadedmetadata', h); setT();
        });
      }
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function () {});
    }
    function show(i, dir, startTime) {
      idx = (i + tiles.length) % tiles.length;
      if (!dir || !box.classList.contains('open') || reduceMotion) { applyClip(startTime); return; }
      var my = ++seq;
      video.classList.add(dir > 0 ? 'vb-out-l' : 'vb-out-r');
      void video.offsetWidth; /* register the transition start immediately */
      setTimeout(function () {
        if (my !== seq) return; /* a newer navigation won; skip the stale frame */
        applyClip();
        video.classList.remove('vb-out-l', 'vb-out-r');
        video.classList.add(dir > 0 ? 'vb-in-r' : 'vb-in-l');
        void video.offsetWidth; /* reflow so the entrance transition triggers */
        video.classList.add('vb-go');
        setTimeout(function () {
          video.classList.remove('vb-in-r', 'vb-in-l', 'vb-go');
        }, 480);
      }, 280);
    }
    function open(i, opener, startTime) {
      lastFocus = opener || document.activeElement;
      show(i, null, startTime);
      box.classList.add('open');
      document.body.style.overflow = 'hidden';
      box.querySelector('.vb-close').focus();
    }
    function close() {
      video.pause();
      video.removeAttribute('src');
      video.load();
      box.classList.remove('open');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    tiles.forEach(function (tile, i) {
      if (tile.hasAttribute('data-inline-video')) return; // owned by initInlineVideos
      tile.addEventListener('click', function () { open(i, tile.querySelector('.play-pill'), 0); });
    });
    box.querySelector('.vb-close').addEventListener('click', close);
    box.querySelector('.vb-prev').addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1, -1); });
    box.querySelector('.vb-next').addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1, 1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(idx + 1, 1);
      else if (e.key === 'ArrowLeft') show(idx - 1, -1);
    });
    openViewerAt = function (i, t) { open(i, null, t || 0); };
  }

  /* ---------------- inline video tiles (game-dev) ---------------- */
  /* The clip plays in its tile size: the play icon starts it, the icon/title
     fade out while it plays (tile gets .playing), clicking the video toggles
     pause, and the expand button opens the same clip large in the overlay
     viewer, resuming from the tile's current time. */
  function initInlineVideos() {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-inline-video]'));
    if (!tiles.length || !document.getElementById('videobox')) return;
    tiles.forEach(function (tile, i) {
      try {
        var video = tile.querySelector('video');
        var playBtn = tile.querySelector('.play-icon');
        var expandBtn = tile.querySelector('.expand-btn');
        if (!video || !playBtn) return;
        function startInline() {
          tiles.forEach(function (other) {
            var v = other.querySelector('video');
            if (v && v !== video && !v.paused) v.pause();
          });
          var pr = video.play();
          if (pr && pr.catch) pr.catch(function () {});
        }
        playBtn.addEventListener('click', function (e) { e.stopPropagation(); startInline(); });
        video.addEventListener('click', function () {
          if (video.paused) startInline();
          else video.pause();
        });
        video.addEventListener('play', function () { tile.classList.add('playing'); });
        video.addEventListener('pause', function () { tile.classList.remove('playing'); });
        if (expandBtn) expandBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var t = video.currentTime || 0;
          video.pause();
          if (openViewerAt) openViewerAt(i, t);
        });
      } catch (e) { /* one bad tile never kills the page */ }
    });
  }

  /* ---------------- screenshot lightbox (game-dev) ---------------- */
  /* Compact thumbnails open a full viewer: click, Enter/Space, Esc, arrows. */
  function initLightbox() {
    var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox]'));
    var box = document.getElementById('lightbox');
    if (!tiles.length || !box) return;
    var img = box.querySelector('.lb-img');
    var count = box.querySelector('.lb-count');
    var cap = box.querySelector('.lb-cap');
    var capTitle = box.querySelector('.lb-title');
    var capDesc = box.querySelector('.lb-desc');
    var idx = 0;
    function show(i) {
      idx = (i + tiles.length) % tiles.length;
      var timg = tiles[idx].querySelector('img');
      img.src = timg.currentSrc || timg.src;
      img.alt = timg.alt || '';
      count.textContent = (idx + 1) + ' / ' + tiles.length;
      /* Under-the-hood tiles carry their title + description; show them in the viewer. */
      var t = tiles[idx].dataset.title || '';
      var d = tiles[idx].dataset.desc || '';
      if (cap) {
        cap.style.display = (t || d) ? '' : 'none';
        if (capTitle) capTitle.textContent = t;
        if (capDesc) capDesc.textContent = d;
      }
    }
    function open(i) {
      show(i);
      box.classList.add('open');
      document.body.style.overflow = 'hidden';
      box.querySelector('.lb-close').focus();
    }
    function close() {
      box.classList.remove('open');
      document.body.style.overflow = '';
    }
    tiles.forEach(function (t, i) {
      t.addEventListener('click', function () { open(i); });
      t.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === t) {
          e.preventDefault(); open(i);
        }
      });
    });
    box.querySelector('.lb-close').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
    box.querySelector('.lb-next').addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'ArrowLeft') show(idx - 1);
    });
  }

  /* ---------------- before/after compare slider (game-dev: world building & implementation) ---------------- */
  /* One invisible range input owns all pointer + keyboard input; the visible
     handle and the clipped top image follow its value via --pos. */
  function initCompare() {
    document.querySelectorAll('[data-compare]').forEach(function (el) {
      var range = el.querySelector('.cmp-range');
      if (!range) return;
      var sync = function () { el.style.setProperty('--pos', range.value + '%'); };
      range.addEventListener('input', sync);
      sync();
    });
  }

  /* ---------------- scroll fx: progress, hero parallax, nav ---------------- */
  var progressEl = null, navEl = null, heroCopy = null, introNote = null;
  var scrollTarget = 0, scrollShown = 0;

  function initScrollFx() {
    progressEl = document.querySelector('.scroll-progress');
    navEl = document.querySelector('.site-nav');
    heroCopy = document.querySelector('.hero-copy');
    introNote = document.querySelector('.intro-note');
    scrollTarget = window.scrollY || 0;
    scrollShown = scrollTarget;
    window.addEventListener('scroll', function () {
      scrollTarget = window.scrollY || 0;
      if (navEl) navEl.classList.toggle('compact', scrollTarget > 24);
    }, { passive: true });
  }

  /* ---------------- main rAF loop (guarded: never dies) ---------------- */
  var lastFrame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    try {
      var dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;
      var reduced = isReduced();

      // scroll progress + hero parallax (transform only)
      if (!reduced) {
        scrollShown += (scrollTarget - scrollShown) * (1 - Math.exp(-14 * dt));
        if (progressEl) {
          var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          progressEl.style.transform = 'scaleX(' + Math.min(1, scrollShown / max).toFixed(4) + ')';
        }
        if (heroCopy && scrollShown < window.innerHeight) {
          var y = Math.min(scrollShown, window.innerHeight) * 0.14;
          heroCopy.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
          if (introNote) introNote.style.transform = 'translate3d(0,' + (y * 0.55).toFixed(2) + 'px,0)';
        }
      }

      // hover springs (uniform: lift + media zoom, no tilt)
      if (!reduced && finePointer) {
        hoverCards.forEach(function (card) {
          stepSpring(card.lift, dt); stepSpring(card.zoom, dt);
          var active = Math.abs(card.lift.x) > 0.01 || card.lift.target !== 0;
          if (active) {
            card.el.style.transform = 'translate3d(0,' + card.lift.x.toFixed(2) + 'px,0)';
            if (card.img && card.zoomable) card.img.style.transform = 'scale(' + card.zoom.x.toFixed(4) + ')';
          } else {
            if (card.el.style.transform) card.el.style.transform = '';
            if (card.img && card.img.style.transform) card.img.style.transform = '';
          }
        });
      }

      // carousel springs (always integrated so mid-flight is catchable)
      carousels.forEach(function (c) {
        if (reduced) return;
        var before = c.pos.x;
        stepSpring(c.pos, dt);
        if (c.pos.x !== before || c.pos.v !== 0) applyTrack(c);
      });
    } catch (e) { /* a bad frame must never stop the loop */ }
  }

  /* ---------------- bento tile ratios: match each tile to its artwork ---------------- */
  /* Each home tile's aspect-ratio follows its image's natural ratio, so the
     artwork always fills the tile edge-to-edge: fully visible, no cropping,
     no empty margins — even after the images are swapped via content.js. */
  function fitPracticeTiles() {
    document.querySelectorAll('.practice').forEach(function (el) {
      if (el.hasAttribute('data-lock-ratio')) return; // e.g. the 21/9 home banner
      var img = el.querySelector('.practice-visual img');
      if (!img) return;
      var apply = function () {
        try {
          if (img.naturalWidth > 1 && img.naturalHeight > 1) {
            el.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
          }
        } catch (e) { /* keep the CSS default ratio */ }
      };
      if (img.complete) apply();
      else img.addEventListener('load', apply);
    });
  }

  /* ---------------- bento tile ratios: match each section tile to its media ---------------- */
  /* Same idea as the home tiles: every section bento tile follows its media's
     natural ratio, so content always fills the tile edge-to-edge — fully
     visible, no cropping, no empty margins — even after swaps via content.js. */
  function fitBentoTiles() {
    document.querySelectorAll('.btile.b-media:not([data-carousel])').forEach(function (tile) {
      if (tile.hasAttribute('data-lock-ratio')) return; // e.g. the mosaic tall tile: grid stretch owns its ratio
      var m = null;
      try { m = tile.querySelector(':scope > img, :scope > video'); } catch (e) {}
      if (!m) return;
      var apply = function () {
        try {
          var w = m.naturalWidth || m.videoWidth, h = m.naturalHeight || m.videoHeight;
          if (w > 1 && h > 1) tile.style.aspectRatio = (w / h).toFixed(4);
        } catch (e2) { /* keep the CSS default ratio */ }
      };
      if (m.tagName === 'VIDEO') {
        if (m.videoWidth) apply();
        else m.addEventListener('loadedmetadata', apply);
      } else if (m.complete && m.naturalWidth) apply();
      else m.addEventListener('load', apply);
    });
  }

  /* ---------------- home hero: constellation ---------------- */
  /* Sparse dots drift slowly across the hero's right slot; faint lines link
     nearby dots, and the cursor draws brighter violet threads to the dots
     around it while gently parting them. Pure decoration: aria-hidden,
     pauses offscreen, one static frame when motion is reduced. No libraries. */
  function initConstellation() {
    var wrap = document.querySelector('.hero-canvas-wrap');
    if (!wrap) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'hero-particle-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    wrap.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var W = 0, H = 0, dpr = 1, visible = true;
    function resize() {
      var r = wrap.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    resize();
    try {
      if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(wrap);
      else window.addEventListener('resize', resize);
    } catch (e) {}
    try {
      if (window.IntersectionObserver) new IntersectionObserver(function (en) {
        visible = en.length && en[0].isIntersecting;
      }).observe(wrap);
    } catch (e) {}

    var reduced = false;
    try { reduced = isReduced(); } catch (e) {}

    var N = 70, dots = [], i, d;
    for (i = 0; i < N; i++) {
      dots.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16,
        r: 1.2 + Math.random() * 1.8,
        a: 0.35 + Math.random() * 0.55
      });
    }

    var mx = -1e4, my = -1e4, hovering = false;
    wrap.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
      hovering = true;
    });
    wrap.addEventListener('pointerleave', function () { hovering = false; });

    var LINK = 130, CLINK = 180, REPEL = 150;

    function step(dt) {
      for (var i = 0; i < N; i++) {
        var d = dots[i];
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < 6) { d.x = 6; d.vx = Math.abs(d.vx); }
        else if (d.x > W - 6) { d.x = W - 6; d.vx = -Math.abs(d.vx); }
        if (d.y < 6) { d.y = 6; d.vy = Math.abs(d.vy); }
        else if (d.y > H - 6) { d.y = H - 6; d.vy = -Math.abs(d.vy); }
        if (hovering) {
          var dx = d.x - mx, dy = d.y - my, dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < REPEL && dd > 1) {
            var push = (1 - dd / REPEL) * 90 * dt;
            d.x += dx / dd * push; d.y += dy / dd * push;
          }
        }
      }
    }

    function draw(fade) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      var i, j, d1, d2, dx, dy, dd, al;
      // faint links between neighbours
      for (i = 0; i < N; i++) {
        d1 = dots[i];
        for (j = i + 1; j < N; j++) {
          d2 = dots[j];
          dx = d1.x - d2.x; dy = d1.y - d2.y;
          dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < LINK) {
            al = (1 - dd / LINK) * 0.20 * fade;
            ctx.strokeStyle = 'rgba(235,235,240,' + al.toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y); ctx.stroke();
          }
        }
      }
      // violet threads from the cursor to nearby dots
      if (hovering) {
        for (i = 0; i < N; i++) {
          d1 = dots[i];
          dx = d1.x - mx; dy = d1.y - my;
          dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < CLINK) {
            al = (1 - dd / CLINK) * 0.5 * fade;
            ctx.strokeStyle = 'rgba(167,139,250,' + al.toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(d1.x, d1.y); ctx.stroke();
          }
        }
      }
      // dots
      for (i = 0; i < N; i++) {
        d1 = dots[i];
        ctx.globalAlpha = d1.a * fade;
        ctx.fillStyle = '#f2f2f5';
        ctx.beginPath(); ctx.arc(d1.x, d1.y, d1.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (reduced) { draw(1); return; }

    var t0 = 0, last = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      try {
        if (!t0) t0 = now;
        if (!visible) { last = now; return; }
        var dt = Math.min(0.05, Math.max(0.001, (now - (last || now)) / 1000));
        last = now;
        var fade = Math.min(1, (now - t0) / 1200);
        step(dt);
        draw(fade);
      } catch (e) { /* one bad frame never stops the loop */ }
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- boot: isolated subsystems ---------------- */
  function boot() {
    initContent();
    initMotionMode();
    var subsystems = [initReveals, fitPracticeTiles, fitBentoTiles, initHoverSprings, initCarousels, initVideoViewer, initInlineVideos, initLightbox, initCompare, initScrollFx, initConstellation];
    subsystems.forEach(function (fn) {
      try { fn(); } catch (e) { /* isolated: one failure can't kill the page */ }
    });
    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }
  try { boot(); } catch (e) { /* total boot failure: page still renders statically */ }
})();

/* ---------------- Contact form (Web3Forms) ---------------- */
/* Self-contained: posts the form as JSON, shows inline success/error.
   Untouched by the animation/boot code above. */
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = form.querySelector('.form-status');
  var btn = form.querySelector('button[type="submit"]');
  var btnLabel = btn.textContent;
  function setStatus(kind, html) {
    status.className = 'form-status' + (kind ? ' ' + kind : '');
    status.innerHTML = html;
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    /* hCaptcha guard: only when the widget actually rendered (iframe present).
       If the captcha script was blocked (e.g. ad blocker), there is no iframe
       and the form submits anyway, relying on Web3Forms' server-side check. */
    var captchaRendered = !!form.querySelector('.h-captcha iframe');
    var captchaToken = form.querySelector('[name="h-captcha-response"]');
    if (captchaRendered && (!captchaToken || !captchaToken.value)) {
      setStatus('err', 'Please complete the captcha, then send again.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Sending\u2026';
    setStatus('', '');
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    /* Honeypot: unchecked checkboxes are dropped by FormData, so send the
       checked state explicitly — Web3Forms rejects the submission if true. */
    var bot = form.querySelector('input[name="botcheck"]');
    data.botcheck = !!(bot && bot.checked);
    /* 15s abort: a hanging third-party backend must never trap the button. */
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    function done() {
      clearTimeout(timer);
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
    function fail() {
      done();
      setStatus('err', 'Something went wrong sending this. Please email me directly at ' +
        '<a href="mailto:madebyaryan@gmail.com">madebyaryan@gmail.com</a>.');
    }
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    };
    if (ctrl) opts.signal = ctrl.signal;
    fetch('https://api.web3forms.com/submit', opts).then(function (r) {
      /* A dashboard-configured redirect URL makes Web3Forms 302 instead of
         returning JSON — fetch follows it, so treat that as success too. */
      if (r.redirected) { done(); form.reset(); setStatus('ok', 'Message sent \u2014 thanks for reaching out.'); return null; }
      return r.json();
    }).then(function (res) {
      if (!res) return;
      if (res.success) {
        done();
        form.reset();
        setStatus('ok', 'Message sent \u2014 thanks for reaching out.');
      } else { fail(); }
    }).catch(fail);
  });
})();
