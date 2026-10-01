"""Build website data (real-interaction sessions + story explorer) and ffmpeg job list.

Real-interaction sessions: question cards (which show participant IDs) are cut out, and the
burnt-in 'Generated answer · P#' label is blurred; the page draws its own label instead.
"""
import json, os, re, subprocess, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, "website")
REAL = os.path.join(ROOT, "videos", "real_interaction")
scan = json.load(open(os.path.join(WEB, "tools", "real_scan.json")))

# questions per session in order; '|' groups questions asked at the same pause
SESSIONS = {
 "real_P1-1_A_Kernel-Based_View_of_Language_Model_Fi.mp4": ["why it will collapse?", "what is the sign gradient descent?", "what is LoRA?"],
 "real_P2-2_A_Kernel-Based_View_of_Language_Model_Fi.mp4": ["how does formatting task into a prompt connect to masked language modeling", "what does kernel mean here", "how does lora connect with ntk"],
 "real_P3-2_A_Kernel-Based_View_of_Language_Model_Fi.mp4": ["what does neural tangent kernel mean? is it a new method proposed recently? why haven't I heard about it before?", "is ntk the same as LoRA?", "what does sign gradient descent mean? how is it connected to early adam optimization?"],
 "real_P5-2_A_Kernel-Based_View_of_Language_Model_Fi.mp4": ["Please explain in detail, mathematically, what is NTK, and how it works.", "What is magnitude of the path? why it's safe to do so?", "what does rank mean here? why it's called low rank? Why chose casting a \"random\" project works?"],
 "real_P6-2_A_Kernel-Based_View_of_Language_Model_Fi.mp4": ["Under Tensor Programs theory, which two conditions must a neural network satisfy for infinite-width limit analysis? | When prompting formats a downstream language task as masked-word prediction, what type of training dynamics can it induce during fine-tuning? | The Neural Tangent Kernel (NTK) models gradient-descent dynamics for what type of neural network? | What happens to a neural network’s internal features when training stays close to initialization and exhibits kernel behavior? | #DUP"],
 "real_P2-1_Advantage-Weighted_Regression_(AWR).mp4": ["what is SAC and why does it fail", "what is the main difference compared to the failed methods? | can you explain this clearly with some analogy? the math is not understandable in a short time", "what are the constraints standard Q-learning failed?"],
 "real_P3-1_Advantage-Weighted_Regression_(AWR).mp4": ["what does \"formulate the lagrangian for expected improvement\" mean?", "what does \"mu-k of tau\" mean", "Is the 82 DoF hardware statement true?"],
 "real_P4-1_Advantage-Weighted_Regression_(AWR).mp4": ["what is the point of these algorithms exactly? like what's input / output / application task", "why is the baseline (SAC?) unstable at all?", "can you explain the walk blabla v2 ish dataset as well", "#FAILED"],
 "real_P5-1_Advantage-Weighted_Regression_(AWR).mp4": ["what is the difference between on-policy and off-policy?", "what is q value, what does bootstrapping q-value mean, what is bellman errors, and why bootstrapping q-value often leads to exploding bellman errors?", "Please give me real examples of RWR and AWR. What's the principle of them. Then how they are applied step by step in this problem."],
 "real_P6-1_Advantage-Weighted_Regression_(AWR).mp4": ["what is sac?", "what is AWR? explain in plain language", "what problem is AWR trying to solve?"],
 "real_P1-2_The_Early_Life_of_hide.mp4": ["what is the conflict?", "explain this shift more in detail", "why disbanded?"],
}
TOPICS = [
 ("kernel", "A Kernel-Based View of Language Model Fine-Tuning", "Research paper", "Cut-out animation", "Kernel"),
 ("awr", "Advantage-Weighted Regression (AWR)", "Research paper", "Cinematic", "Advantage"),
 ("hide", "The Early Life of hide", "Biography (Wikipedia)", "Cinematic", "hide"),
]


def runs(vals, thr, fps, minlen, above=True):
    out, s = [], None
    for i, v in enumerate(list(vals) + [None]):
        on = v is not None and ((v > thr) if above else (v < thr))
        if on and s is None:
            s = i
        if not on and s is not None:
            if (i - s) / fps >= minlen:
                out.append([s / fps, i / fps])
            s = None
    return out


