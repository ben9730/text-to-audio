# TTS Reader v2 — Visual Redesign, Read-Along Highlighting & Deployment (Design Spec)

A follow-up to the v1 spec (`2026-06-08-text-to-speech-web-app-design.md`). v1 stands as the source of truth for engine, chunker, and file-loader behavior. This v2 spec layers on three things **without changing v1's locked engine semantics**:

1. A visual redesign driven by the **UI UX Pro Max** design skill.
2. A new **read-along (sentence/segment) highlighting** feature (was a v1 non-goal, now in scope).
3. **Deployment to GitHub Pages** plus a git push, keeping the offline `file://` double-click guarantee intact.

> Design intelligence source: the installed `ui-ux-pro-max` skill (`.claude/skills/ui-ux-pro-max/`), run via its `search.py --design-system` generator for this product.

---

## 1. Scope

### In scope (v2)
- Restyle `index.html` + `style.css` to the design system below (light + auto-dark).
- Bundle the **Lexend** font locally (no CDN) so it works offline and when deployed.
- Add a **reading-view panel** that highlights the currently-spoken segment, advancing in sync with audio, with auto-scroll.
- Replace text-only buttons with **SVG icon + label** buttons (play/pause/stop), per the skill's "no emoji icons" rule.
- Deploy to **GitHub Pages** and push the repo to GitHub.

### Out of scope (unchanged from v1)
- No audio export, no cloud/AI voices, no accounts, no backend, no settings persistence.
- **Word-by-word** highlighting (the user chose segment-level; word-level via the `boundary` event remains a possible v3).
- No change to the chunker, the speech engine's public interface, or the file loader.

### Locked v2 decisions
- **Fonts:** bundle **Lexend** locally (`fonts/`), `@font-face`, no network fetch. System sans is the fallback. (Source Sans 3 considered for UI labels but dropped to keep the bundle to one font file; Lexend doubles as the UI face.)
- **Highlighting granularity:** **segment-level** (one engine chunk = one highlighted segment). Driven entirely by the existing `onprogress(i, n)` callback — **no engine change**.
- **Deploy target:** **GitHub Pages**, served from the repo at a relative subpath (all asset references stay relative).

---

## 2. Design System (from UI UX Pro Max, synthesized for vanilla CSS)

The skill's generator returned the **"AI-Native / ambient minimal"** style and a **"calm indigo + success green"** palette with **Lexend** typography. The landing-page "hero pattern" it also returned is ignored — this is a single-screen utility, not a marketing page.

### 2.1 Color tokens (CSS custom properties on `:root`, overridden in `@media (prefers-color-scheme: dark)`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F5F3FF` (soft lavender) | `#16151F` | Page background |
| `--surface` | `#FFFFFF` | `#211F2E` | Cards: textarea, reader, status |
| `--fg` | `#1E1B2E` (deep slate-indigo) | `#ECEAF6` | Primary reading/UI text (AA on surface) |
| `--muted` | `#4B4763` | `#A9A4C2` | Hints, slider readouts, secondary text |
| `--border` | `#D9D5EC` | `#3A3650` | Card borders, dividers |
| `--primary` | `#6366F1` (indigo) | `#818CF8` | Accents, focus rings, active segment |
| `--primary-weak` | `#EEF0FF` | `#2C2A45` | Active-segment background tint |
| `--play` | `#10B981` (green) | `#34D399` | Primary Play button |
| `--play-fg` | `#FFFFFF` | `#06281E` | Text on the Play button |
| `--banner-bg` / `--banner-fg` | `#FDECEA` / `#8A1C12` | `#3A1F1C` / `#F6A89F` | Unsupported banner |

All foreground/background pairs must meet **WCAG AA (4.5:1)** for normal text; the active-segment highlight must not rely on color alone (it also gets `font-weight: 600` and a left accent bar).

