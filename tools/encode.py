"""Encode all website videos (web-friendly H.264/AAC, faststart) + poster frames. Usage: encode.py FFMPEG"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

FF = sys.argv[1]
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
jobs = json.load(open(os.path.join(WEB, "tools", "jobs.json")))
ENC = ["-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
       "-ac", "2", "-movflags", "+faststart"]


def run(j):
    out = j["out"]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out) and os.path.getsize(out) > 0 and not os.environ.get("FORCE"):
        return f"skip {os.path.basename(out)}"
    h = j.get("h", 720)
    crf = ["-crf", str(j.get("crf", 26))]
    if "filter_complex" in j:
        cmd = [FF, "-y", "-loglevel", "error", "-i", j["in"], "-filter_complex", j["filter_complex"],
               "-map", "[v]", "-map", "[a]"] + crf + ENC + [out]
    elif "concat" in j:
        ins = sum([["-i", f] for f in j["concat"]], [])
        n = len(j["concat"])
        fc = "".join(f"[{i}:v:0][{i}:a:0]" for i in range(n)) + f"concat=n={n}:v=1:a=1[cv][a];[cv]scale=-2:{h}[v]"
        cmd = [FF, "-y", "-loglevel", "error"] + ins + ["-filter_complex", fc, "-map", "[v]", "-map", "[a]"] + crf + ENC + [out]
    else:
        cmd = [FF, "-y", "-loglevel", "error", "-i", j["in"], "-vf", f"scale=-2:{h}"] + crf + ENC + [out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        return f"FAIL {os.path.basename(out)}: {r.stderr[-400:]}"
    poster = out[:-4] + ".jpg"
    t = j.get("poster_t", 2.0)
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", str(t), "-i", out, "-frames:v", "1", "-vf", "scale=-2:540",
                    "-q:v", "4", poster])
    return f"ok {os.path.basename(out)} {os.path.getsize(out) / 1e6:.1f}MB"


with ThreadPoolExecutor(4) as ex:
    for msg in ex.map(run, jobs):
        print(msg, flush=True)
