# Process record

The raw, append-only history that `PROCESS.md`'s few curated moments get picked
from. Oldest first. See `.claude/skills/process_record/SKILL.md` for the format.

---

## 2026-08-18 02:19 — VOX-8, the C4 instrument

**Prompt:**

> could you check the SKILL /process_record? And need to record the prompt I
> send into PROCESS_RECORD.md, with the 4 points need to be recorded in the
> PROCESS.md, and leave the PROCESS.md alone for this time. We need to make an
> instrument in this task, and I have updated the CLAUDE.md. And I provide a
> reference image in assests, it is a pip-boy interface, but we maybe do not
> need the full function of it, like switches, we save by now.

**Result:**
Replaced the starter page with VOX-8: eight channels, a struck sine + triangle +
FM-tine voice, twelve-voice polyphony, phosphor CRT playfield, Pip-Boy device
chrome. `CLAUDE.md` had already been rewritten into the design contract, so the
work was implementing it rather than deciding it.

Three calls that were not the obvious one:

The tuning is a **D minor pentatonic**, not a diatonic scale or a chromatic
keyboard. The spec line is "no way to play it wrong", and the obvious reading is
an interface rule — no score, no fail state, which the page also honours. But a
diatonic eight-note row contains a semitone and a tritone, so a player holding
all eight keys hears a cluster and reasonably concludes they did something
wrong. A pentatonic has neither interval at any pair, so a fistful of the
keyboard is a chord. "No wrong notes" became a property of the *tuning* rather
than a promise in the copy, and `spec/voice.test.ts` asserts it by computing
every pairwise interval and rejecting 1, 6 and 11 semitones.

The **articulation axis carries the expression**, not a velocity control. Y is
continuous: attack 9 ms → 1.6 ms, body 5.5 s → 3.5 s, tine index ×4 over the
range. Two players striking channel 04 at different heights get audibly
different notes, which is the spec's "two players sound different" without
asking anyone to learn a control first.

**Scoped the Pip-Boy to what `CLAUDE.md` names.** The reference image carries
hinges, vents, a hazard-striped clamp, a POWER lamp, a dial cluster and five nav
tabs. The prompt said to skip the full function, "like switches". Rather than
read that as licence to improvise, the chrome is exactly the named inventory —
status header, right rail, deck of eight, three knobs, one three-way rocker —
and nothing else. The image sets the *material* (deep bezel, monochrome phosphor
behind glass); `CLAUDE.md` sets the *inventory*.

Recording itself needed a decision. `/process_record` did not resolve, and the
obvious fallbacks were to guess at a near-match skill or to append the prompt to
`PROCESS.md` under a new heading. Neither: `comp4020:start` would have
re-scaffolded an already-scaffolded repo, and `PROCESS.md` is the *curated*
artefact whose value is a small chosen set, so appending every prompt degrades
the thing it is marked on. The ledger became its own file, carrying the same
four jobs so entries can be promoted later without reformatting.

Harness changes: `tsconfig.json` `include` gained `src` (it was compiling
unchecked); `spec/starter.test.ts` deleted as its own failure message asks;
`spec/instrument.test.ts` added for C4's checkable spec lines against `dist/`;
`spec/voice.test.ts` added to pin the voice model's numbers through pure
exported functions, since no test runner can build an `AudioContext`;
`.stylelintrc.json` widened `selector-class-pattern` to admit BEM;
`CLAUDE.md` gained a stack-facts section and the verification method below.

**Verified:**
`pnpm check` green — 47 tests over 4 files, clean oxlint and stylelint.

That number was the weaker half. `pnpm check` cannot hear anything, so the real
check was driving the page over CDP: headless Chrome with
`--autoplay-policy=no-user-gesture-required`, real `Input.dispatchMouseEvent` /
`dispatchTouchEvent` / `dispatchKeyEvent`, then reading back the telemetry the
page computes from its own audio graph. A drag across five bands plus an A/F/K
chord returned `VOX 07/12`, `BAND 08`, `CARRIER LOCK`, and deck cells lit at
`[0.60, 0, 0.002, 0.60, 0.02, 0.53, 0, 0.60]` — the four struck bands at the
levels their envelopes were actually at, not four booleans. Releasing everything
returned `VOX 00/12` and `SCAN` inside three seconds, which is how I know no
voice leaks and none sticks on. Sustain pedal read `VOX 02/12` almost a second
after keyup with Space held, and `00/12` once it lifted. Panel: rocker moved
`MODE` through CHOR / RADIO / NORM, a knob drag took `TONE` 055 → 095, five
ArrowUps took `SPACE` 030 → 055 with `aria-valuenow` tracking and `role="slider"`
intact. At 390×844 a touch drag played and `scrollWidth > clientWidth` was false.

