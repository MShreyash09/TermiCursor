# Landing page images

The page (`../index.html`) loads these files. If a file is missing, its frame shows
"Screenshot coming soon" instead of a broken image.

| File | Where it appears | Notes |
|---|---|---|
| `cli-welcome.png` | Hero | Real capture of the terminal app's welcome screen |
| `cli-plan.png` | "Plan mode" section | Real plan from the Plan agent |
| `cli-ask.png` | "Ask mode" section | Real Ask-mode run |
| `app.png` | "Desktop app" section | **Older build of the app, replace with a current screenshot** (16:10, at least 1600 px wide) |

The `cli-*.png` images were made by running the real CLI and exporting its output
(rich → SVG → PNG at 2x). Replace any of them by dropping a file with the same name here.
If the new image has a different aspect ratio, update the `width`/`height` on the hero `<img>`.
