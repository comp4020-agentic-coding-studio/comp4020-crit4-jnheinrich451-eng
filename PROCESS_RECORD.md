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

## 2026-08-18 11:38 — The deck realigned under the playfield

**Prompt:**

> the tone has changed significantly! And for layout, pls change the right
> vertical red box longer, nad place the keys: 01 A to 08 K, align with the
> interactive window? I think this maybe fitter?

Annotated screenshot: one red box round the telemetry rail, one round deck
cells 01–07, with 08 stranded outside it under the rail.

**Result:**
The two asks turned out to be one fault. The deck was a **sibling** of
`.screen__stage` rather than a cell inside it, so it spanned the full width of
the screen section — which is why marker 08 sat under the rail instead of under
band 08, and why the rail stopped one row short of the bottom. Making the deck a
stage cell fixes both at once: the stage is now two columns by two rows, the
glass and deck share column one, and the rail takes column two across both rows.

Worth naming because the obvious fix was two separate ones — stretch the rail
with a height, and shrink the deck with a width or a margin. Both would have
worked at 1280px and drifted at every other width, because they would have been
two numbers guessed to agree rather than one relationship expressed once. This
is the fault `CLAUDE.md` §"absolute offsets" warns about in the ass1 repo, and it
showed up here as a layout that looked deliberate and was not.

**Verified:**
Measured in page pixels over CDP rather than judged from the screenshot, because
"aligned" is a claim with a number attached. Marker-to-band centre offsets came
back `[-0.87, -0.62, -0.37, -0.12, 0.13, 0.38, 0.63, 0.88]` — visually fine,
arithmetically wrong, and wrong in a pattern (a linear ramp through zero) that
says the deck is a couple of pixels wider than the canvas rather than misplaced.

Two causes, both found by the ramp rather than by looking. A grid `gap` makes
each track `(W - 7g)/8` wide, so the markers spread; and the glass carries a 1px
border with the canvas inside it, so the deck was 1px wider on each side. Tracks
are now exactly `W/8` with the cells inset by margin, and the deck carries a
matching 1px padding. Offsets are `[0, 0, 0, 0, 0, 0, 0, 0]` at 1280px and at
390px. Also confirmed the narrow stack still reads canvas → deck → rail with no
horizontal overflow, and `pnpm check` stayed green at 54 tests throughout.

**Commit:** [`6c20baa`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-jnheinrich451-eng/commit/6c20baa)

**What happened:**
Nothing was flagged, but the layout change exposed a text-wrapping bug that had
been there since the invite was written, and my first fix for it was wrong.

Widening the stage re-flowed the opening screen so both hint lines broke
mid-phrase — "there are no / wrong notes". I raised `max-width` from 56ch to
78ch by counting the characters in the longest line, and it still wrapped. The
reason is that `.invite__sub` carries `letter-spacing: 0.1em`, so a character
occupies about 1.17ch, not 1ch, and 78ch holds about 67 characters. `ch` is the
width of a "0", and letter-spacing is added *on top of* it — so any element with
tracking needs its character-count cap divided by that factor. 90ch fits it.

Small, but it is the same class of error as the layout fault it appeared next
to: a number that looked like it was derived and was actually guessed.

## 2026-08-18 11:56 — Twelve-voice polyphony that wasn't

**Prompt:**

> you check the bug, VOX bar, it excceeds the 12! And it seems, I can test it to
> 60+, as long as I move the cursor fast from those steps. If we need limit, or
> reflect the true condition? Like we set VOX to 80?

Annotated screenshot: `VOX 20/12`, with the meter bar running out through the
right-hand side of the rail.

**Result:**
A real bug, and the user's two options were the right two to weigh. I took the
first — enforce the cap — because twelve is a design decision from `CLAUDE.md`
("12-voice polyphony, oldest-voice culling") and `TONE.md` ("compressor and
limiter exist because 12 voices of sine stack fast"), not a display choice.
Raising the readout to 80 would have made the number honest about a state the
audio chain is not built for: sixty voices is three hundred oscillators, and the
limiter is sized for twelve. The fix belonged in the engine, not the label.

The cause was that culling never actually culled. `cull()` damped the oldest
voice and scheduled its oscillators to stop, but the voice stayed in the live
list until `onended` fired ~250 ms later — and `strike()` called `cull()` at most
once per note. A drag crossing band boundaries strikes far faster than 250 ms, so
each strike added one voice and freed none. The cap was a comment, not a
mechanism.

Culling now removes the voice from the list synchronously and fades what remains
over 50 ms rather than cutting it — short enough to be inaudible, long enough not
to click, which a hard stop on a still-ringing voice would. How many to cull is
derived from how far over the line the list is, through a pure `voicesToCull()`
that a test can assert, instead of one speculative cull per strike.

One deliberate asymmetry in the display fix: the **bar** is clamped so it can
never break the rail's layout again, and the **number** is not. If the cap breaks
a second time the readout should still say `20/12` and give the bug away.
Clamping both would have turned a visible fault into a silent one, which is the
same trade `CLAUDE.md`'s "telemetry reads real state, no fake numbers" is about.

**Verified:**
`pnpm check` green at 56 tests, two of them new and asserting the cap
arithmetically.

The part that mattered was proving the repro was real. Dispatching the drag over
CDP and sampling peak VOX gave exactly 12/12 with `--fill` at 1.000 — but a pass
that never reproduces the bug proves nothing about the fix, so I stashed just
`src/engine.ts`, let the dev server hot-reload the pre-fix code, and ran the same
input again: **15/12, with the bar at 1.250**. Restored the fix, re-ran, 12/12
and 1.000, returning to 00/12 after release.

Worth stating plainly that the scripted drag reproduces 15 where the user
reported 60+. Each `Input.dispatchMouseEvent` is a round trip, so the harness
simply cannot move a cursor as fast as a hand. It is the same bug at a lower
severity, and the fix is a cap rather than a bigger budget, so the gap between 15
and 60 does not change the conclusion — but the harness is not a substitute for
someone actually dragging on it, which is how this was found.

**Commit:** [`b083a01`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-jnheinrich451-eng/commit/b083a01)

**What happened:**
The user found this, not me, and my own harness had walked straight past it. The
CDP pass I wrote two turns ago reads `VOX` on every run and had been printing
`07/12` and `08/12` for three sessions — values that look fine and are fine. It
never printed the peak, only a sample taken at one moment, and it never dragged
faster than a leisurely eight steps. The instrument was never stressed, so the
bug was never in the sample.

The lesson is about what the harness was shaped to prove. It was written to
answer "is sound flowing", and it answered that honestly and kept answering it.
It was not written to answer "does the thing hold together when played hard",
and reading a value with a denominator printed next to it — `07/12` — never
prompted me to ask whether the denominator was enforced anywhere. A bound that
appears in the UI is a claim, and claims in this repo are supposed to have tests.
This one had a comment saying "12-voice polyphony, oldest-voice culling" in
`CLAUDE.md`, which is exactly the kind of statement that reads as settled and
turns out to be aspirational.
