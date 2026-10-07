# VIS-Ground project page

Static site (no build step): `index.html`, `assets/style.css`, `assets/app.js` (demo, comparisons, table), `assets/charts.js` (interactive charts), `assets/fx.js` (scroll animations, nav, lightbox, teaser sound), `assets/data.js`.

## Preview locally

```bash
python3 tools/serve.py 8000
```

Then open http://localhost:8000. Use this server rather than `python3 -m http.server`: video seeking needs HTTP Range support.

## Host

Upload the whole folder to any static host (GitHub Pages, Netlify, a university web server). The largest file is about 50 MB, so it fits GitHub's 100 MB per-file limit. The whole site is about 770 MB, mostly videos in `assets/videos/`.

## Rebuild videos and data

```bash
python3 tools/build_data.py /path/to/ffmpeg   # writes assets/data.js and tools/jobs.json
python3 tools/encode.py /path/to/ffmpeg       # encodes into assets/videos/ (skips existing; FORCE=1 to redo)
python3 tools/build_wall.py /path/to/ffmpeg   # hero background: video wall of story shots
```

`build_data.py` reads the originals in `../videos` and `../story_examples`. For the real study sessions it cuts out the question cards and blurs the burnt-in answer label, because both show participant IDs. It also maps each question to its answer segment; the map comes from `tools/real_scan.json`. The page then draws its own "Generated answer" label.
