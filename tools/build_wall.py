"""Build the hero background video wall from the generated story shots (ffmpeg xstack).

Usage: python3 tools/build_wall.py /path/to/ffmpeg
Writes assets/videos/hero_wall.mp4 (seamless 8 s loop, 9x8 staggered tiles) and hero_wall.jpg.
"""
import glob, os, random, subprocess, sys, tempfile

FF = sys.argv[1] if len(sys.argv) > 1 else "ffmpeg"
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SE = os.path.join(os.path.dirname(WEB), "story_examples")
shots = sorted(glob.glob(f"{SE}/*/*/scenes/*/shots/shot_*.mp4") + glob.glob(f"{SE}/*/*/branches/*/scenes/*/shots/shot_*.mp4"))

# Full-frame "video prefix" footage inside the comparison videos (one per distinct story; the
# other variants repeat the same prefix). Clips are centre-cropped to drop the corner label,
# speed badge and burnt-in subtitles.
ROOT = os.path.dirname(WEB)
PREFIX_SEGMENTS = [  # (video, start s, end s) of full-frame footage (frame analysis, ends trimmed before the request card)
    ("short_videos/knowledge_ai_q8.mp4", 14.0, 58.0),
    ("example/knowledge_bike.mp4", 11.5, 41.0),
    ("short_videos/peter_i02_cinematic_keyshots.mp4", 11.5, 46.5),
    ("example/ralph.mp4", 11.5, 43.0),
]
CROP = "crop=iw*0.7:ih*0.7:iw*0.15:ih*0.12"


def prefix_clips(tmp):
    out = []
    for src, a, b in PREFIX_SEGMENTS:
        t = a
        while t + 8 <= b:
            f = os.path.join(tmp, f"{os.path.basename(src)[:-4]}_{t:05.1f}.mp4")
            subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-t", "8", "-i", os.path.join(ROOT, src),
                            "-vf", f"{CROP},scale=448:252", "-an", "-c:v", "libx264", "-crf", "18", f], check=True)
            out.append(f)
            t += 8
    return out


def stack(files, cols, rows, tw, th, gap, stagger, out, seconds=None, offsets=None):
    args, fc = [], ""
    for k, f in enumerate(files):
        if seconds:
            args += ["-stream_loop", "-1", "-ss", f"{offsets[k]:.2f}", "-t", str(seconds), "-i", f]
        else:
            args += ["-ss", "4", "-i", f]
        fc += f"[{k}:v]scale={tw}:{th}:force_original_aspect_ratio=increase,crop={tw}:{th},setsar=1,fps=24[v{k}];"
    # keep only the band every row covers, so staggered rows leave no black edges
    X0 = stagger if rows > 1 else 0
    W = (cols - 1) * (tw + gap) + tw - X0
    H = (rows - 1) * (th + gap) + th
    W -= W % 2; H -= H % 2
    lay = "|".join(f"{(k % cols) * (tw + gap) + ((k // cols) % 2) * stagger}_{(k // cols) * (th + gap)}" for k in range(len(files)))
    ins = "".join(f"[v{k}]" for k in range(len(files)))
    fc += f"{ins}xstack=inputs={len(files)}:layout={lay}:fill=black,crop={W}:{H}:{X0}:0[o]"
    cmd = [FF, "-y", "-loglevel", "error"] + args + ["-filter_complex", fc, "-map", "[o]"]
    if seconds:
        cmd += ["-t", str(seconds), "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    else:
        cmd += ["-frames:v", "1", out]
    subprocess.run(cmd, check=True)
    print(out, W, H)


if __name__ == "__main__":
    cols, rows = 9, 8
    rnd = random.Random(7)
    with tempfile.TemporaryDirectory() as tmp:
        extra = prefix_clips(tmp)
        pick = extra + rnd.sample(shots, cols * rows - len(extra))
        rnd.shuffle(pick)
        offs = [rnd.uniform(0, 7.5) for _ in pick]  # staggered start points so the 8 s loop is seamless
        out = f"{WEB}/assets/videos/hero_wall.mp4"
        stack(pick, cols, rows, 224, 126, 8, 116, out, seconds=8, offsets=offs)
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", "3", "-i", out, "-frames:v", "1", "-vf", "scale=1200:-2", "-q:v", "7", out[:-4] + ".jpg"], check=True)
    print(f"{len(extra)} prefix clips + {cols * rows - len(extra)} story shots")
