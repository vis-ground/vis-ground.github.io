/* Interactive SVG charts rebuilt from the paper's data (Table 1, Figures 2, 5, 6, 8, 9).
   Palette: validated categorical slots (adjacent CVD ΔE ≥ 9.1, normal-vision ≥ 19.6 on white);
   three slots sit under 3:1 contrast, so every chart has visible labels and a data-table view. */
(() => {
  const T1 = window.PAPER_T1; // { backbone: [[method, narr[6], know[6], comp, ci], ...] }
  const METRICS = ["SF", "SC", "IF", "JCS", "VC", "VQ"];
  const METRIC_NAMES = { SF: "Source faithfulness", SC: "Story continuity", IF: "Interaction fulfillment",
    JCS: "Joint constraint satisfaction", VC: "Visual consistency", VQ: "Video quality" };
  const METHODS = ["VIS-Ground", "Direct Generation", "MM-StoryAgent", "MovieAgent", "VideoGen-of-Thought"];
  const COLOR = { "VIS-Ground": "#2a78d6", "Direct Generation": "#eb6834", "MM-StoryAgent": "#1baf7a",
    "MovieAgent": "#eda100", "VideoGen-of-Thought": "#e87ba4" };
  const BACKBONES = Object.keys(T1);
  const SHAPE = { "Omni-1.1-Flash": "circle", "Veo 3.1": "square", "MiniMax-H3": "diamond" };
  const INK = "#111318", INK2 = "#3c4250", MUTED = "#6b7280", GRID = "#eceef2", AXIS = "#d5d8de";
  const SURF = "#fff", DARK_TXT = "#111318"; // chart surface and text on light fills
  const POS = "#2a78d6", NEG = "#e34948";
  const NS = "http://www.w3.org/2000/svg";
  const WM = "bryxbgrbry", WM_FILL = { b: "#4285f4", r: "#ea4335", y: "#fbbc05", g: "#34a853" };

  /* ---------- helpers ---------- */
  const row = (bb, m) => T1[bb].find((r) => r[0] === m);
  const val = (bb, m, setting, k) => {
    const r = row(bb, m);
    if (setting === "Narrative") return r[1][k];
    if (setting === "Knowledge") return r[2][k];
    return (r[1][k] + r[2][k]) / 2;
  };
  const avgBB = (m, setting, k) => BACKBONES.reduce((s, bb) => s + val(bb, m, setting, k), 0) / BACKBONES.length;
  const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

  function s(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, attrs = {}) {
    const t = s("text", { x, y, fill: INK2, "font-size": 12, ...attrs }, parent);
    if (str === "VIS-Ground") {
      // wordmark, letter colours as in the paper
      t.setAttribute("font-style", "italic");
      [...str].forEach((c, i) => {
        const fill = WM[i] === "x" ? attrs.fill || INK2 : WM_FILL[WM[i]];
        s("tspan", { fill }, t).textContent = c;
      });
    } else t.textContent = str;
    return t;
  }
  function marker(parent, shape, cx, cy, r, fill) {
    if (shape === "square") return s("rect", { x: cx - r * 0.9, y: cy - r * 0.9, width: r * 1.8, height: r * 1.8, rx: 2, fill, stroke: SURF, "stroke-width": 2 }, parent);
    if (shape === "diamond") return s("path", { d: `M${cx},${cy - r * 1.25}L${cx + r * 1.25},${cy}L${cx},${cy + r * 1.25}L${cx - r * 1.25},${cy}Z`, fill, stroke: SURF, "stroke-width": 2 }, parent);
    return s("circle", { cx, cy, r, fill, stroke: SURF, "stroke-width": 2 }, parent);
  }

  /* ---------- tooltip ---------- */
  const tip = document.createElement("div");
  tip.className = "viz-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(evt, title, rows, anchorEl) {
    tip.replaceChildren();
    if (title) {
      const h = document.createElement("div");
      h.className = "viz-tip-title";
      h.textContent = title;
      tip.appendChild(h);
    }
    rows.forEach((r) => {
      const d = document.createElement("div");
      d.className = "viz-tip-row" + (r.strong ? " strong" : "");
      if (r.color) {
        const k = document.createElement("span");
        k.className = "viz-key";
        k.style.background = r.color;
        d.appendChild(k);
      }
      const v = document.createElement("b");
      v.textContent = r.value;
      const l = document.createElement("span");
      l.textContent = r.label;
      d.append(v, l);
      tip.appendChild(d);
    });
    tip.hidden = false;
    let x, y;
    if (evt && evt.clientX != null && evt.type !== "focus") { x = evt.clientX; y = evt.clientY; }
    else { const b = (anchorEl || evt.target).getBoundingClientRect(); x = b.left + b.width / 2; y = b.top; }
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 14, top = y - th - 12;
    if (left + tw > innerWidth - 8) left = x - tw - 14;
    if (top < 8) top = y + 16;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${top}px`;
  }
  const hideTip = () => (tip.hidden = true);
  function hoverable(el, fn) {
    el.setAttribute("tabindex", "0");
    el.style.cursor = "default";
    el.addEventListener("pointermove", (e) => fn(e));
    el.addEventListener("focus", (e) => fn(e));
    el.addEventListener("pointerleave", hideTip);
    el.addEventListener("blur", hideTip);
  }

  /* ---------- chart shell: responsive svg + legend + table view ---------- */
  function mount(id, draw, opts = {}) {
    const host = document.getElementById(id);
    if (!host) return;
    const svgBox = host.querySelector(".viz-svg");
    let last = 0;
    const render = () => {
      const w = Math.round(svgBox.clientWidth);
      if (!w || w === last) return;
      last = w;
      svgBox.replaceChildren();
      draw(svgBox, w);
    };
    host._rerender = () => { last = 0; render(); };
    new ResizeObserver(render).observe(svgBox); // first draw happens on the initial observation
    return host;
  }
  function segControl(host, sel, options, initial, onChange) {
    const box = host.querySelector(sel);
    let cur = initial;
    box.replaceChildren();
    options.forEach((o) => {
      const b = document.createElement("button");
      b.textContent = o;
      b.setAttribute("aria-pressed", String(o === cur));
      b.addEventListener("click", () => {
        cur = o;
        box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.textContent === cur)));
        onChange(cur);
      });
      box.appendChild(b);
    });
  }
  function tableView(host, headers, rows) {
    const t = host.querySelector(".viz-table");
    if (!t) return;
    const tb = document.createElement("table");
    const tr = document.createElement("tr");
    headers.forEach((h) => { const th = document.createElement("th"); th.textContent = h; tr.appendChild(th); });
    tb.appendChild(tr);
    rows.forEach((r) => {
      const tr2 = document.createElement("tr");
      r.forEach((c) => { const td = document.createElement("td"); td.textContent = c; tr2.appendChild(td); });
      tb.appendChild(tr2);
    });
    t.replaceChildren(tb);
  }
  function legend(host, items, onToggle) {
    const box = host.querySelector(".viz-legend");
    box.replaceChildren();
    items.forEach((it) => {
      const b = document.createElement(onToggle ? "button" : "span");
      b.className = "viz-leg";
      const k = document.createElement("span");
      k.className = "viz-leg-key " + (it.kind || "line");
      if (it.shape) k.dataset.shape = it.shape;
      k.style.setProperty("--c", it.color || MUTED);
      const l = document.createElement("span");
      l.textContent = it.label;
      b.append(k, l);
      if (onToggle) {
        b.setAttribute("aria-pressed", "true");
        b.addEventListener("click", () => {
          const on = b.getAttribute("aria-pressed") !== "true";
          b.setAttribute("aria-pressed", String(on));
          onToggle(it.label, on);
        });
      }
      box.appendChild(b);
    });
  }
  function yAxis(g, x0, x1, y, ticks, fmt = (t) => t) {
    ticks.forEach((t) => {
      const yy = y(t);
      s("line", { x1: x0, x2: x1, y1: yy, y2: yy, stroke: GRID, "stroke-width": 1 }, g);
      text(g, x0 - 8, yy + 4, fmt(t), { "text-anchor": "end", fill: MUTED, "font-size": 11 });
    });
  }

  /* =========================================================
     A. Six-dimension profile (Fig. 5 right / Fig. 6 left)
     ========================================================= */
  (() => {
    let bb = "Average", setting = "Equal weights";
    const hidden = new Set();
    const host = mount("vizProfile", draw);
    if (!host) return;
    segControl(host, ".viz-bb", ["Average", ...BACKBONES], bb, (v) => { bb = v; host._rerender(); });
    segControl(host, ".viz-set", ["Equal weights", "Narrative", "Knowledge"], setting, (v) => { setting = v; host._rerender(); });
    legend(host, METHODS.map((m) => ({ label: m === "VIS-Ground" ? "VIS-Ground (ours)" : m, color: COLOR[m] })), (label, on) => {
      const m = label.replace(" (ours)", "");
      on ? hidden.delete(m) : hidden.add(m);
      host._rerender();
    });
    function v(m, k) {
      const st = setting === "Equal weights" ? null : setting;
      const i = METRICS.indexOf(k);
      return bb === "Average" ? avgBB(m, st, i) : val(bb, m, st, i);
    }
    function draw(box, W) {
      const H = Math.max(280, Math.min(380, W * 0.5));
      const m = { l: 44, r: W < 560 ? 16 : 150, t: 16, b: 34 };
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
        "aria-label": `Scores on six metrics for each method (${bb}, ${setting})` }, box);
      const lo = 20, hi = 100;
      const y = (t) => m.t + (H - m.t - m.b) * (1 - (t - lo) / (hi - lo));
      const step = (W - m.l - m.r) / (METRICS.length - 1);
      const x = (i) => m.l + i * step;
      yAxis(svg, m.l, W - m.r, y, [20, 40, 60, 80, 100]);
      METRICS.forEach((k, i) => text(svg, x(i), H - 10, k, { "text-anchor": "middle", fill: INK2, "font-weight": 600 }));
      const band = s("rect", { x: 0, y: m.t, width: step, height: H - m.t - m.b, fill: "#f3f4f7", opacity: 0 }, svg);
      const hair = s("line", { y1: m.t, y2: H - m.b, stroke: AXIS, "stroke-width": 1, opacity: 0 }, svg);
      const shown = METHODS.filter((mm) => !hidden.has(mm));
      [...shown].reverse().forEach((mm) => {
        const ours = mm === "VIS-Ground";
        const pts = METRICS.map((k, i) => [x(i), y(v(mm, k))]);
        s("path", { d: "M" + pts.map((p) => p.join(",")).join("L"), fill: "none", stroke: COLOR[mm],
          "stroke-width": ours ? 3 : 2, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: ours ? 1 : 0.9 }, svg);
        pts.forEach((p) => s("circle", { cx: p[0], cy: p[1], r: ours ? 4.5 : 3.5, fill: COLOR[mm], stroke: SURF, "stroke-width": 2 }, svg));
      });
      // direct label: ours at the right end (selective)
      if (!hidden.has("VIS-Ground") && W >= 560) {
        const yy = y(v("VIS-Ground", "VQ"));
        text(svg, x(5) + 12, yy + 4, "VIS-Ground", { fill: INK, "font-weight": 700 });
      }
      // crosshair hit layer
      const hit = s("rect", { x: m.l - step / 2, y: m.t, width: W - m.l - m.r + step, height: H - m.t - m.b, fill: "transparent" }, svg);
      const onMove = (e) => {
        const r = svg.getBoundingClientRect();
        const px = (e.clientX - r.left) * (W / r.width);
        const i = Math.max(0, Math.min(5, Math.round((px - m.l) / step)));
        band.setAttribute("x", x(i) - step / 2); band.setAttribute("opacity", 1);
        hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i)); hair.setAttribute("opacity", 1);
        const k = METRICS[i];
        const rows = shown.map((mm) => ({ mm, v: v(mm, k) })).sort((a, b) => b.v - a.v)
          .map(({ mm, v: vv }) => ({ value: f1(vv), label: mm === "VIS-Ground" ? "VIS-Ground (ours)" : mm, color: COLOR[mm], strong: mm === "VIS-Ground" }));
        showTip(e, `${METRIC_NAMES[k]} · ${bb === "Average" ? "avg. of 3 backbones" : bb}`, rows);
      };
      hit.addEventListener("pointermove", onMove);
      hit.addEventListener("pointerleave", () => { hideTip(); band.setAttribute("opacity", 0); hair.setAttribute("opacity", 0); });
      svg.insertBefore(band, svg.firstChild.nextSibling);
      tableView(host, ["Method", ...METRICS], METHODS.map((mm) => [mm, ...METRICS.map((k) => f1(v(mm, k)))]));
    }
    host._rerender();
  })();

  /* =========================================================
     B. Composite across backbones (Fig. 5 left)
     ========================================================= */
  (() => {
    const order = ["VIS-Ground", "MovieAgent", "VideoGen-of-Thought", "MM-StoryAgent", "Direct Generation"];
    const host = mount("vizComposite", draw);
    if (!host) return;
    legend(host, BACKBONES.map((b) => ({ label: b, kind: "shape", shape: SHAPE[b], color: INK2 })));
    function draw(box, W) {
      const rowH = 46;
      const m = { l: 150, r: 64, t: 10, b: 34 };
      const H = m.t + m.b + rowH * order.length;
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Composite score of each method on three backbones" }, box);
      const lo = 30, hi = 90;
      const x = (t) => m.l + (W - m.l - m.r) * ((t - lo) / (hi - lo));
      [30, 45, 60, 75, 90].forEach((t) => {
        s("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, stroke: GRID }, svg);
        text(svg, x(t), H - 12, t, { "text-anchor": "middle", fill: MUTED, "font-size": 11 });
      });
      order.forEach((mm, i) => {
        const cy = m.t + rowH * i + rowH / 2;
        const vals = BACKBONES.map((b) => row(b, mm)[3]);
        const mn = Math.min(...vals), mx = Math.max(...vals);
        const ours = mm === "VIS-Ground";
        text(svg, m.l - 12, cy + 4, ours ? "VIS-Ground" : mm, { "text-anchor": "end", fill: ours ? INK : INK2, "font-weight": ours ? 700 : 500, "font-size": 12.5 });
        s("line", { x1: x(mn), x2: x(mx), y1: cy, y2: cy, stroke: COLOR[mm], "stroke-width": 3, "stroke-linecap": "round", opacity: 0.35 }, svg);
        BACKBONES.forEach((b) => {
          const r = row(b, mm);
          const g = s("g", { "aria-label": `${mm}, ${b}: ${r[3]}` }, svg);
          s("circle", { cx: x(r[3]), cy, r: 13, fill: "transparent" }, g);
          marker(g, SHAPE[b], x(r[3]), cy, 6, COLOR[mm]);
          hoverable(g, (e) => showTip(e, `${mm} · ${b}`, [
            { value: f1(r[3]), label: "composite score", color: COLOR[mm], strong: true },
            { value: `[${r[4]}]`, label: "95% CI" }], g));
        });
        text(svg, x(mx) + 14, cy + 4, `range ${f1(mx - mn)}`, { fill: MUTED, "font-size": 11.5 });
      });
      tableView(host, ["Method", ...BACKBONES, "Range"], order.map((mm) => {
        const vals = BACKBONES.map((b) => row(b, mm)[3]);
        return [mm, ...vals.map(f1), f1(Math.max(...vals) - Math.min(...vals))];
      }));
    }
  })();

  /* =========================================================
     C. JCS gain over the strongest baseline (Fig. 6 right)
     ========================================================= */
  (() => {
    const items = [];
    BACKBONES.forEach((b) => ["Narrative", "Knowledge"].forEach((st, g) => {
      const ours = row(b, "VIS-Ground")[g + 1][3];
      const base = T1[b].filter((r) => r[0] !== "VIS-Ground").map((r) => ({ m: r[0], v: r[g + 1][3] })).sort((a, c) => c.v - a.v)[0];
      items.push({ label: `${b.split(" ")[0].replace("-1.1-Flash", "")} · ${st}`, bb: b, st, ours, base, gain: ours - base.v });
    }));
    const host = mount("vizGain", draw);
    if (!host) return;
    function draw(box, W) {
      const rowH = 38, m = { l: W < 520 ? 132 : 150, r: 56, t: 6, b: 30 };
      const H = m.t + m.b + rowH * items.length;
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "JCS gain over the strongest baseline" }, box);
      const x = (t) => m.l + (W - m.l - m.r) * (t / 20);
      [0, 5, 10, 15, 20].forEach((t) => {
        s("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, stroke: t === 0 ? AXIS : GRID }, svg);
        text(svg, x(t), H - 10, t, { "text-anchor": "middle", fill: MUTED, "font-size": 11 });
      });
      items.forEach((it, i) => {
        const y0 = m.t + rowH * i;
        text(svg, m.l - 12, y0 + rowH / 2 + 4, it.label, { "text-anchor": "end", fill: INK2, "font-size": 12.5 });
        const g = s("g", { "aria-label": `${it.label}: +${f1(it.gain)} JCS` }, svg);
        s("rect", { x: m.l, y: y0 + 4, width: W - m.l - m.r, height: rowH - 8, fill: "transparent" }, g);
        const bw = x(it.gain) - m.l;
        s("path", { d: `M${m.l},${y0 + 9}h${bw - 4}a4,4 0 0 1 4,4v${rowH - 26}a4,4 0 0 1 -4,4h${-(bw - 4)}z`, fill: POS }, g);
        text(g, x(it.gain) + 8, y0 + rowH / 2 + 4, `+${f1(it.gain)}`, { fill: INK, "font-weight": 700 });
        hoverable(g, (e) => showTip(e, it.label, [
          { value: `+${f1(it.gain)}`, label: "JCS gain", color: POS, strong: true },
          { value: f1(it.ours), label: "VIS-Ground" },
          { value: f1(it.base.v), label: `best baseline (${it.base.m})` }], g));
      });
      tableView(host, ["Backbone · setting", "Ours JCS", "Best baseline", "Baseline JCS", "Gain"],
        items.map((it) => [it.label, f1(it.ours), it.base.m, f1(it.base.v), "+" + f1(it.gain)]));
    }
  })();

  /* =========================================================
     D. Ours − IF-leading baseline (Fig. 8, all six settings)
     ========================================================= */
  (() => {
    const combos = [];
    BACKBONES.forEach((b) => ["Narrative", "Knowledge"].forEach((st) => combos.push(`${b} · ${st}`)));
    let cur = "Omni-1.1-Flash · Narrative";
    const host = mount("vizDelta", draw);
    if (!host) return;
    segControl(host, ".viz-combo", combos, cur, (v) => { cur = v; host._rerender(); });
    function draw(box, W) {
      const [b, st] = cur.split(" · ");
      const g = st === "Narrative" ? 1 : 2;
      const base = T1[b].filter((r) => r[0] !== "VIS-Ground").sort((a, c) => c[g][2] - a[g][2])[0];
      const ours = row(b, "VIS-Ground");
      const ks = ["SF", "SC", "IF", "JCS"];
      const d = ks.map((k) => ({ k, o: ours[g][METRICS.indexOf(k)], b: base[g][METRICS.indexOf(k)] })).map((r) => ({ ...r, v: r.o - r.b }));
      host.querySelector(".viz-note").textContent = `Compared with ${base[0]}, the baseline with the highest Interaction Fulfillment in this setting.`;
      const H = 300, m = { l: 44, r: 16, t: 18, b: 34 };
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `Ours minus ${base[0]} on SF, SC, IF, JCS` }, box);
      const lo = -10, hi = 55;
      const y = (t) => m.t + (H - m.t - m.b) * (1 - (t - lo) / (hi - lo));
      yAxis(svg, m.l, W - m.r, y, [-10, 0, 10, 20, 30, 40, 50], (t) => (t > 0 ? "+" + t : t));
      s("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: "#9aa0aa", "stroke-width": 1 }, svg);
      const slot = (W - m.l - m.r) / ks.length, bw = Math.min(72, slot * 0.5);
      d.forEach((r, i) => {
        const cx = m.l + slot * (i + 0.5);
        const gg = s("g", { "aria-label": `${r.k}: ${r.v >= 0 ? "+" : ""}${f1(r.v)}` }, svg);
        s("rect", { x: cx - slot / 2 + 4, y: m.t, width: slot - 8, height: H - m.t - m.b, fill: "transparent" }, gg);
        const y0 = y(0), y1 = y(r.v), h = Math.abs(y1 - y0);
        const up = r.v >= 0, rr = Math.min(4, h);
        const path = up
          ? `M${cx - bw / 2},${y0}V${y1 + rr}a${rr},${rr} 0 0 1 ${rr},${-rr}H${cx + bw / 2 - rr}a${rr},${rr} 0 0 1 ${rr},${rr}V${y0}Z`
          : `M${cx - bw / 2},${y0}V${y1 - rr}a${rr},${rr} 0 0 0 ${rr},${rr}H${cx + bw / 2 - rr}a${rr},${rr} 0 0 0 ${rr},${-rr}V${y0}Z`;
        s("path", { d: path, fill: up ? POS : NEG }, gg);
        text(gg, cx, up ? y1 - 8 : y1 + 16, `${up ? "+" : ""}${f1(r.v)}`, { "text-anchor": "middle", fill: INK, "font-weight": 700 });
        text(svg, cx, H - 10, r.k, { "text-anchor": "middle", fill: INK2, "font-weight": 600 });
        hoverable(gg, (e) => showTip(e, `${METRIC_NAMES[r.k]} · ${cur}`, [
          { value: `${up ? "+" : ""}${f1(r.v)}`, label: "difference", color: up ? POS : NEG, strong: true },
          { value: f1(r.o), label: "VIS-Ground" },
          { value: f1(r.b), label: base[0] }], gg));
      });
      tableView(host, ["Metric", "Ours", base[0], "Difference"], d.map((r) => [r.k, f1(r.o), f1(r.b), (r.v >= 0 ? "+" : "") + f1(r.v)]));
    }
  })();

  /* =========================================================
     E. Score distribution in the 72-output sample (Fig. 9)
     ========================================================= */
  (() => {
    const BUCKETS = ["<50", "50–<75", "75–<100", "100"];
    const RAMP = ["#86b6ef", "#3987e5", "#1c5cab", "#0d366b"]; // ordinal blue, validated
    const DATA = [["Source faithfulness", [1, 4, 52, 15]], ["Story continuity", [0, 8, 56, 8]],
      ["Interaction fulfillment", [0, 8, 53, 11]], ["Visual consistency", [19, 53, 0, 0]], ["Video quality", [1, 65, 6, 0]]];
    const host = mount("vizSeverity", draw);
    if (!host) return;
    legend(host, BUCKETS.map((b, i) => ({ label: b, color: RAMP[i], kind: "rect" })));
    function draw(box, W) {
      const rowH = 40, m = { l: W < 520 ? 140 : 168, r: 16, t: 4, b: 30 };
      const H = m.t + m.b + rowH * DATA.length;
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Score distribution by evaluation dimension, 72 outputs" }, box);
      const x = (t) => m.l + (W - m.l - m.r) * (t / 72);
      [0, 18, 36, 54, 72].forEach((t) => text(svg, x(t), H - 10, `${Math.round((t / 72) * 100)}%`, { "text-anchor": "middle", fill: MUTED, "font-size": 11 }));
      DATA.forEach(([name, counts], i) => {
        const y0 = m.t + rowH * i + 6, h = rowH - 12;
        text(svg, m.l - 12, y0 + h / 2 + 4, name, { "text-anchor": "end", fill: INK2, "font-size": 12.5 });
        let acc = 0;
        counts.forEach((c, k) => {
          if (!c) return;
          const xa = x(acc) + (acc ? 1 : 0), xb = x(acc + c) - (acc + c < 72 ? 1 : 0); // 2px surface gap
          const gg = s("g", { "aria-label": `${name}, ${BUCKETS[k]}: ${c} of 72` }, svg);
          s("rect", { x: xa, y: y0, width: Math.max(1, xb - xa), height: h, rx: 3, fill: RAMP[k] }, gg);
          if (xb - xa > 26) text(gg, (xa + xb) / 2, y0 + h / 2 + 4, c, { "text-anchor": "middle", fill: k === 0 ? DARK_TXT : "#fff", "font-weight": 600, "font-size": 11.5 });
          hoverable(gg, (e) => showTip(e, `${name} · score ${BUCKETS[k]}`, [
            { value: `${c} of 72`, label: `outputs (${Math.round((c / 72) * 100)}%)`, color: RAMP[k], strong: true }], gg));
          acc += c;
        });
      });
      tableView(host, ["Dimension", ...BUCKETS], DATA.map(([n, c]) => [n, ...c.map(String)]));
    }
  })();

  /* =========================================================
     F. Formative study: within-participant learning gains (Fig. 2 left)
     ========================================================= */
  (() => {
    // values read from Figure 2; means match the reported 32.1 and 47.9
    const P = [[60, 75], [50, 55], [25, 40], [25, 40], [25, 40], [20, 45], [20, 40]];
    const mean = [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length];
    const host = mount("vizGains", draw);
    if (!host) return;
    legend(host, [{ label: "Participant (n = 7)", color: "#b9bec8" }, { label: "Mean", color: POS }]);
    function draw(box, W) {
      const H = 300, m = { l: 44, r: 70, t: 14, b: 40 };
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Learning gain without and with interaction" }, box);
      const y = (t) => m.t + (H - m.t - m.b) * (1 - t / 100);
      const xA = m.l + (W - m.l - m.r) * 0.18, xB = m.l + (W - m.l - m.r) * 0.82;
      yAxis(svg, m.l, W - m.r, y, [0, 20, 40, 60, 80, 100]);
      text(svg, xA, H - 14, "Non-interactive", { "text-anchor": "middle", fill: INK2, "font-weight": 600 });
      text(svg, xB, H - 14, "Interactive", { "text-anchor": "middle", fill: INK2, "font-weight": 600 });
      const lines = [];
      P.forEach((p, i) => {
        const jit = (i % 3 - 1) * 4;
        const g = s("g", { "aria-label": `Participant: ${p[0]} to ${p[1]} points` }, svg);
        s("line", { x1: xA + jit, x2: xB + jit, y1: y(p[0]), y2: y(p[1]), stroke: "transparent", "stroke-width": 14 }, g);
        const ln = s("line", { x1: xA + jit, x2: xB + jit, y1: y(p[0]), y2: y(p[1]), stroke: "#c3c7cf", "stroke-width": 1.5 }, g);
        const c1 = s("circle", { cx: xA + jit, cy: y(p[0]), r: 4, fill: "#b9bec8", stroke: SURF, "stroke-width": 2 }, g);
        const c2 = s("circle", { cx: xB + jit, cy: y(p[1]), r: 4, fill: "#b9bec8", stroke: SURF, "stroke-width": 2 }, g);
        lines.push([ln, c1, c2]);
        hoverable(g, (e) => {
          lines.forEach(([l, a, b]) => { l.setAttribute("stroke", "#c3c7cf"); a.setAttribute("fill", "#b9bec8"); b.setAttribute("fill", "#b9bec8"); });
          ln.setAttribute("stroke", INK2); c1.setAttribute("fill", INK2); c2.setAttribute("fill", INK2);
          showTip(e, "One participant", [
            { value: `+${p[1] - p[0]}`, label: "extra gain with interaction", strong: true },
            { value: `${p[0]} → ${p[1]}`, label: "learning gain (pp)" }], g);
        });
        g.addEventListener("pointerleave", () => { ln.setAttribute("stroke", "#c3c7cf"); c1.setAttribute("fill", "#b9bec8"); c2.setAttribute("fill", "#b9bec8"); });
      });
      const gm = s("g", { "aria-label": `Mean: ${f1(mean[0])} to ${f1(mean[1])}` }, svg);
      s("line", { x1: xA, x2: xB, y1: y(mean[0]), y2: y(mean[1]), stroke: "transparent", "stroke-width": 14 }, gm);
      s("line", { x1: xA, x2: xB, y1: y(mean[0]), y2: y(mean[1]), stroke: POS, "stroke-width": 3, "stroke-linecap": "round" }, gm);
      [[xA, mean[0]], [xB, mean[1]]].forEach(([xx, v]) => marker(gm, "diamond", xx, y(v), 6, POS));
      text(gm, xA - 12, y(mean[0]) + 4, `+${f1(mean[0])}`, { "text-anchor": "end", fill: INK, "font-weight": 700, "font-size": 13 });
      text(gm, xB + 12, y(mean[1]) + 4, `+${f1(mean[1])}`, { fill: INK, "font-weight": 700, "font-size": 13 });
      hoverable(gm, (e) => showTip(e, "Mean of 7 participants", [
        { value: `+${f1(mean[1])}`, label: "with interaction (pp)", color: POS, strong: true },
        { value: `+${f1(mean[0])}`, label: "without interaction (pp)" },
        { value: `+${f1(mean[1] - mean[0])}`, label: "difference" }], gm));
      tableView(host, ["", "Non-interactive", "Interactive"], [...P.map((p, i) => [`Participant ${i + 1}`, p[0], p[1]]), ["Mean", f1(mean[0]), f1(mean[1])]]);
    }
  })();

  /* =========================================================
     G. Formative study: experience ratings (Fig. 2 right)
     ========================================================= */
  (() => {
    const LEVELS = ["1", "2", "3", "4", "5"];
    const LCOL = ["#e34948", "#f19a8f", "#d9d7d1", "#86b6ef", "#2a78d6"]; // diverging red ↔ blue, gray midpoint
    const DATA = [["Story consistency", [0, 0, 0, 2, 2]], ["Clarity / coherence", [0, 0, 1, 1, 2]], ["Helped understanding", [0, 0, 1, 0, 3]],
      ["Satisfaction", [0, 0, 1, 0, 3]], ["Enjoyment", [0, 0, 1, 2, 1]], ["Would use again", [0, 0, 0, 2, 2]]];
    const host = mount("vizRatings", draw);
    if (!host) return;
    legend(host, LEVELS.map((l, i) => ({ label: ["1 strongly disagree", "2", "3 neutral", "4", "5 strongly agree"][i], color: LCOL[i], kind: "rect" })));
    function draw(box, W) {
      const rowH = 38, m = { l: W < 520 ? 140 : 160, r: 16, t: 4, b: 28 };
      const H = m.t + m.b + rowH * DATA.length;
      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Interactive experience ratings from four respondents" }, box);
      const x = (t) => m.l + (W - m.l - m.r) * (t / 4);
      [0, 1, 2, 3, 4].forEach((t) => text(svg, x(t), H - 8, t, { "text-anchor": "middle", fill: MUTED, "font-size": 11 }));
      DATA.forEach(([name, counts], i) => {
        const y0 = m.t + rowH * i + 6, h = rowH - 12;
        text(svg, m.l - 12, y0 + h / 2 + 4, name, { "text-anchor": "end", fill: INK2, "font-size": 12.5 });
        let acc = 0;
        counts.forEach((c, k) => {
          if (!c) return;
          const xa = x(acc) + (acc ? 1 : 0), xb = x(acc + c) - (acc + c < 4 ? 1 : 0);
          const gg = s("g", { "aria-label": `${name}, rating ${k + 1}: ${c} of 4` }, svg);
          s("rect", { x: xa, y: y0, width: xb - xa, height: h, rx: 3, fill: LCOL[k] }, gg);
          text(gg, (xa + xb) / 2, y0 + h / 2 + 4, `${k + 1}`, { "text-anchor": "middle", fill: k >= 4 || k === 0 ? "#fff" : DARK_TXT, "font-weight": 600, "font-size": 11.5 });
          hoverable(gg, (e) => showTip(e, `${name} · rating ${k + 1}`, [{ value: `${c} of 4`, label: "respondents", color: LCOL[k], strong: true }], gg));
          acc += c;
        });
      });
      tableView(host, ["Item", ...LEVELS.map((l) => `Rating ${l}`)], DATA.map(([n, c]) => [n, ...c.map(String)]));
    }
  })();
})();
