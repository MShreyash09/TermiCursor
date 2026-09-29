# TermiCursor design

The landing page follows the look of the terminal app and the desktop app: a black background, hacker green, and monospace type for anything that should feel like a terminal. Every token below is defined in `src/styles.css` under `:root`.

## Colors

| Token | Value | Use |
|---|---|---|
| `--bg` | `#000` | Page background |
| `--bg-1` | `#0a0a0a` | Cards, inputs, ghost buttons |
| `--bg-2` | `#111` | Raised controls (copy button, kbd) |
| `--line` | `#1c1c1c` | Default borders, section dividers |
| `--line-2` | `#2a2a2a` | Stronger borders, hover borders |
| `--text` | `#f4f4f4` | Body text, headings |
| `--muted` | `#a3a3a3` | Secondary text |
| `--dim` | `#6b6b6b` | Meta text, captions |
| `--green` | `#39ff14` | Brand accent: "cursor", caret, primary CTA, focus ring, **Ask** mode |
| `--purple` | `#b877ff` | **Plan** mode |
| `--blue` | `#3d8bff` | **Build** mode / desktop app |
| `--orange` | `#ffb000` | Tool calls (`⚙`), warnings, network use |
| `--red` | `#ff4d4d` | Risky / destructive actions |

The page is dark only (`color-scheme: dark`). Green is the one loud color. The other accents show up only on mode chips, icons and status dots.

## Type

- **Sans:** Inter, weights 400 to 800. Headings use 800 with tight tracking (`-0.02em` to `-0.035em`).
- **Mono:** JetBrains Mono (falls back to Cascadia Mono, then Consolas). Used for the brand, eyebrows, pills, chips, kbd, code and the install command.
- **Eyebrows:** mono, 12.5px, uppercase, `.08em` tracking, green, or the color of the mode they label.

## Brand

- The wordmark is `termi` in white and `cursor` in green, set in mono at weight 800, followed by a blinking green block caret (`.caret`, `steps(1)` blink).
- The favicon is a green `>` prompt with a white underscore on a black rounded square.

## Shape and depth

- Radius: `--radius: 14px` for cards, 10 to 12px for buttons, inputs and screenshots, and 999px for pills.
- Borders are 1px and mostly `--line`. Hover moves them to `--line-2`, or toward the accent via `color-mix`.
- Glow: green `box-shadow` or blurred radial gradients (primary button hover, hero glow, status dots). Keep it subtle.
- Screenshots get a deep black drop shadow plus a 1px `--line-2` ring.

## Motion

Libraries: [Motion](https://motion.dev) (formerly Framer Motion) plus React Bits components built on it (`src/ScrollVelocity.jsx`, `src/RotatingText.jsx`, `src/ShinyText.jsx`, copied from the React Bits source).

| Effect | Where | How |
|---|---|---|
| Scroll progress bar | Top of the page, 2px green | Motion `useScroll` + `useSpring` |
| Screenshot tilt | Hero screenshot starts tilted back 24° and flattens as you scroll | Motion `useScroll` / `useTransform` |
| Scrolling marquee | Band under the hero: ASK / PLAN / BUILD in mode colors, plus an outlined second row | React Bits ScrollVelocity; speeds up with scroll speed |
| Shine | Hero version pill: a green shine sweeps across grey text | React Bits ShinyText |
| Rotating word | Final CTA: "Give it a task / bug / refactor / feature / test suite" | React Bits RotatingText |
| Decrypting headings | Section headings scramble into place | Hand-written `Decrypt` in `App.jsx` |
| Spotlight | Cards glow under the mouse, in their own accent color | `.spot` + `--mx`/`--my` |
| Reveal on scroll | Blur, fade and rise over 0.7s, staggered 90ms between siblings | `.reveal` → `.in`, `--d` delay |

- Hovers lift elements by 1 to 4px. Feature icons tilt, and screenshots pick up a faint green shadow.
- Only animate `transform`, `opacity` and `filter`. Don't put a CSS `transition` on anything Motion drives each frame.
- `prefers-reduced-motion` turns all of this off: caret, reveals, hovers, marquee, shine, rotating word, tilt, progress bar, and the hero background.

## Hero background

The hero uses [Faulty Terminal](https://reactbits.dev/backgrounds/faulty-terminal) from React Bits (`src/FaultyTerminal.jsx`, a WebGL component built on `ogl`), tuned to match the theme:

- `tint="#39ff14"` (brand green), `brightness={0.6}`, `scale={1.5}`, `digitSize={1.2}`, `curvature={0.1}`, `scanlineIntensity={0.5}`
- `.hero-bg` sets it to 55% opacity, masks the edges into black, and darkens the area behind the headline so the copy stays readable.
- The mouse listener is on `window`, because the hero copy covers the canvas.

## Layout

- Container: max width 1160px, gutter `clamp(16px, 4vw, 32px)`.
- Sections have `clamp(72px, 10vw, 120px)` vertical padding and a 1px top border. Alternating sections (`.section-alt`) get a faint `--bg-1` gradient.
- Breakpoints: 960px (grids go to 2 columns), 860px (mobile menu), 600px (single column).