### 2.2 Typography
- **Face:** Lexend (variable weight 300–700), bundled at `fonts/lexend.woff2`, declared with `@font-face` and `font-display: swap`. Fallback stack: `system-ui, "Segoe UI", Roboto, sans-serif`.
- **Reading text** (textarea + reading view): Lexend, `--reader-font-size` (existing 14–30px control), `line-height: 1.7`, `max-width` ~70ch for the reading view (line-length guideline).
- **Headings/UI:** Lexend 600.

### 2.3 Motion & effects (all gated by `prefers-reduced-motion: reduce`)
- Transitions 150–250ms on color/opacity/background only (never width/height/layout).
- Active segment fades in its highlight; reading view auto-scrolls the active segment into view (`scrollIntoView`, `behavior: 'smooth'` unless reduced-motion → `'auto'`).
- A subtle pulsing dot next to the status while `speaking`.
- No hover effect that shifts layout (no scale on cards).

### 2.4 Controls (per the skill's pre-delivery checklist)
- Buttons are pill-shaped, **SVG icon + text** (inline `<svg>`, 24×24 viewBox, `aria-hidden` on the icon since the button has a text label). Play uses `--play` (green); Stop and A−/A+ use surface/outline styles.
- `cursor: pointer` on all interactive elements; visible `:focus-visible` ring using `--primary`; smooth 200ms `transition`.
- Touch targets ≥ 44×44px.
- Native `<input type="range">` retained for sliders (accessibility), restyled track/thumb to the palette.

---

## 3. Read-Along Highlighting (new feature)

### 3.1 Approach (why it's engine-free)
The v1 engine already fires `onprogress(chunkIndex /*1-based*/, chunkCount)` on **each chunk's `start`** (v1 spec §6.1/§6.4). A "segment" = one chunk. The Controller builds a reading view whose Nth element corresponds to the Nth chunk, then highlights element `chunkIndex-1` whenever `onprogress` fires. Because the Controller builds its segments by calling the **same** pure `chunkText(text, 200)` the engine uses internally, the two arrays are byte-identical, so indices align exactly. **No change to `speech-engine.js`.**

> Documented quirk: the chunker packs short sentences greedily (v1 §9.2), so a segment is usually one sentence but can be two short ones. Acceptable for v2; word-level highlighting (v3) would split finer.

### 3.2 DOM
- New panel in `index.html`: `<div id="reader" class="reader" aria-hidden="true" hidden></div>`.
  - `aria-hidden="true"`: it visually mirrors the audio; screen-reader users already get the speech and the `#status` live region, so the reader must not double-announce.
  - `hidden` by default (idle).
- The editable `<textarea id="text">` remains the input surface.

### 3.3 Controller behavior (`app.js` only)
- **On Play** (`speak`): compute `segments = chunkText(els.text.value, 200)`; clear `#reader`; for each segment create `<span class="seg"></span>` with the segment text; un-hide `#reader`. (The textarea may remain visible above it; editing during playback is unchanged — a new Play cancels and rebuilds.)
- **On `onprogress(i, n)`:** remove `.seg--active` from the previous segment, add it to `segments[i-1]`, update status to `Speaking… (segment i of n)`, and `scrollIntoView` the active segment (smooth unless reduced-motion).
- **On `paused`:** leave the current highlight in place (frozen).
- **On idle** (finished / stopped / error): remove all highlights, set `#reader` back to `hidden`, empty its contents.
- Reduced-motion: when `matchMedia('(prefers-reduced-motion: reduce)')` matches, use `scrollIntoView({behavior:'auto'})` and skip the pulse.

### 3.4 Styling
- `.reader`: `--surface` card, border, padding, `max-width: 70ch`, `max-height` with `overflow:auto`, Lexend at `--reader-font-size`, `line-height:1.7`.
- `.seg`: inline, default `--fg`.
- `.seg--active`: `background: --primary-weak`, `color: --fg`, `font-weight:600`, rounded, a `box-shadow`/left accent so the highlight is not color-only; 150ms transition.

---

## 4. File / Component Impact

