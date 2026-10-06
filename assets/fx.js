/* Page motion and small interactions: reveals, count-ups, nav, tabs, lightbox. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- count-up numbers ---------- */
  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    const to = parseFloat(el.dataset.count);
    const dec = +(el.dataset.decimals || 0);
    const pre = el.dataset.prefix || "";
    const fmt = (v) => pre + (el.dataset.sep ? Math.round(v).toLocaleString("en-US") : v.toFixed(dec));
    if (reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 1600;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(to * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- scroll reveal ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add("in");
      $$("[data-count]", el).forEach(countUp);
      if (el.matches("[data-count]")) countUp(el);
      if (el.classList.contains("bb-card")) {
        $(".bar.ours i", el).style.width = `${el.dataset.ours}%`;
        $(".bar.base i", el).style.width = `${el.dataset.base}%`;
      }
      io.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));
  // the converging lines in the task section animate once the trio is on screen
  const tri = $("#tri");
  if (tri) new IntersectionObserver(([e], o) => { if (e.isIntersecting) { tri.classList.add("in"); o.disconnect(); } }, { threshold: 0.35 }).observe(tri);

  /* ---------- nav: show after hero, highlight current section, progress bar ---------- */
  const nav = $("#topnav"), bar = $("#progress");
  const links = $$(".nav-links a");
  const sections = links.map((a) => $(a.getAttribute("href")));
  let ticking = false;
  function onScroll() {
    ticking = false;
    const y = scrollY, h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
    nav.classList.toggle("show", y > innerHeight * 0.6);
    let cur = -1;
    sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < innerHeight * 0.35) cur = i; });
    links.forEach((a, i) => a.classList.toggle("active", i === cur));
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- cursor spotlight on cards ---------- */
  document.addEventListener("pointermove", (e) => {
    const c = e.target.closest && e.target.closest(".glow-card");
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${e.clientX - r.left}px`);
    c.style.setProperty("--my", `${e.clientY - r.top}px`);
  });

  /* ---------- results panel tabs ---------- */
  $$(".panel-tabs").forEach((tabs) => {
    const btns = $$("button", tabs);
    btns.forEach((b) => b.addEventListener("click", () => {
      btns.forEach((x) => {
        const on = x === b;
        x.setAttribute("aria-selected", String(on));
        $("#" + x.dataset.panel).hidden = !on;
      });
      // charts in a newly shown panel draw on their first resize observation
    }));
  });

  /* ---------- lightbox for paper figures ---------- */
  const lb = $("#lightbox"), lbImg = $("img", lb);
  $$(".zoom img").forEach((img) => img.closest(".zoom").addEventListener("click", () => {
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }));
  const closeLb = () => { lb.hidden = true; document.body.style.overflow = ""; };
  lb.addEventListener("click", closeLb);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !lb.hidden) closeLb(); });

  /* ---------- teaser: fit it in the first screen ---------- */
  const teaserBox = $(".teaser");
  const fitTeaser = () => teaserBox && document.documentElement.style.setProperty("--teaser-top", `${teaserBox.offsetTop}px`);
  fitTeaser();
  addEventListener("resize", fitTeaser);
  document.fonts && document.fonts.ready.then(fitTeaser);

  /* ---------- teaser: autoplay with sound when the browser allows it ---------- */
  // Browsers block unmuted autoplay until the visitor interacts with the page, so try
  // with sound first, fall back to muted, and unmute on the first click/tap/key press.
  // While muted, a hopping reminder sits on the video.
  const tv = $("#teaser"), hint = $("#soundHint");
  if (tv && hint) {
    const sync = () => (hint.hidden = !tv.muted);
    const unmute = () => { tv.muted = false; tv.play().catch(() => {}); sync(); };
    // clicking the reminder restarts the teaser so the viewer hears it from the start
    hint.addEventListener("click", (e) => { e.stopPropagation(); tv.currentTime = 0; unmute(); });
    tv.addEventListener("volumechange", sync);
    if (reduce) { tv.removeAttribute("autoplay"); tv.pause(); sync(); }
    else {
      tv.muted = false;
      tv.play().then(sync).catch(() => {
        tv.muted = true;
        tv.play().catch(() => {});
        sync();
        const first = (e) => {
          if (e.target.closest && e.target.closest("#soundHint")) return; // the reminder handles itself
          if (tv.muted) unmute();
          ["pointerdown", "keydown"].forEach((t) => removeEventListener(t, first, true));
        };
        ["pointerdown", "keydown"].forEach((t) => addEventListener(t, first, true));
      });
    }
  }
})();
