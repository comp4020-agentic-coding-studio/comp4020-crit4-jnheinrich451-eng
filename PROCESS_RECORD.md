# Process record

A running, append-only log of the prompts that drove this prototype. `PROCESS.md`
is the curated map a marker reads; this file is the raw ledger it is curated
*from*. Nothing here is edited after the fact — later corrections are appended as
new entries.

Every entry records the prompt verbatim, then the four jobs `PROCESS.md` asks of
a moment:

1. **what happened** — the problem, or the thing that went wrong
2. **what I did instead of the obvious thing** — the call made, and why it beat
   the obvious one
3. **how I knew it was right** — the check run, the viewport looked at, what was
   read before accepting the diff
4. **the citation** — a commit or range, a `CLAUDE.md` change, a check that went
   red to green

---

## 001 — 2026-08-18 · The instrument, and a ledger to record it in

**Prompt (verbatim):**

> Hey Claude, could you check the SKILL /process_record? And need to record the
> prompt I send into PROCESS_RECORD.md, with the 4 points need to be recorded in
> the PROCESS.md, and leave the PROCESS.md alone for this time. We need to make
> an instrument in this task, and I have updated the CLAUDE.md. And I provide a
> reference image in assests, it is a pip-boy interface, but we maybe do not need
> the full function of it, like switches, we save by now.

**1 — What happened.** Two things at once. The prompt opened with a skill that
does not exist: `/process_record` is not registered in this session, not in
`.claude/skills/`, and not in `~/.claude/skills/` (that directory is absent
entirely). The available course skills are `comp4020:{balance,doctor,handbook,
help,onboard,preflight,radar,riff,ship,start}` — no `process_record` among them.
So the recording behaviour had to be built here rather than invoked. Behind that
sat the real work: C4 asks for a playable instrument, and `CLAUDE.md` had already
been rewritten into a full design contract for one — an 8-channel struck-piano
voice, a phosphor-green CRT playfield, Pip-Boy device chrome.

**2 — What I did instead of the obvious thing.** The obvious move on a missing
skill is to guess at a near-match and run it; the obvious move on "record my
prompt" is to paste the prompt into `PROCESS.md` under a new heading. I did
neither. Guessing at `comp4020:start` would have re-cloned and re-scaffolded a
repo already scaffolded. And `PROCESS.md` is the *curated* artefact — the course
brief is explicit that its value is a small, deliberately chosen set of moments,
so appending every prompt to it degrades exactly the thing it is marked on. So
the ledger became its own file with `PROCESS.md` untouched, carrying the same
four-job structure so entries can be promoted into it later without rewriting.

The second call was on the reference image. `assests/Fo4_Pip-Boy_3000_Mark_IV.webp`
carries a great deal that is not an instrument: hinges, vents, a hazard-striped
clamp, a POWER lamp, a dial cluster, five nav tabs. The prompt said to skip the
full function, "like switches". Rather than treat that as licence to freestyle, I
scoped the chrome to exactly what `CLAUDE.md` names — the status header, the
right rail, the deck of eight markers, three knobs, one three-way rocker — and
dropped every other greeble. The image sets the *material* (scuffed olive
casing, deep bezel, monochrome phosphor behind glass); `CLAUDE.md` sets the
*inventory*.

**3 — How I knew it was right.** Read the published spec before building rather
than after: the C4 spec's checkable lines are synthesis-not-playback, choices
shaping sound, two players sounding different, uninstructed first play, mouse /
keyboard / touch, no fail state. Every one of those is now asserted in
`spec/instrument.test.ts` against `dist/`, not against source — so the tests
describe what ships. `pnpm check` runs typecheck, build, oxlint, stylelint and
vitest green. The starter's `spec/starter.test.ts` was deleted rather than kept
passing, which is what its own failure message asks for once the starter page is
gone.

Two things `pnpm check` could not tell me, so I looked instead: the rendered page
in a browser, because `CLAUDE.md` says the rendered page is the truth; and the
audio, because a synth that typechecks can still be silent. `typecheck` also
caught the one harness gap — `tsconfig.json` included only `["*.ts", "spec"]`, so
a new `src/` would have compiled unchecked. That went into the config before the
first module landed.

**4 — Citation.** _(pending — filled in with the commit hash once this lands)_

**Harness changes this entry produced:**

- `tsconfig.json` — `include` extended to `src`, so engine modules are typechecked
- `CLAUDE.md` — stack facts appended: the `tsconfig` include list, the
  gradient-free CSS constraint, and the `spec/*.test.ts`-runs-against-`dist`
  contract
- `spec/instrument.test.ts` — added; `spec/starter.test.ts` — deleted