| File | Change |
|---|---|
| `chunk.js` | **Unchanged.** |
| `speech-engine.js` | **Unchanged.** |
| `file-loader.js` | **Unchanged.** |
| `chunk.test.js` / `chunk.test.html` | **Unchanged** (still 14/14). |
| `index.html` | Restructured: new font is referenced via CSS; SVG icon buttons; new `#reader` panel; same script load order and element IDs preserved (`text, file, voice, rate, rateOut, pitch, pitchOut, playPause, stop, textSmaller, textLarger, status, unsupported`) **plus** new `reader`. |
| `style.css` | Rewritten to the design system: new tokens, `@font-face` Lexend, restyled controls/cards/sliders, `.reader`/`.seg` styles, motion + reduced-motion. |
| `app.js` | Add reading-view build + segment highlight in the existing `onprogress`/`onstatechange` handlers. No other logic changed. |
| `fonts/lexend.woff2` | **New** — bundled Lexend variable font (fetched once from Google Fonts at build, then committed). |
| `README.txt` | Add a line about the read-along highlight and the live URL. |

The four-file architecture, classic-script load order, and `file://` guarantee from v1 §3/§4 are preserved.

---

## 5. Deployment (GitHub Pages)

1. The repo already exists locally (branch `feat/tts-reader-v1`). Finish v2 on a branch, merge to `main`.
2. Create a GitHub repo (via `gh repo create`, or the user creates it) and push `main`.
3. Enable **Pages** → source: `main` / root. Site serves `index.html` at `https://<user>.github.io/<repo>/`.
4. Because every asset path is **relative** (`style.css`, `chunk.js`, `fonts/lexend.woff2`, …), the project-subpath URL works with no base-href changes.
5. Voices still come from the **visitor's** OS/browser; deployed behavior == local behavior. The `file://` double-click path keeps working because fonts are bundled, not fetched.

---

## 6. Accessibility (additions to v1 §11)
- Color contrast AA verified for both themes with the new palette (text, muted text, buttons, status, active segment).
- Active segment conveys state by **weight + accent bar**, not color alone.
- `#reader` is `aria-hidden` to avoid double-speaking; `#status` remains the single polite live region.
- Icon buttons keep visible text labels; SVGs are `aria-hidden`. Focus-visible rings on every control. Touch targets ≥44px.
- `prefers-reduced-motion` disables smooth scroll, transitions, and the pulse.

---

## 7. Testing additions (extend v1 §12)
- **Regression:** `node chunk.test.js` → still `14/14`; `node --check` clean on all JS.
- **Manual (Edge + Chrome, offline and on the deployed URL):**
  1. Lexend renders on `file://` double-click (offline) — confirm the bundled font loads, not a system fallback.
  2. Press Play → reading view appears; the active segment highlights and **advances in sync** with the audio; view auto-scrolls to keep it visible.
  3. Pause → highlight freezes; Resume → continues. Stop/Finish → highlight clears and reader hides.
  4. New palette looks correct in **light** and **Windows dark** mode; all text passes contrast by eye; focus rings visible via Tab.
  5. Turn on **Reduce motion** (Windows: Settings → Accessibility → Visual effects → Animation effects off) → no smooth scroll/pulse; highlighting still advances.
  6. Buttons show SVG icons + labels, pointer cursor, hover feedback with no layout shift.
  7. Deployed GitHub Pages URL loads over https with fonts and works end-to-end.

---

## 8. Build order (for the plan)
1. Bundle Lexend (`fonts/lexend.woff2`) + `@font-face`.
2. Rewrite `style.css` to the design system (tokens, controls, sliders, reader/seg, motion).
3. Update `index.html` (SVG icon buttons, `#reader` panel, font wiring).
4. Add reading-view + segment highlighting to `app.js`.
5. Regression + manual QA.
6. Merge to `main`, push to GitHub, enable Pages, verify the live URL.

> **Implementation model:** per the standing project preference, the code is written by **Sonnet** agents; design/spec/review stay on the stronger model.
