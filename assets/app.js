(() => {
  const D = window.SITE_DATA;
  const $ = (id) => document.getElementById(id);
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const poster = (file) => file.replace(/\.mp4$/, ".jpg");

  function tabs(container, items, onSelect, initial = 0) {
    container.innerHTML = "";
    const btns = items.map((label, i) => {
      const b = el("button", null, esc(label));
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => select(i));
      container.appendChild(b);
      return b;
    });
    function select(i) {
      btns.forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
      onSelect(i);
    }
    select(initial);
    return select;
  }

  /* =============================================================
     1. Interactive demo: real viewing sessions you can steer
     ============================================================= */
  const demo = {
    video: $("demoVideo"),
    session: null,
    state: [], // per pause: {status: 'pending'|'asked'|'skipped', chosen: Set}
    open: -1,
    started: false,
  };
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';
  const ICON_VOL = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_MUTE = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function topicSessions(topicId) {
    return D.real.sessions.filter((s) => s.topic === topicId);
  }

  function loadSession(s) {
    const v = demo.video;
    v.pause();
    demo.session = s;
    demo.state = s.pauses.map(() => ({ status: "pending", chosen: new Set() }));
    demo.open = -1;
    demo.started = false;
    v.src = s.file;
    v.poster = poster(s.file);
    v.load();
    const topic = D.real.topics.find((t) => t.id === s.topic);
    $("demoTitle").textContent = topic.title;
    $("demoMeta").textContent = `${topic.kind} · ${topic.style}`;
    $("askOverlay").hidden = true;
    $("answerBand").hidden = true;
    $("demoStart").hidden = false;
    $("demoToast").hidden = true;
    renderMarks();
    renderLog();
    updateBar();
  }

  function skipSpans() {
    const spans = [];
    demo.session.pauses.forEach((p, i) => {
      const st = demo.state[i];
      p.items.forEach((it, k) => {
        if (st.status === "skipped" || (st.status === "asked" && !st.chosen.has(k))) spans.push(it.a);
      });
    });
    return spans;
  }

  function askedSpanAt(t) {
    for (const [i, p] of demo.session.pauses.entries()) {
      const st = demo.state[i];
      if (st.status !== "asked") continue;
      for (const [k, it] of p.items.entries()) {
        if (st.chosen.has(k) && t >= it.a[0] && t < it.a[1]) return it;
      }
    }
    return null;
  }

  function openAsk(i) {
    const v = demo.video;
    v.pause();
    demo.open = i;
    const p = demo.session.pauses[i];
    const st = demo.state[i];
    const chips = $("askChips");
    chips.innerHTML = "";
    p.items.forEach((it, k) => {
      const c = el("button", "chip", esc(it.q));
      c.setAttribute("aria-pressed", "false");
      c.addEventListener("click", () => {
        if (st.chosen.has(k)) st.chosen.delete(k); else st.chosen.add(k);
        c.setAttribute("aria-pressed", String(st.chosen.has(k)));
        $("askBtn").disabled = st.chosen.size === 0;
      });
      chips.appendChild(c);
    });
    if (p.items.length === 1) {
      st.chosen.add(0);
      chips.firstChild.setAttribute("aria-pressed", "true");
    }
    $("askBtn").disabled = st.chosen.size === 0;
    $("askBtn").textContent = p.items.length > 1 ? "Ask selected" : "Ask";
    $("askOverlay").hidden = false;
    renderLog();
  }

  function closeAsk(asked) {
    const i = demo.open;
    if (i < 0) return;
    const st = demo.state[i];
    st.status = asked ? "asked" : "skipped";
    if (!asked) st.chosen.clear();
    demo.open = -1;
    $("askOverlay").hidden = true;
    renderMarks();
    renderLog();
    if (asked) {
      const p = demo.session.pauses[i];
      const first = Math.min(...[...st.chosen].map((k) => p.items[k].a[0]));
      if (first - demo.video.currentTime > 1.5) toast("Question sent. The answer is inserted at the next scene boundary.");
    }
    demo.video.play().catch(() => {});
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("demoToast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }

  function renderMarks() {
    const m = $("pbMarks");
    m.innerHTML = "";
    const dur = demo.session.duration;
    demo.session.pauses.forEach((p, i) => {
      const d = el("span", "pb-mark " + (demo.state[i].status === "pending" ? "" : demo.state[i].status));
      d.style.left = `${(p.t / dur) * 100}%`;
      m.appendChild(d);
    });
  }

  function renderLog() {
    const log = $("qLog");
    log.innerHTML = "";
    demo.session.pauses.forEach((p, i) => {
      const st = demo.state[i];
      const li = el("li", st.status);
      const label = { pending: "Pause point", asked: "You asked", skipped: "Skipped" }[st.status];
      li.appendChild(el("span", "when", `${label} · ${fmt(p.t)}`));
      p.items.forEach((it, k) => {
        const dim = st.status === "asked" && !st.chosen.has(k);
        const q = el("span", "q" + (dim ? " dim" : ""), st.status === "pending" && demo.open !== i ? "A real viewer's question will appear here" : "“" + esc(it.q) + "”");
        li.appendChild(q);
      });
      log.appendChild(li);
    });
  }

  function updateBar() {
    const v = demo.video;
    const dur = demo.session ? demo.session.duration : v.duration || 0;
    $("pbFill").style.width = `${Math.min(100, (v.currentTime / dur) * 100)}%`;
    $("pbTime").textContent = `${fmt(v.currentTime)} / ${fmt(dur)}`;
    $("pbPlay").innerHTML = v.paused ? ICON_PLAY : ICON_PAUSE;
    $("pbMute").innerHTML = v.muted ? ICON_MUTE : ICON_VOL;
  }

  let lastT = 0;
  function tick() {
    const v = demo.video;
    if (demo.session && !v.paused && demo.open < 0) {
      const t = v.currentTime;
      // pause points crossed during normal playback
      demo.session.pauses.forEach((p, i) => {
        if (demo.state[i].status !== "pending" || demo.open >= 0) return;
        if (lastT <= p.t && t >= p.t && t - lastT < 1.0) openAsk(i);
        else if (t > p.t + 1.0) { demo.state[i].status = "skipped"; renderMarks(); renderLog(); } // jumped past it
      });
      // skip answers that were not asked
      if (demo.open < 0) {
        for (const [a, b] of skipSpans()) {
          if (t >= a - 0.05 && t < b) {
            v.currentTime = b + 0.05;
            break;
          }
        }
      }
    }
    if (demo.session) {
      const it = askedSpanAt(v.currentTime);
      $("answerBand").hidden = !it;
      if (it) $("answerQ").textContent = "“" + it.q + "”";
      lastT = v.currentTime;
      updateBar();
    }
    requestAnimationFrame(tick);
  }

  function initDemo() {
    const v = demo.video;
    let sessTabs = null;
    tabs($("topicTabs"), D.real.topics.map((t) => t.title.replace(/ \(AWR\)/, "")), (ti) => {
      const list = topicSessions(D.real.topics[ti].id);
      const box = $("sessionTabs");
      box.hidden = list.length < 2;
      sessTabs = tabs(box, list.map((_, i) => `Session ${i + 1}`), (si) => loadSession(list[si]));
    });
    $("demoStartBtn").addEventListener("click", () => {
      $("demoStart").hidden = true;
      demo.started = true;
      v.play().catch(() => ($("demoStart").hidden = false));
    });
    $("askBtn").addEventListener("click", () => closeAsk(true));
    $("skipBtn").addEventListener("click", () => closeAsk(false));
    $("pbPlay").addEventListener("click", () => {
      if (demo.open >= 0) return;
      $("demoStart").hidden = true;
      v.paused ? v.play().catch(() => {}) : v.pause();
    });
    v.addEventListener("click", () => $("pbPlay").click());
    $("pbMute").addEventListener("click", () => (v.muted = !v.muted));
    $("pbFull").addEventListener("click", () => {
      const p = $("demoPlayer");
      document.fullscreenElement ? document.exitFullscreen() : (p.requestFullscreen || p.webkitRequestFullscreen).call(p);
    });
    $("pbTrack").addEventListener("click", (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const t = ((e.clientX - r.left) / r.width) * demo.session.duration;
      // jumping past a pause point counts as skipping it
      demo.session.pauses.forEach((p, i) => {
        if (demo.state[i].status === "pending" && p.t < t - 0.3) demo.state[i].status = "skipped";
      });
      if (demo.open >= 0) { $("askOverlay").hidden = true; demo.open = -1; }
      $("demoStart").hidden = true;
      lastT = t;
      v.currentTime = t;
      renderMarks();
      renderLog();
    });
    v.addEventListener("ended", () => toast("End of session. Pick another session or topic above."));
    requestAnimationFrame(tick);
  }

  /* =============================================================
     2. Branching stories
     ============================================================= */
  const story = { video: $("storyVideo"), s: null, pending: null, typing: null };

  function setBand(kind, text) {
    const tag = $("storyTag");
    tag.className = "now-tag" + (kind === "branch" ? " branch" : kind === "steered" ? " steered" : "");
    tag.textContent = { orig: "Original film", branch: "New continuation", steered: "Steered film" }[kind];
    $("storyNow").textContent = text || "";
  }

  function markActive(btn) {
    document.querySelectorAll("#stories .choice").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
  }

  function playSrc(src, t = 0, autoplay = true) {
    const v = story.video;
    const go = () => {
      v.currentTime = t;
      if (autoplay) v.play().catch(() => {});
    };
    if (!v.src.endsWith(src)) {
      v.src = src;
      v.poster = poster(src);
      v.addEventListener("loadedmetadata", go, { once: true });
      v.load();
    } else go();
  }

  function cancelPending() {
    story.pending = null;
    clearInterval(story.typing);
    $("steerOverlay").hidden = true;
  }

  function loadStory(s) {
    cancelPending();
    story.s = s;
    $("storyTitle").textContent = s.title;
    $("storyMeta").textContent = `${s.author} · ${s.style}`;
    const list = $("branchList");
    list.innerHTML = "";
    s.branches.forEach((b) => {
      const btn = el("button", "choice", `<small>Pause after act ${b.act}, scene ${b.scene} · ${fmt(b.t)}</small>${esc(b.instruction)}`);
      btn.addEventListener("click", () => startBranch(b, btn));
      list.appendChild(btn);
    });
    $("steerBtn").innerHTML = `<b>${esc(s.steered.title)}</b>${esc(s.steered.instruction)}`;
    $("steerBtn").onclick = () => {
      cancelPending();
      markActive($("steerBtn"));
      setBand("steered", s.steered.instruction);
      playSrc(s.steered.file, 0);
    };
    $("origBtn").onclick = () => {
      cancelPending();
      markActive($("origBtn"));
      setBand("orig", "");
      playSrc(s.faithful, 0);
    };
    markActive($("origBtn"));
    setBand("orig", "");
    playSrc(s.faithful, 0, false);
  }

  function startBranch(b, btn) {
    cancelPending();
    markActive(btn);
    setBand("orig", "Watching up to the pause point…");
    story.pending = b;
    playSrc(story.s.faithful, Math.max(0, b.t - 6));
  }

  function storyTick() {
    const v = story.video;
    const b = story.pending;
    if (b && !v.paused && v.src.endsWith(story.s.faithful) && v.currentTime >= b.t - 0.05) {
      v.pause();
      story.pending = null;
      const typed = $("steerTyped");
      typed.textContent = "";
      $("steerOverlay").hidden = false;
      let i = 0;
      story.typing = setInterval(() => {
        typed.textContent = b.instruction.slice(0, ++i);
        if (i >= b.instruction.length) {
          clearInterval(story.typing);
          setTimeout(() => {
            $("steerOverlay").hidden = true;
            setBand("branch", b.instruction);
            playSrc(b.file, 0);
          }, 900);
        }
      }, 28);
    }
    requestAnimationFrame(storyTick);
  }

  function initStories() {
    tabs($("storyTabs"), D.stories.map((s) => s.title), (i) => loadStory(D.stories[i]));
    requestAnimationFrame(storyTick);
  }

  /* =============================================================
     3. Comparisons, failures, results
     ============================================================= */
  const COMPARE = [
    { file: "compare_glasses", tab: "History of glasses", meta: "Knowledge grounding · Cinematic", title: "The Evolution of Sight: A History of Glasses",
      req: "What were the earliest historical uses of glasses before they were used for vision? Please give a direct explanation.",
      v: ["Leaves the requested period", "Shows glasses aiding vision", "Drifts to modern sunglasses", "Continuous, faithful, on scope"] },
    { file: "compare_peter", tab: "Peter Rabbit (cut-out)", meta: "Narrative grounding · Cut-out animation", title: "Peter Rabbit and the Crow's Call",
      req: "Continue following Peter's train of thought and provide a balanced look at what he recalls about the crow's nesting habits.",
      v: ["Loops the same line", "Loses the hiding place", "Invents facts, runs ahead", "Keeps state, follows source"] },
    { file: "compare_peter_cinematic", tab: "Peter Rabbit (cinematic)", meta: "Narrative grounding · Cinematic", title: "Peter Rabbit and the Crow's Call",
      req: "Stay with Peter and focus on his character experience to reveal his internal thoughts about the crow's calls and why he is chuckling.",
      v: ["Fragments; no reason given", "Loses Peter from the frame", "Leaves the hiding place", "Explains the chuckle"] },
    { file: "compare_ralph", tab: "Ralph's journey", meta: "Narrative grounding · Cinematic", title: "Ralph's Long Journey",
      req: "Move the story forward to when Ralph finally completes the journey to his friend George's house. Keep a balanced presentation of the final events.",
      v: ["Style changes, dialogue loops", "Loses Ralph's identity", "Silent; ending not conveyed", "Continuous; full ending narrated"] },
    { file: "compare_loan", tab: "Student loan", meta: "Knowledge grounding · Cut-out animation", title: "The Cost of Education: Eric Hahn's Loan Crisis",
      req: "What happened next with his 8 percent private loan? Show the effect of the situation.",
      v: ["Rushed, scattered facts", "Skips the suspension", "Skips the suspension", "Answers what happened next"] },
  ];
  const METHODS = ["Direct Generation", "MM-StoryAgent", "MovieAgent", "VideoTaleInteract (ours)"];

  function initCompare() {
    tabs($("cmpTabs"), COMPARE.map((c) => c.tab), (i) => {
      const c = COMPARE[i];
      const v = $("cmpVideo");
      v.pause();
      v.src = `assets/videos/${c.file}.mp4`;
      v.poster = `assets/videos/${c.file}.jpg`;
      $("cmpMeta").textContent = c.meta;
      $("cmpTitle").textContent = c.title;
      $("cmpReq").textContent = "“" + c.req + "”";
      const ul = $("cmpVerdicts");
      ul.innerHTML = "";
      c.v.forEach((txt, k) => {
        const li = el("li", k === 3 ? "ours" : "", `<b>${METHODS[k]}</b><span>${esc(txt)}</span>`);
        ul.appendChild(li);
      });
    });
  }

  const FAILS = [
    { file: "failure_1_ralph", title: "Request–source trade-off",
      req: "Continue the story as Ralph leaves the jungle to continue his long journey. Focus on the environmental details of the next place he travels through.",
      text: "Following the environment-focused request crowded out required story events. The continuation is continuous and on-request, but incomplete with respect to the source." },
    { file: "failure_2_glasses_steps", title: "Dependency extraction error",
      req: "How did the transition to using glasses for vision correction happen? Show me step by step.",
      text: "The step-by-step request required recovering the source's ordered chain (Bacon → di Spina). One prerequisite was missed and a later event was pulled forward." },
    { file: "failure_3_glasses_render", title: "Unfaithful rendering",
      req: "How did inventors continue to improve the design of glasses after Kepler's discovery? Show me using an example-based approach.",
      text: "The planned script satisfied its constraints, but the video generator did not realize the planned identities and objects. Script-level validity does not guarantee faithful rendering." },
  ];

  function initFails() {
    const g = $("failGrid");
    FAILS.forEach((f) => {
      const card = el("div", "fcard");
      card.innerHTML = `<div class="video-frame"><video controls playsinline preload="none" poster="assets/videos/${f.file}.jpg"><source src="assets/videos/${f.file}.mp4" type="video/mp4"></video></div>
        <h3>${esc(f.title)}</h3><p class="req">“${esc(f.req)}”</p><p>${esc(f.text)}</p>`;
      g.appendChild(card);
    });
  }

  // Table 1 (arXiv version). Rows: [method, narrative[SF,SC,IF,JCS,VC,VQ], knowledge[...], composite, ci]
  const T = {
    "Omni-1.1-Flash": [
      ["Direct Generation", [83.9, 66.1, 80.4, 76.8, 45.1, 56.2], [59.4, 68.8, 62.5, 63.5, 50.2, 52.6], 70.2, "62.50, 77.83"],
      ["MM-StoryAgent", [90.6, 59.4, 81.2, 77.1, 44.0, 59.4], [37.5, 34.4, 40.6, 37.5, 53.4, 64.9], 57.3, "41.15, 73.44"],
      ["MovieAgent", [85.4, 67.7, 85.4, 79.5, 46.6, 60.9], [65.6, 46.9, 65.6, 59.4, 47.1, 60.4], 69.4, "57.29, 81.60"],
      ["VideoGen-of-Thought", [89.6, 56.3, 86.5, 77.4, 42.7, 58.1], [69.5, 54.2, 75.3, 66.3, 52.4, 63.4], 71.9, "64.50, 78.70"],
      ["VideoTaleInteract", [92.7, 81.3, 90.6, 88.2, 53.0, 62.4], [87.5, 78.1, 75.0, 80.2, 65.4, 68.2], 84.2, "77.78, 90.45"],
    ],
    "Veo 3.1": [
      ["Direct Generation", [76.8, 62.5, 80.4, 73.2, 39.2, 49.7], [62.5, 70.8, 62.5, 65.3, 49.7, 58.5], 69.3, "57.34, 79.37"],
      ["MM-StoryAgent", [70.5, 41.1, 70.5, 60.7, 32.2, 56.1], [50.0, 66.7, 60.4, 59.0, 57.4, 62.4], 59.9, "45.73, 72.07"],
      ["MovieAgent", [89.3, 57.2, 86.6, 77.7, 38.5, 59.7], [64.6, 56.3, 58.3, 59.7, 47.5, 65.7], 68.7, "56.85, 76.39"],
      ["VideoGen-of-Thought", [78.6, 58.0, 81.3, 72.6, 43.7, 60.1], [84.4, 25.0, 72.9, 60.8, 44.3, 62.5], 66.7, "58.55, 74.08"],
      ["VideoTaleInteract", [92.9, 83.0, 84.8, 86.9, 55.9, 62.4], [93.8, 75.0, 78.1, 82.3, 54.8, 64.2], 84.6, "80.95, 88.39"],
    ],
    "MiniMax-H3": [
      ["Direct Generation", [67.0, 42.0, 57.1, 55.4, 34.3, 45.2], [25.0, 6.3, 31.3, 20.8, 20.5, 45.8], 38.1, "27.23, 49.11"],
      ["MM-StoryAgent", [78.6, 57.1, 80.4, 72.0, 39.5, 44.0], [81.3, 31.3, 65.6, 59.4, 43.8, 45.0], 65.7, "55.06, 76.34"],
      ["MovieAgent", [78.6, 65.2, 75.0, 72.9, 39.0, 46.4], [93.8, 58.3, 81.3, 77.8, 54.2, 57.3], 75.4, "68.21, 81.70"],
      ["VideoGen-of-Thought", [67.7, 56.3, 74.0, 66.0, 37.9, 42.6], [79.2, 39.6, 72.9, 63.9, 45.5, 50.2], 64.9, "57.64, 71.35"],
      ["VideoTaleInteract", [84.4, 70.8, 77.1, 77.4, 46.1, 47.8], [87.5, 71.9, 81.3, 80.2, 46.7, 58.7], 78.8, "75.52, 81.42"],
    ],
  };

  window.PAPER_T1 = T;

  function initTable() {
    const cols = ["SF", "SC", "IF", "JCS", "VC", "VQ"];
    let h = `<thead><tr><th>Method</th><th>Grounding</th>${cols.map((c) => `<th>${c}</th>`).join("")}<th>Composite [95% CI]</th></tr></thead><tbody>`;
    for (const [bb, rows] of Object.entries(T)) {
      h += `<tr class="bb"><td colspan="9">Backbone: ${bb}</td></tr>`;
      const best = (g, c) => Math.max(...rows.map((r) => r[g][c]));
      const bestComp = Math.max(...rows.map((r) => r[3]));
      rows.forEach((r) => {
        const ours = r[0] === "VideoTaleInteract";
        [1, 2].forEach((g) => {
          h += `<tr class="${ours ? "ours" : ""} ${g === 2 ? "r2" : ""}">`;
          h += g === 1 ? `<td rowspan="2" class="m">${r[0]}</td>` : "";
          h += `<td class="g">${g === 1 ? "Narrative" : "Knowledge"}</td>`;
          r[g].forEach((x, c) => (h += `<td class="${x === best(g, c) ? "best" : ""}">${x.toFixed(1)}</td>`));
          if (g === 1) h += `<td rowspan="2" class="comp ${r[3] === bestComp ? "best" : ""}">${r[3].toFixed(1)}<small>[${r[4]}]</small></td>`;
          h += "</tr>";
        });
      });
    }
    $("resultsTable").innerHTML = h + "</tbody>";
  }

  $("copyBib").addEventListener("click", () => {
    navigator.clipboard.writeText($("bibText").textContent).then(() => {
      $("copyBib").textContent = "Copied";
      setTimeout(() => ($("copyBib").textContent = "Copy"), 1500);
    });
  });

  initDemo();
  initCompare();
  initFails();
  initTable();
})();