**Commit:** [`7b46c9a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-jnheinrich451-eng/commit/7b46c9a)

**What happened:**
Nothing was flagged, but two faults survived a fully green suite and died to a
screenshot.

The **CARRIER needle was pegged at its stop** with three notes sounding. The law
was linear on bus RMS (`min(1, rms × 4.5)`), which saturates almost immediately
once the limiter is doing its job, so the needle read maximum for everything
from a chord to a fistful and had stopped reporting anything at all. It is a
square-root law now, like a moving-coil meter. `CLAUDE.md` says telemetry reads
real state and no fake numbers — a reading that is technically derived from real
state but constant across the whole playing range breaks that rule in spirit
while passing it in letter, and only looking at the gauge showed it.

**Phosphor persistence at 0.26 buried the bands.** Under `lighter` compositing,
each frame's shimmering line landed at a new phase and the previous frames were
still there, so an eight-band chord stacked into a wall of overlapping sine
curves with the eight channels invisible underneath. The screen was rendering
the audio faithfully and communicating nothing. Persistence is 0.44, the master
trace dropped from 0.42 h to 0.26 h amplitude, and impact rings are sized off
the screen's short edge rather than its long one — a ring is a note landing in a
band, and at `max(w,h) × 0.36` a single drag washed the whole tube.

Both were caught by rendering the page and reading it, and neither was reachable
from the diff. That is the argument for the CDP harness being in `CLAUDE.md`
rather than in this file only.

## 2026-08-18 02:22 — Finding the skill that already existed

**Prompt:**

> The /process_record, in last ass1, you said you moved into .claude/ and a
> certain folder? And please give me the local link, I can check for the effect
> for now!

**Result:**
The user was right and I had not looked hard enough. `/process_record` exists at
`comp4020-ass1-jnheinrich451-eng/.claude/skills/process_record/SKILL.md`. Last
turn I reported it as non-existent after checking this session's skill list,
this repo's `.claude/`, and `~/.claude/skills/` — all three true, and all three
the wrong place. Project skills resolve per-repo, so a skill written in the ass1
repo is simply not visible from the crit4 repo. "Not registered here" and "does
not exist" are different findings and I reported the second.

Copied it in with the citation URL repointed at this repo, force-added because
`.gitignore` excludes `.claude/` — which is also why the ass1 copy needed
force-adding, and why the ass1 record's first entry cites `none`.

Then rewrote `PROCESS_RECORD.md` to the format the skill actually specifies.
Last turn's entry was invented from `PROCESS.md`'s four jobs directly: numbered
`1 — What happened` … `4 — Citation`, with a numbered `001` heading. The skill's
shape is `**Prompt:** / **Result:** / **Verified:** / **Commit:**`, with
`**What happened:**` reserved for what went wrong and dated `YYYY-MM-DD HH:MM`
headings. The difference is not cosmetic: the skill's whole argument is that an
entry is written in `PROCESS.md`'s own format so that promoting a moment is
selection and trimming, never reformatting. An entry in a private shape would
have to be rewritten to be promoted, which is the failure the file exists to
prevent. Rewrote rather than kept, and did not touch `PROCESS.md`, which stays
untouched per the standing instruction.

**Verified:**
Read `SKILL.md` in full before copying rather than pattern-matching from the
folder name, and read the tail of the ass1 `PROCESS_RECORD.md` to check the
written format against the specified one — they agree, including the
`**What happened:**` placement after `**Commit:**`. Confirmed the dev server was
still serving before handing over the link: `curl -o /dev/null -w "%{http_code}"
http://localhost:5177/` returned `200`. Confirmed `.claude/skills/` is
gitignored here (`git check-ignore`), and that ass1 tracks its copy anyway
(`git ls-files .claude`), which is what justified `git add -f` over editing
`.gitignore`.

**Commit:** [`1ab5284`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-jnheinrich451-eng/commit/1ab5284)

**What happened:**
I declared a skill non-existent on the strength of three searches that were all
scoped to the wrong repo, and the user had to remember it for me. The searches
were not wrong; the conclusion drawn from them was. A negative result from a
bounded search is evidence about the bound, not about the world, and the honest
report was "not available in this repo — was it defined somewhere else?" rather
than "does not exist". The cost was a whole turn spent building a recording
format that already existed in a better-specified form twenty directories away,
and then a second turn throwing that format away.

## 2026-08-18 03:31 — The voice rebuilt to TONE.md

**Prompt:**

> lets refine the tone! Current music, to me is a bit sharp, and a bit
> electronic, I prefer a rhode-like tone, warm, smooth, and like piano. I
> uploaded a new file in ./instructions/TONE.md, you can adjust the tone!

**Result:**
Rebuilt the voice and the bus to `instructions/TONE.md`, which is now the
authority on every number in `src/engine.ts`.

The diagnosis in the file is better than "make it warmer". Sharp and electronic
had two specific causes, and TONE.md names both. First, the tine was modulating
the *fundamental's* carrier, so the FM index was smearing the note the ear is
supposed to be tracking — the brightness never fully left, because it was
attached to the part that rings for five seconds. TONE.md puts the tine on its
own carrier at 6:1 with its own short envelope, so the strike and the body are
genuinely separate voices that overlap for 300 ms. Second, the SPACE control was
a convolution reverb over a generated noise impulse, which sprays a bright room
across every note. TONE.md replaces it with an 85 ms delay damped by a lowpass
at `1500 + tone*1600`, so the tail stays in the same register as the note. That
one substitution is most of what "electronic" meant.

Two smaller things carried real weight. Filter Q went from a Y-dependent 0.7–1.6
to a flat 0.7 — TONE.md's note that "resonance turns it into a synth pluck" is
exactly right, and the top of the playfield was where it sounded most synthetic.
And the cutoff sweep became exponential (`620 * (3400/620)^b`) instead of linear,
which matters because a linear sweep bunches the whole audible change into the
top third of the gesture and leaves the bottom two-thirds feeling dead.

Chorus is now always on rather than being a mode. TONE.md is blunt about it —
"the stereo shimmer is half the Rhodes character — never zero it" — so NORM
carries 0.13 and the rocker moves it rather than switching it in.

**Two conflicts, named rather than averaged.** TONE.md moves the 520 ms / 700 ms
keyboard-vs-pointer difference from the audio to the *visuals*: audio damping is
now source-independent, and a keyed band decays faster on screen so keys still
read as percussive. `CLAUDE.md` said the opposite, so it was corrected rather
than left to rot, with the supersession written down because the old numbers are
still in the history. Separately, TONE.md disagrees with itself: its `tineDecay`
formula reaches 520 ms at the bottom of the playfield with TONE fully up, past
both its own "~150–400 ms" note and its rule "do not lengthen `tineDecay` past
~0.5 s". Its own protect-list wins, so that one corner is clamped to 0.5 s and
the formula is verbatim everywhere else. `spec/voice.test.ts` was the thing that
caught it — it asserts the five "protect these" rules by name, and rule 1 went
red against the doc's own arithmetic.

**Verified:**
`pnpm check` green, 54 tests. That measures the arithmetic, and the arithmetic
was never the question — "warm" is a claim about output.

So the output got measured. `Page.addScriptToEvaluateOnNewDocument` wrapping
`AudioNode.prototype.connect` taps anything connecting to `ctx.destination` into
an extra `AnalyserNode` — a probe that exists only in the harness and never in
shipped code. On one held note at channel 01: at 300 ms the fundamental (129 Hz
bin) sits 21 dB above the octave and 45 dB above the tine residue at 914 Hz; at
1 s only the fundamental and its octave remain, 30 dB apart, and everything else
is at the floor. That is TONE.md's "nearly sine body", confirmed rather than
assumed, and it is protect-rule #3 checked where the rule actually applies.
After release the bus reads 0.00017 RMS — silent, nothing stuck.

Bus RMS came out at 0.099 for one note and 0.223 for eight, against a voice peak
that dropped from ~0.95 to 0.155. The CARRIER needle law was refitted to those
two measurements: a single note now reads 43% of scale and a full chord 80%,
where the old square-root law parked a single note near mid-scale and never got
past 69%.

**Commit:** [`72ffe25`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-jnheinrich451-eng/commit/72ffe25)

**What happened:**
I nearly shipped "RADIO's band filter does nothing" as a finding, and it was
wrong twice over.

The first measurement compared one NORM strike against one RADIO strike and
found the high bands *louder* in RADIO — backwards from a filter that drops
8600 Hz to 4600 Hz. I then compared the ratio between two bands instead of their
levels, reasoning that a ratio is immune to gain differences, and got a 0.1 dB
difference where 2.8 dB was predicted. Two independent-looking checks agreeing
is persuasive, and both were measuring noise.

The fault was in the experiment, not the instrument. TONE.md specifies that `v`,
the bar detune and the drift LFO are all per-strike random — I had implemented
that deliberately an hour earlier — and the tine index varies about 16% strike to
strike, which in FM moves several dB of high-partial energy around. The spread
across single strikes turned out to be 5.3–7.3 dB, comfortably larger than the
effect I was hunting. Comparing two single strikes could not have worked.

Eight strikes per mode with a median, comparing spectral tilt rather than level,
gave NORM −22.70 dB, RADIO −28.18 dB, NORM again −22.73 dB. The filter darkens
the top by 5.5 dB and returns to within 0.03 dB of its starting value. The
lesson is now in `CLAUDE.md` rather than in my head: against a deliberately
stochastic instrument, a single-sample measurement is not evidence, and the
randomness I designed in is the first thing that should have occurred to me when
a measurement came back incoherent.
