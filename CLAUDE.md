# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## The checks

`typecheck`, `build`, `deploy`, `spec`, `lint`, `tests`, `evidence`, `links`,
`secrets`. Run `pnpm check`. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook. As you learn what your prototype needs --- a
convention the work has to hold to, a sensor that keeps catching you out, a fact
about the stack that is easy to get wrong --- write it down here. Growing this
file is the work.

# Single-page touch synthesizer

## What it is
A playable touch instrument styled as a Pip-boy–style handheld device. Not a music-app UI mockup — the sound engine is real and the visuals are driven by it.

## Sound engine (do not simplify)
- 8 channels, struck-piano/Rhodes voice: sine fundamental + restrained triangle + FM tine that collapses in 150–400 ms; filter opens on impact then closes.
- Y position = articulation. Bottom: soft, dark, long. Top: bright, fast.
- Body decay 3.5–5.5 s natural; release damping 0.35–2 s, shorter when released early.
- 12-voice polyphony, oldest-voice culling, per-voice gain management, bus compressor + limiter.
- Keyboard damping is faster than pointer damping (520 ms vs 700 ms) — intentional, keys feel percussive.

## Visual language
Phosphor-green CRT. Playfield: 8 bands (01–08), channel wash, boundary brightening, impact rings, bloom (wide at bottom, sharp at top), ringing waveforms, drag-trace persistence. Keyboard strikes excite bands *from within* — center-out attack with pulse heads (~200 ms), bloom → resonance wash → decay with an internal shimmering line.

Device chrome: header with status tags + uptime, right rail telemetry (MODE / TONE / DECAY / SPACE / BAND / VOX / CARRIER LOCK needle), deck with 8 lit band markers, three drag/scroll knobs (TONE, DECAY, SPACE), three-way SCAN MODE rocker (NORM / CHOR / RADIO).

## Input
Pointer (drag = sustained, position = timbre) and keyboard (A S D F G H J K = channels 01–08, chords supported, Space = sustain pedal). Band markers carry faint A–K letters that brighten once keys are used.

## Stack facts that are easy to get wrong

- `tsconfig.json` `include` is an explicit list. `src` had to be added to it —
  without that, every engine module compiles unchecked and `pnpm typecheck` goes
  green on code it never read.
- `spec/*.test.ts` runs against `dist/`, not source. Assert what ships. Nothing
  in `spec/` can build an `AudioContext`, so the parts of the voice worth
  pinning live in pure exported functions (`articulate`, `dampTime`,
  `channelFreq`) and are tested there.
- The minifier picks its own quote character. A spec test that greps the bundle
  must strip quotes and whitespace before matching, or it fails on a build that
  is perfectly correct.
- `.stylelintrc.json` carries a widened `selector-class-pattern`: the standard
  config's kebab-case rule rejects BEM's `block__element`.
- Vite copies `public/` only. `assests/` is reference material and stays out of
  `dist/` — keep it that way; nothing on the page should link to it.
- `engine.start()` does its graph building synchronously before it awaits the
  resume, so a strike issued in the same gesture handler is audible. Do not
  refactor that into an `await` before `build()`.

## How to actually verify this thing

`pnpm check` cannot hear anything. Drive the page over CDP instead — dispatch
real `Input.*` events at headless Chrome (`--autoplay-policy=no-user-gesture-required`)
and read the telemetry the page computes from the audio graph. `VOX`, `BAND`,
`CARRIER` and the deck's `--lit` values all come off live voices, so if they
move, sound is genuinely flowing; if `VOX` returns to `00/12` after release,
nothing is stuck or leaking. That check found the needle law pegging at three
notes and the persistence burying the bands — neither is visible from a test.

## Rules for future changes
- Both input modes must respond identically to TONE / DECAY / SPACE / SCAN MODE.
- Every visual event must be caused by an audio event — no decorative animation.
- Keep the device fiction intact: telemetry reads real state, no fake numbers.
- Palette stays phosphor green on near-black. No new hues, no gradients, no emoji.
- Sound first: if a visual change would cost audio timing accuracy, drop the visual.