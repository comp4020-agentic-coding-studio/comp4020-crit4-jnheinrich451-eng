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

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so look at the deployed head when you add pages.

## The checks

`pnpm check` runs them (`pnpm check:evidence` is the extra gate before you
ship); CI runs the same plus links, secrets and the deploy. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook. As you learn what your prototype needs --- a
convention the work has to hold to, a sensor that keeps catching you out (a
linter, say), a fact about the stack that is easy to get wrong --- write it down
here and wire it into `check`. Growing this file is the work.

# Single-page touch synthesizer

## What it is
A playable touch instrument styled as a Pip-boy–style handheld device. Not a music-app UI mockup — the sound engine is real and the visuals are driven by it.

## Sound engine (do not simplify)

**`instructions/TONE.md` is the authority on the voice.** Every number in
`src/engine.ts` comes from it; read it before touching `strike()`. (It says the
function lives in `index.html` — it was written against a single-file build, and
in this repo it is in `src/engine.ts`.) The notes below are the summary, not the
source.

- 8 channels, four oscillators per voice: sine fundamental, triangle bar, octave
  sine, and an FM tine on its own carrier at 6:1 whose index collapses ~40x
  inside 150–500 ms. That collapse, not the amplitude envelope, is what reads as
  struck. Per-voice filter opens to `cut × 2.4` and closes to `cut × 0.62`.
- Y position = articulation. Bottom: soft, dark, long. Top: bright, fast.
- Body decay 3.5–5.4 s natural; release damping 0.28–2.6 s, shorter when
  released early and longer at the bottom of the playfield.
- 12-voice polyphony, oldest-voice culling, bus compressor + limiter.

TONE.md supersedes three things this file used to say. Recorded rather than
silently overwritten, because the old numbers are still in the git history:

1. Damping was 0.35–2 s; it is now 0.28–2.6 s.
2. Body decay was 3.5–5.5 s; it is now 3.5–5.4 s.
3. **520 ms / 700 ms is now a *visual* constant, not an audio one.** This file
   said keyboard damping was faster than pointer damping in the ear. TONE.md
   puts the difference on screen instead — audio damping is source-independent,
   and a keyed band decays faster than a dragged one so keys still read as more
   percussive. `VISUAL_DAMP_S` in `src/engine.ts` is where it lives.

TONE.md also disagrees with itself in one place: its `tineDecay` formula reaches
520 ms at the bottom of the playfield with TONE fully up, past both its own
"~150–400 ms" note and its rule "do not lengthen `tineDecay` past ~0.5 s". The
rule is the half the doc says to protect, so the one out-of-range corner is
clamped to 0.5 s and the formula is verbatim everywhere else.

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
- There is no linter any more: the starter refresh dropped oxlint and stylelint
  from `check`, from the dependencies and as config files. Two conventions they
  used to enforce are worth holding to by hand, because both caught real faults
  here — style every element through a class rather than a bare descendant
  selector (`.map__key`, not `.map li b`), which is what stylelint's
  `no-descending-specificity` was really policing, and keep class names BEM.
  The preamble above invites wiring a sensor back into `check`; that is the one
  worth re-adding first.
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

For claims about the *tone* rather than the plumbing, measure the output.
`Page.addScriptToEvaluateOnNewDocument` can wrap `AudioNode.prototype.connect`
so anything connecting to `ctx.destination` is also tapped into an extra
`AnalyserNode` — a probe that lands only in the test harness and never in
shipped code. `getFloatFrequencyData` off that probe is how "the fundamental
stays loudest" stops being an assumption.

Two traps in that measurement, both of which produced a wrong answer first:

- **Compare tilts, not levels.** A level moves with chorus gain and with the
  strike's random tine index; the difference between two bands does not.
- **Average several strikes.** `v`, the bar detune and the drift LFO are
  per-strike random by design, and the spread across single strikes is 5+ dB —
  larger than most effects worth measuring. Eight strikes and a median turned
  "RADIO's band filter does nothing" into "RADIO darkens the top by 5.5 dB and
  returns to within 0.03 dB when switched back".

## Rules for future changes
- Both input modes must respond identically to TONE / DECAY / SPACE / SCAN MODE.
- Every visual event must be caused by an audio event — no decorative animation.
- Keep the device fiction intact: telemetry reads real state, no fake numbers.
- Palette stays phosphor green on near-black. No new hues, no gradients, no emoji.
- Sound first: if a visual change would cost audio timing accuracy, drop the visual.
