# TONE.md — the Rhodes-like voice

How the struck tone is built and what each number does. Read this before touching `strike()` in `index.html`.

## The idea
A Rhodes is a hammer hitting a metal tine next to a tonebar. Two things happen at once:
1. A short, bell-like **tine attack** — inharmonic, bright, gone in under half a second.
2. A long, nearly sine **body/bar ring** — the pitch you actually hear, decaying for seconds.

The whole voice is that contrast. If the tine outlives the attack it stops sounding struck and starts sounding like an FM pad. If the body has harmonics in it, it stops sounding like a Rhodes and starts sounding like an organ.

## Four oscillators per voice
| Part | Wave | Freq | Peak | Decay | Role |
|---|---|---|---|---|---|
| `oscA` fundamental | sine | `freq` | full (via `amp`) | body, `decay * 0.28` | the note |
| `oscB` bar | triangle | `freq`, ±4¢ random | `(0.10 + b*0.06) * (0.7 + tone*0.6)` | `decay * 0.16` | wood/bar colour, must stay under the sine |
| `oscH` octave | sine | `freq * 2` | `(0.06 + b*0.07) * (0.55 + tone*0.9)` | `0.34 + (1-b)*0.3` | the "ping" that reads as metal |
| `tineCar` + `modOsc` | sine FM, ratio **6:1** | `freq` / `freq*6` | `tineAmt * 0.42` | `tineDecay * 0.3` | the strike |

Envelopes are `linearRampToValueAtTime` up, `setTargetAtTime` down — exponential tails, never linear. Linear releases sound like a fader, not a decay.

### The tine collapse is the signature
```
modAmt = freq * (2.2 + tineAmt * 5.5)   →  freq * 0.12   over tineDecay * 0.28
tineDecay = (0.40 - b * 0.18) * (0.8 + tone * 0.5)     // ~150–400 ms
```
Index falls ~40× in a few hundred ms. That collapse — not the amplitude envelope — is what makes it read as *struck*. Do not lengthen `tineDecay` past ~0.5 s and do not let the index floor rise above ~`freq * 0.2`.

## Y position (`b` = 0 bottom → 1 top)
One gesture axis controls the whole articulation. `b` is the only thing that moves between a mellow Mk I and a bitey Mk II:

- `tineAmt = (0.16 + b*0.42) * (0.85 + v*0.3) * (0.45 + tone*1.15)` — bark
- `cut = 620 * (3400/620)^b * (0.6 + tone*0.95)` — exponential, so it maps to how ears hear brightness
- `atk = 0.014 - b*0.007` — top of the field strikes harder/faster
- `decay = (5.4 - b*1.9) * (0.42 + dk*1.1)` — bottom rings longest (~5.4 s), top shortest

Bottom = soft, dark, long. Top = bright, fast, percussive. Both ends must sound like the same instrument played differently, not two instruments.

## Per-voice filter — open then close
```
filt.frequency: cut * 2.4  →  cut * 0.62   (τ 0.32, starting 10 ms in)
Q = 0.7
```
This is the hammer. A static filter kills the strike entirely. Q stays low — resonance turns it into a synth pluck.

## Detail that keeps it from sounding digital
- **Detune:** `oscB` gets ±4¢ random per strike, so repeated notes never phase-cancel identically.
- **Drift:** per-voice 0.11–0.24 Hz LFO into every oscillator's `detune`, depth 2.2–3.8¢ (×2.6 in RADIO). Slow, subtle, always on.
- **Key scaling:** `peak = 0.155 * (0.86 + v*0.16) * (1 - 0.22*(freq-130)/200)` — high notes quieter, as on the real thing.
- **Channels:** `130.81 146.83 164.81 196.00 220.00 261.63 293.66 329.63` — C3 D3 E3 G3 A3 C4 D4 E4, a pentatonic run so any combination is consonant.

## Damping (release)
```
base = (0.5 + (1-b)*0.9) * (0.5 + decay*1.2)
rel  = held < 0.25s ? base*0.55 : held > 1.6s ? base*1.5 : base    // clamped 0.28–2.6 s
```
Short taps damp fast, held notes let go slowly — mimics a hand leaving the key. Keyboard visuals damp at 520 ms vs pointer 700 ms so keys read as more percussive.

## Bus (shared, after all voices)
`voiceBus → bandFilt (LP 8600, Q 0.5) → HP 48 → master (0.62) → [dry + chorus + delay] → comp → limiter`

- **Chorus:** two delays, 11/17 ms, LFOs 0.21/0.29 Hz, depth 1.8/2.2 ms, panned ∓0.6. Gain 0.13 NORM / 0.34 CHOR / 0.18 RADIO. The stereo shimmer is half the Rhodes character — never zero it.
- **Delay/space:** 85 ms, feedback `0.14 + space*0.3`, damped by LP `1500 + tone*1600`, wet `0.02 + space*0.36`.
- **RADIO:** band LP drops to 4600, drift ×2.6, and 100 Hz mains hum at 0.0035.
- Compressor + limiter (attack 2 ms, release 100 ms) exist because 12 voices of sine stack fast.

## Control mapping
`tone 0.5 / decay 0.55 / space 0.28 / mode 0` are the defaults — a plain, playable Mk I. TONE scales tine amount, filter cut, bar/octave level and delay damping together (one knob, coordinated move). DECAY scales body decay and release. All parameter changes use `setTargetAtTime` with τ 0.12 so knobs never click.

## If you change the tone, protect these
1. The tine must collapse in under ~0.5 s.
2. The per-voice filter must move.
3. The fundamental stays a sine and stays loudest.
4. Nothing in the voice is quantized or LFO-synced — drift and detune are per-strike random.
5. Y must remain a continuous articulation axis, not a preset switch.
