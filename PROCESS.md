# Process overview

VOX-8, an eight-channel struck-tine instrument. Everything is synthesised at
play time; the playfield draws nothing an audio event did not cause; Y position
carries the whole expressive range, soft and long at the bottom, bright and fast
at the top. The tuning is pentatonic, so "no wrong notes" is a property of the
instrument rather than a promise in the copy. Fuller ledger:
[PROCESS_RECORD.md](PROCESS_RECORD.md).

## Twelve-voice polyphony was a comment, not a mechanism

`VOX` read `20/12` on a fast drag, past `60/12` if you dragged hard. The obvious
fix was the one I was offered — raise the readout to 80. Instead the cap turned
out never to have existed: culling only *scheduled* a voice to stop, and it sat
in the list for the ~250 ms until its oscillator reported back, far longer than
a drag takes to strike again. Culling is synchronous now, and how many to cull
comes from a pure `voicesToCull()` a test can assert. I clamped the meter bar
but deliberately not the number, so a regression stays visible rather than
silent. A pass that never reproduces a bug proves nothing, so I stashed
`src/engine.ts` alone and replayed the input against the old code — `15/12`,
against `12/12` with the fix
([`b083a01`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-jnheinrich451-eng/commit/b083a01)).

## A deliberately random instrument defeats a single measurement

Checking whether RADIO's filter worked, two independent measurements said it was
dead — the second comparing a ratio precisely because ratios ignore gain. Both
measured noise: the voice is per-strike random by design, and the spread between
single strikes is 5+ dB, larger than the effect. Rather than rewire working
code, I changed the experiment. Median of eight strikes, comparing spectral
tilt: NORM −22.70 dB, RADIO −28.18, NORM −22.73. Both traps are now in
`CLAUDE.md`
([`72ffe25`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-jnheinrich451-eng/commit/72ffe25)).