def build_real():
    sessions, jobs = [], []
    for fname, qgroups in SESSIONS.items():
        sc = scan[fname]
        fps = sc["fps"]
        dur = len(sc["lum"]) / fps
        darks = runs(sc["lum"], 22, fps, 1.0, above=False)
        labels = runs(sc["green"], 0.15, fps, 1.0)
        cards = [d for d in darks if d[0] > 1 and d[1] < dur - 1]
        intro_end = darks[0][1]
        outro_start = darks[-1][0]
        # questions per card (a card can hold several questions)
        groups = [[q.strip() for q in g.split("|")] for g in qgroups]
        assert len(groups) == len(cards), (fname, len(groups), len(cards))
        ans_iter = iter(labels)
        pauses = []
        for card, qs in zip(cards, groups):
            items = []
            for q in qs:
                if q == "#FAILED":
                    continue
                span = next(ans_iter)
                if q == "#DUP":
                    items.append({"q": None, "a": span})
                    continue
                items.append({"q": q, "a": span})
            pauses.append({"t": card[0], "items": items})
        # cut list (source time): intro, cards, outro, duplicate answers
        cuts = [[0, intro_end + 0.15]] + [[c[0] - 0.1, c[1] + 0.25] for c in cards] + [[outro_start - 0.1, dur + 1]]
        for p in pauses:
            for it in p["items"]:
                if it["q"] is None:
                    cuts.append(it["a"])
        cuts.sort()

        def remap(t):
            off = 0.0
            for a, b in cuts:
                if t >= b:
                    off += b - a
                elif t > a:
                    return a - off
            return t - off

        out_pauses = []
        for p in pauses:
            its = [{"q": it["q"], "a": [round(remap(it["a"][0]), 2), round(remap(it["a"][1]), 2)]} for it in p["items"] if it["q"]]
            if its:
                out_pauses.append({"t": round(remap(p["t"]), 2), "items": its})
        topic = next(t for t in TOPICS if t[4] in fname)
        sid = fname.replace("real_", "").split("_")[0].lower().replace("-", "_")
        out_name = f"session_{topic[0]}_{len([s for s in sessions if s['topic'] == topic[0]]) + 1}.mp4"
        sessions.append({"topic": topic[0], "file": "assets/videos/interact/" + out_name, "pauses": out_pauses,
                         "duration": round(remap(dur), 2)})
        blur_spans = "+".join(f"between(t,{l[0] - 0.3:.2f},{l[1] + 0.3:.2f})" for l in labels)
        keep = "+".join(f"between(t,{a:.2f},{b:.2f})" for a, b in cuts)
        vf = (f"[0:v]split[m][c];[c]crop=1500:100:0:8,boxblur=24:6[bl];[m][bl]overlay=0:8:enable='{blur_spans}',"
              f"select='not({keep})',setpts=N/FRAME_RATE/TB,scale=1280:720[v];"
              f"[0:a]aselect='not({keep})',asetpts=N/SR/TB[a]")
        jobs.append({"in": os.path.join(REAL, fname), "out": os.path.join(WEB, out_name.join(["assets/videos/interact/", ""])),
                     "filter_complex": vf, "crf": 27})
    topics = [{"id": t[0], "title": t[1], "kind": t[2], "style": t[3]} for t in TOPICS]
    return {"topics": topics, "sessions": sessions}, jobs


def build_stories():
    out, jobs = [], []
    SE = os.path.join(ROOT, "story_examples")

    def dur(f):
        o = subprocess.run([FF, "-i", f], capture_output=True, text=True).stderr
        h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", o).groups()
        return int(h) * 3600 + int(m) * 60 + float(s)

    for st in ["tortoise_and_hare", "the_necklace", "red_headed_league"]:
        j = json.load(open(f"{SE}/{st}/story.json"))
        scenes = sorted(glob.glob(f"{SE}/{st}/faithful/scenes/scene_*/scene.mp4"))
        sd = [dur(f) for f in scenes]
        steered = next(r for r in j["runs"] if r["id"] == "steered")
        branches = []
        for b in j["branches"]:
            pa = b["pause_at"]
            t = sum(sd[: pa["scene"]])
            branches.append({"id": b["id"], "instruction": b["instruction"], "act": pa["act"], "scene": pa["scene"],
                             "t": round(t, 2), "ending": b.get("ending", ""),
                             "file": f"assets/videos/stories/{st}_{b['id']}.mp4"})
            jobs.append({"in": f"{SE}/{st}/faithful/branches/{b['id']}/branch.mp4",
                         "out": f"{WEB}/assets/videos/stories/{st}_{b['id']}.mp4", "crf": 27})
        for run in ("faithful", "steered"):
            jobs.append({"concat": [f"{SE}/{st}/{run}/acts/act_0{i}.mp4" for i in (1, 2, 3)],
                         "out": f"{WEB}/assets/videos/stories/{st}_{run}.mp4", "crf": 27})
        out.append({"id": st, "title": j["title"], "author": j["author"], "style": j["style"],
                    "faithful": f"assets/videos/stories/{st}_faithful.mp4",
                    "steered": {"file": f"assets/videos/stories/{st}_steered.mp4", "title": steered["title"],
                                "instruction": steered["instruction"]},
                    "branches": branches})
    return out, jobs


FF = None
if __name__ == "__main__":
    import sys
    FF = sys.argv[1]
    real, jr = build_real()
    stories, js = build_stories()
    V = os.path.join(ROOT, "videos")
    other = [
        {"in": os.path.join(ROOT, "teaser", "teaser.mp4"), "out": f"{WEB}/assets/videos/teaser.mp4", "crf": 23, "h": 1080},
        {"in": f"{V}/01_task_illustration.mp4", "out": f"{WEB}/assets/videos/task_illustration.mp4", "crf": 25, "h": 1080},
    ]
    for n in ["02_compare_glasses", "02_compare_peter", "02_compare_peter_cinematic", "02_compare_ralph", "02_compare_loan",
              "03_failure_1_ralph", "03_failure_2_glasses_steps", "03_failure_3_glasses_render"]:
        other.append({"in": f"{V}/{n}.mp4", "out": f"{WEB}/assets/videos/{n[3:]}.mp4", "crf": 25, "h": 1080})
    data = {"real": real, "stories": stories}
    with open(f"{WEB}/assets/data.js", "w") as f:
        f.write("window.SITE_DATA = " + json.dumps(data, indent=1, ensure_ascii=False) + ";\n")
    json.dump(other + jr, open(f"{WEB}/tools/jobs.json", "w"), indent=1)  # story videos not used on the page
    print("sessions", len(real["sessions"]), "stories", len(stories), "jobs", len(other + jr + js))
    for s in real["sessions"]:
        print(s["topic"], s["file"].split("/")[-1], s["duration"], [(p["t"], len(p["items"])) for p in s["pauses"]])
