// The sound engine. Everything audible on the page is synthesised here at play
// time — there is no sample, no buffer of recorded material, no <audio>.
//
// The voice is specified in `instructions/TONE.md`, which is the authority on
// every number below. Read it before changing anything in `strike()`. (That
// file says `index.html`; in this repo the function lives here — the doc was
// written against a single-file build.)
//
// The short version: a Rhodes is a hammer hitting a metal tine next to a
// tonebar, and the voice is the contrast between a short inharmonic tine attack
// and a long, nearly-sine body ring. If the tine outlives the attack it stops
// sounding struck and starts sounding like an FM pad; if the body grows
// harmonics it stops sounding like a Rhodes and starts sounding like an organ.

export type Source = "pointer" | "key";
export type ScanMode = "NORM" | "CHOR" | "RADIO";
export type Knob = "tone" | "decay" | "space";

/** What the visual layer is allowed to know about a sounding voice. */
export type VoiceView = {
  id: number;
  channel: number;
  y01: number;
  source: Source;
  /** Analytic envelope, absolute — the same curve the audio graph is running. */
  level: number;
  peak: number;
  freq: number;
  ageS: number;
  released: boolean;
};

export type Register = "LOW" | "MID" | "HIGH";
export type Root = "C" | "D" | "F" | "G" | "A";

/** Major pentatonic, in semitones from the root: two octaves of the same five
 *  notes. This is the interval set that makes any pair of bands consonant, so
 *  it is the thing that must survive transposition — REGISTER and ROOT shift
 *  where it sits, never what it is. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

const ROOT_MIDI: Record<Root, number> = { C: 48, D: 50, F: 53, G: 55, A: 57 };
const REGISTER_SHIFT: Record<Register, number> = { LOW: -12, MID: 0, HIGH: 12 };

export const REGISTERS: Register[] = ["LOW", "MID", "HIGH"];
export const ROOTS: Root[] = ["C", "D", "F", "G", "A"];

export const CHANNEL_COUNT = PENTATONIC.length;
export const MAX_VOICES = 12;

/** TONE.md: "Keyboard visuals damp at 520 ms vs pointer 700 ms so keys read as
 *  more percussive." This is the *visual* constant — audio damping is
 *  source-independent, see `dampTime`. */
export const VISUAL_DAMP_S: Record<Source, number> = { key: 0.52, pointer: 0.7 };

const DAMP_MIN = 0.28;
const DAMP_MAX = 2.6;

/** A full-strength strike's amplitude, per TONE.md's key-scaling formula.
 *  `VoiceView.level` is divided by this so the visual layer still works in
 *  0..1 — the key scaling survives the division, so a high note is drawn
 *  slightly dimmer because it really is quieter. */
const PEAK_REF = 0.155;

/** Where a keyed strike sits on the articulation axis. Above centre, so keys
 *  land bright and percussive without pinning the axis to its extreme. */
const KEY_Y = 0.62;

/** Knob smoothing. TONE.md: every parameter change ramps at τ 0.12 so a knob
 *  can never click. */
const SMOOTH = 0.12;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** The pitch of a channel. Exported so the tuning can be asserted rather than
 *  taken on trust.
 *
 *  TONE.md gives MID/C as eight literal frequencies. They are computed here
 *  instead, because REGISTER cannot transpose a hard-coded list — equal
 *  temperament reproduces every one of the doc's figures to within 0.005 Hz,
 *  which is one beat every three minutes and change. */
export function channelFreq(channel: number, register: Register = "MID", root: Root = "C"): number {
  const ch = clamp(Math.round(channel), 0, CHANNEL_COUNT - 1);
  return midiToHz(ROOT_MIDI[root] + REGISTER_SHIFT[register] + PENTATONIC[ch]);
}

/** Everything the articulation axis and the two shaping knobs decide about a
 *  single strike, worked out before a node is created.
 *
 *  Pure on purpose: this is where TONE.md's numbers actually live, so it is the
 *  thing worth testing. An AudioContext cannot be built in a test runner; this
 *  can.
 *
 *  `b` is Y position, 0 at the bottom of the playfield and 1 at the top. `v` is
 *  the per-strike hand variation — the instrument has no velocity sensor, so it
 *  is small per-strike randomness rather than a sensed value, which is what
 *  TONE.md's "nothing in the voice is quantized" asks for. */
export type VoiceShape = {
  atk: number;
  peak: number;
  /** Body decay in seconds — the doc's `decay`. */
  body: number;
  bodyTau: number;
  barPeak: number;
  barTau: number;
  barDetune: number;
  octPeak: number;
  octTau: number;
  tineAmt: number;
  tinePeak: number;
  tineDecay: number;
  tineTau: number;
  modStart: number;
  modFloor: number;
  modTau: number;
  cut: number;
  filtOpen: number;
  filtClose: number;
  driftHz: number;
  driftCents: number;
};

export function articulate(
  b01: number,
  freq: number,
  tone: number,
  dk: number,
  v = 0.5,
  detuneCents = 0,
  driftHz = 0.175,
  driftCents = 3,
): VoiceShape {
  const b = clamp(b01, 0, 1);
  const t = clamp(tone, 0, 1);
  const d = clamp(dk, 0, 1);

  const body = (5.4 - b * 1.9) * (0.42 + d * 1.1);
  const tineAmt = (0.16 + b * 0.42) * (0.85 + v * 0.3) * (0.45 + t * 1.15);
  // TONE.md's formula reaches 520 ms at b=0 with TONE fully up, which is past
  // both its own "~150-400 ms" note and its rule "do not lengthen tineDecay
  // past ~0.5 s". The rule is the half the doc says to protect, so it wins and
  // the one out-of-range corner is clamped; everywhere else this is verbatim.
  const tineDecay = Math.min(0.5, (0.4 - b * 0.18) * (0.8 + t * 0.5));
  // Exponential, so the sweep maps to how ears hear brightness rather than to
  // how a slider divides a number line.
  const cut = 620 * (3400 / 620) ** b * (0.6 + t * 0.95);

  return {
    atk: 0.014 - b * 0.007,
    // Key scaling: high notes quieter, as on the real thing. Bounded because
    // TONE.md's formula assumes the MID register — it crosses zero above about
    // 1 kHz, which ROOT A + HIGH reaches, and a negative peak is an inverted
    // silent note rather than a quiet one.
    peak:
      0.155 *
      (0.86 + v * 0.16) *
      Math.min(1.15, Math.max(0.35, 1 - (0.22 * (freq - 130)) / 200)),
    body,
    bodyTau: body * 0.28,
    barPeak: (0.1 + b * 0.06) * (0.7 + t * 0.6),
    barTau: body * 0.16,
    barDetune: detuneCents,
    octPeak: (0.06 + b * 0.07) * (0.55 + t * 0.9),
    octTau: 0.34 + (1 - b) * 0.3,
    tineAmt,
    tinePeak: tineAmt * 0.42,
    tineDecay,
    tineTau: tineDecay * 0.3,
    // The index falls about 40x in a few hundred ms. That collapse — not the
    // amplitude envelope — is what makes the note read as struck.
    modStart: freq * (2.2 + tineAmt * 5.5),
    modFloor: freq * 0.12,
    modTau: tineDecay * 0.28,
    cut,
    filtOpen: cut * 2.4,
    filtClose: cut * 0.62,
    driftHz,
    driftCents,
  };
}

/** How long the damper takes to bring a released note to silence. A short tap
 *  damps fast and a held note is let down slowly, which is what a hand leaving
 *  a key does. Source-independent: TONE.md puts the keyboard/pointer difference
 *  in the visuals, not here. */
export function dampTime(b01: number, heldS: number, dk: number): number {
  const b = clamp(b01, 0, 1);
  const base = (0.5 + (1 - b) * 0.9) * (0.5 + clamp(dk, 0, 1) * 1.2);
  const rel = heldS < 0.25 ? base * 0.55 : heldS > 1.6 ? base * 1.5 : base;
  return clamp(rel, DAMP_MIN, DAMP_MAX);
}

/** How many voices must go before another can be struck.
 *
 *  Pure so the cap can be asserted in a test: an AudioContext cannot be built
 *  in a test runner, but the arithmetic that makes 12 mean 12 can. */
export function voicesToCull(liveCount: number, max: number = MAX_VOICES): number {
  return Math.max(0, liveCount - (max - 1));
}

/** One line of the machine's log. `at` is audio uptime in seconds, so the log
 *  and the header clock cannot disagree. */
export type EngineEvent = { at: number; band: number | null; kind: "STRIKE" | "RELEASE" | "PEDAL DOWN" | "PEDAL UP" | "CAL" ; note: string };

const LOG_MAX = 10;

type Voice = {
  id: number;
  channel: number;
  source: Source;
  y01: number;
  freq: number;
  shape: VoiceShape;
  startedAt: number;
  releasedAt: number | null;
  levelAtRelease: number;
  dampTau: number;
  pedalled: boolean;
  oscs: OscillatorNode[];
  drift: OscillatorNode;
  driftGain: GainNode;
  mod: OscillatorNode;
  modGain: GainNode;
  gains: GainNode[];
  filt: BiquadFilterNode;
  amp: GainNode;
};

export class Engine {
  private ctx: AudioContext | null = null;
  private voiceBus!: GainNode;
  private bandFilt!: BiquadFilterNode;
  private master!: GainNode;
  private chorusGain!: GainNode;
  private delayFb!: GainNode;
  private delayDamp!: BiquadFilterNode;
  private delayWet!: GainNode;
  private hum!: GainNode;
  private analyser!: AnalyserNode;
  private wave: Float32Array<ArrayBuffer> = new Float32Array(1024);

  private live: Voice[] = [];
  private nextId = 1;
  private startedAtMs = 0;

  // TONE.md's defaults: a plain, playable Mk I.
  private knobs: Record<Knob, number> = { tone: 0.5, decay: 0.55, space: 0.28 };
  private mode: ScanMode = "NORM";
  private pedal = false;
  private register: Register = "MID";
  private root: Root = "C";
  private log: EngineEvent[] = [];
  private lastBand: number | null = null;
  private lastFreqHz = 0;

  get running(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  get uptimeS(): number {
    return this.ctx === null ? 0 : (performance.now() - this.startedAtMs) / 1000;
  }

  get activeCount(): number {
    return this.live.length;
  }

  get scanMode(): ScanMode {
    return this.mode;
  }

  get pedalDown(): boolean {
    return this.pedal;
  }

  knob(name: Knob): number {
    return this.knobs[name];
  }

  get tuning(): { register: Register; root: Root } {
    return { register: this.register, root: this.root };
  }

  get band(): number | null {
    return this.lastBand;
  }

  get lastFreq(): number {
    return this.lastFreqHz;
  }

  /** The most recent events, oldest first. Capped — this is a machine's status
   *  log, not a console. */
  events(): EngineEvent[] {
    return this.log;
  }

  private note(kind: EngineEvent["kind"], band: number | null, note = ""): void {
    this.log.push({ at: this.uptimeS, band, kind, note });
    if (this.log.length > LOG_MAX) this.log.shift();
  }

  /** Metered output level, 0..1, on the law fitted to measured bus RMS. One
   *  number so the CARRIER needle and the DATA readout can never disagree. */
  level01(): number {
    return Math.min(1, (this.rms() / 0.3) ** 0.75);
  }

  /** New strikes take the new tuning; voices already ringing keep the pitch
   *  they were struck at, because retuning a sounding Rhodes voice sounds like
   *  a fault rather than a feature. */
  setRegister(register: Register): void {
    if (register === this.register) return;
    this.register = register;
    this.note("CAL", null, `REG ${register}`);
  }

  setRoot(root: Root): void {
    if (root === this.root) return;
    this.root = root;
    this.note("CAL", null, `ROOT ${root}`);
  }

  /** Browsers will not let audio start without a gesture, so every entry point
   *  that could be a first gesture calls this first. Idempotent.
   *
   *  The graph is built synchronously before the await, so a strike issued in
   *  the same handler is audible rather than swallowed. */
  async start(): Promise<void> {
    if (this.ctx === null) this.build();
    const ctx = this.ctx;
    if (ctx === null) return;
    if (ctx.state === "suspended") await ctx.resume();
  }

  private build(): void {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.startedAtMs = performance.now();

    // voiceBus → bandFilt (LP 8600, Q 0.5) → HP 48 → master (0.62)
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1;

    this.bandFilt = ctx.createBiquadFilter();
    this.bandFilt.type = "lowpass";
    this.bandFilt.frequency.value = 8600;
    this.bandFilt.Q.value = 0.5;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 48;

    this.master = ctx.createGain();
    this.master.gain.value = 0.62;

    this.voiceBus.connect(this.bandFilt).connect(hp).connect(this.master);

    // --- dry + chorus + delay ------------------------------------------------
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 20;
    comp.ratio.value = 3;
    comp.attack.value = 0.002;
    comp.release.value = 0.1;

    const dry = ctx.createGain();
    dry.gain.value = 1;
    this.master.connect(dry).connect(comp);

    // Two delays, panned apart. The stereo shimmer is half the Rhodes
    // character, so this is never zeroed — only turned down.
    this.chorusGain = ctx.createGain();
    for (const [time, hz, depth, pan] of [
      [0.011, 0.21, 0.0018, -0.6],
      [0.017, 0.29, 0.0022, 0.6],
    ]) {
      const d = ctx.createDelay(0.1);
      d.delayTime.value = time;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = hz;
      const amt = ctx.createGain();
      amt.gain.value = depth;
      lfo.connect(amt).connect(d.delayTime);
      lfo.start();
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      this.master.connect(d).connect(panner).connect(this.chorusGain);
    }
    this.chorusGain.connect(comp);

    // A damped 85 ms delay in place of a reverb: it keeps the tail in the same
    // register as the note instead of spraying a bright convolved room over it,
    // which was most of what read as "electronic".
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.085;
    this.delayFb = ctx.createGain();
    this.delayDamp = ctx.createBiquadFilter();
    this.delayDamp.type = "lowpass";
    this.delayWet = ctx.createGain();
    this.master.connect(delay);
    delay.connect(this.delayDamp).connect(this.delayFb).connect(delay);
    delay.connect(this.delayWet).connect(comp);

    // RADIO's mains hum. Tiny, and gated to that mode.
    const humOsc = ctx.createOscillator();
    humOsc.frequency.value = 100;
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    humOsc.connect(this.hum).connect(comp);
    humOsc.start();

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.wave = new Float32Array(this.analyser.fftSize);

    comp.connect(limiter).connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.applyKnobs();
    this.applyMode();
  }

  // --- Playing -------------------------------------------------------------

  /** Strike a channel. `y01` is 0 at the bottom of the playfield, 1 at the top. */
  strike(channel: number, y01: number, source: Source): number {
    const ctx = this.ctx;
    if (ctx === null) return -1;

    const ch = clamp(Math.round(channel), 0, CHANNEL_COUNT - 1);
    const y = clamp(y01, 0, 1);
    const t0 = ctx.currentTime;
    const freq = channelFreq(ch, this.register, this.root);

    // A re-strike on a channel this same input is already holding damps the old
    // note first, the way a piano damper drops before the hammer returns.
    for (const v of this.live) {
      if (v.channel === ch && v.source === source && v.releasedAt === null) this.damp(v, 0.08);
    }
    for (let n = voicesToCull(this.live.length); n > 0; n -= 1) this.cull();

    // Per-strike randomness, never quantised: the bar detune keeps repeated
    // notes from phase-cancelling identically, and the drift LFO keeps a held
    // note from sitting perfectly still.
    const s = articulate(
      y,
      freq,
      this.knobs.tone,
      this.knobs.decay,
      rand(0.3, 0.8),
      rand(-4, 4),
      rand(0.11, 0.24),
      rand(2.2, 3.8),
    );

    // Static: the whole voice is scaled here, and this is the node the damper
    // acts on when the note is released.
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(s.peak, t0);

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 0.7; // low: resonance turns the hammer into a synth pluck
    filt.frequency.setValueAtTime(s.filtOpen, t0);
    filt.frequency.setTargetAtTime(s.filtClose, t0 + 0.01, 0.32);
    filt.connect(amp).connect(this.voiceBus);

    // The drift LFO feeds every oscillator's detune, so the voice as a whole
    // wanders rather than its parts wandering against each other.
    const drift = ctx.createOscillator();
    drift.frequency.value = s.driftHz;
    const driftGain = ctx.createGain();
    driftGain.gain.value = s.driftCents * this.driftScale();
    drift.connect(driftGain);
    drift.start(t0);

    const part = (
      osc: OscillatorNode,
      peak: number,
      tau: number,
      attack: number,
    ): GainNode => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + attack);
      g.gain.setTargetAtTime(0, t0 + attack, tau);
      driftGain.connect(osc.detune);
      osc.connect(g).connect(filt);
      osc.start(t0);
      return g;
    };

    const oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = freq;

    const oscB = ctx.createOscillator();
    oscB.type = "triangle";
    oscB.frequency.value = freq;
    oscB.detune.value = s.barDetune;

    const oscH = ctx.createOscillator();
    oscH.type = "sine";
    oscH.frequency.value = freq * 2;

    const tineCar = ctx.createOscillator();
    tineCar.type = "sine";
    tineCar.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 6;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(s.modStart, t0);
    modGain.gain.setTargetAtTime(s.modFloor, t0, s.modTau);
    mod.connect(modGain).connect(tineCar.frequency);
    mod.start(t0);

    const gains = [
      part(oscA, 1, s.bodyTau, s.atk),
      part(oscB, s.barPeak, s.barTau, s.atk),
      part(oscH, s.octPeak, s.octTau, s.atk),
      part(tineCar, s.tinePeak, s.tineTau, 0.004),
    ];

    const voice: Voice = {
      id: this.nextId,
      channel: ch,
      source,
      y01: y,
      freq,
      shape: s,
      startedAt: t0,
      releasedAt: null,
      levelAtRelease: s.peak,
      dampTau: 0.14,
      pedalled: false,
      oscs: [oscA, oscB, oscH, tineCar],
      drift,
      driftGain,
      mod,
      modGain,
      gains,
      filt,
      amp,
    };
    this.nextId += 1;
    this.live.push(voice);
    this.lastBand = ch;
    this.lastFreqHz = freq;
    this.note("STRIKE", ch);

    // A voice left untouched still has to stop: schedule the natural end so a
    // note nobody releases cannot leak an oscillator.
    this.stopAfter(voice, s.body + 1.5);
    return voice.id;
  }

  /** Pointer drag: articulation follows the pointer while the note is held, so
   *  position is timbre continuously and not only at the instant of impact. */
  bend(id: number, y01: number): void {
    const ctx = this.ctx;
    const v = this.live.find((x) => x.id === id);
    if (ctx === null || v === undefined || v.releasedAt !== null) return;
    const y = clamp(y01, 0, 1);
    v.y01 = y;
    const next = articulate(y, v.freq, this.knobs.tone, this.knobs.decay);
    v.filt.frequency.setTargetAtTime(next.filtClose, ctx.currentTime, SMOOTH);
  }

  release(id: number): void {
    const v = this.live.find((x) => x.id === id);
    if (v === undefined || v.releasedAt !== null) return;
    this.note("RELEASE", v.channel);
    if (this.pedal) {
      // Sustain pedal down: lift the damper and let the body ring out on its
      // own decay instead.
      v.pedalled = true;
      return;
    }
    this.damp(v, this.dampTimeFor(v));
  }

  releaseAll(source: Source): void {
    // Iterate a copy: releasing can retire a voice and rewrite `live` underneath.
    for (const v of this.live.slice()) if (v.source === source) this.release(v.id);
  }

  setPedal(down: boolean): void {
    if (down === this.pedal) return;
    this.pedal = down;
    this.note(down ? "PEDAL DOWN" : "PEDAL UP", null);
    if (down) return;
    for (const v of this.live.slice()) {
      if (v.pedalled) {
        v.pedalled = false;
        this.damp(v, this.dampTimeFor(v));
      }
    }
  }

  private dampTimeFor(v: Voice): number {
    const ctx = this.ctx;
    if (ctx === null) return DAMP_MIN;
    return dampTime(v.y01, ctx.currentTime - v.startedAt, this.knobs.decay);
  }

  private damp(v: Voice, seconds: number): void {
    const ctx = this.ctx;
    if (ctx === null || v.releasedAt !== null) return;
    const now = ctx.currentTime;
    v.levelAtRelease = this.levelAt(v, now);
    v.releasedAt = now;
    v.dampTau = seconds / 5;
    v.amp.gain.cancelScheduledValues(now);
    v.amp.gain.setValueAtTime(v.shape.peak, now);
    v.amp.gain.setTargetAtTime(0, now, v.dampTau);
    this.stopAfter(v, seconds + 0.2);
  }

  /** Oldest first — with twelve voices the note being stolen is always the one
   *  furthest into its decay, so the theft is the least audible one available. */
  private cull(): void {
    if (this.live.length === 0) return;
    this.retire(this.live.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b)), 0.05);
  }

  /** Take a voice out of the polyphony budget now and fade what is left of it.
   *
   *  The list membership has to drop synchronously. Culling used to lean on the
   *  oscillator's `onended` to remove the voice, which lands ~250 ms later —
   *  long enough for a fast drag to strike a dozen more times before the slot
   *  came free, so twelve-voice polyphony was not a cap at all and VOX climbed
   *  past 60/12. The 50 ms fade is short enough to be inaudible and long enough
   *  not to click, which a hard stop on a still-ringing voice would. */
  private retire(v: Voice, fade: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const now = ctx.currentTime;
    if (v.releasedAt === null) {
      v.releasedAt = now;
      v.levelAtRelease = this.levelAt(v, now);
    }
    v.dampTau = fade / 5;
    // Wherever the envelope has got to, go from there: this voice may already
    // be mid-release, so re-asserting `peak` would make it jump back up.
    const from = v.amp.gain.value;
    v.amp.gain.cancelScheduledValues(now);
    v.amp.gain.setValueAtTime(from, now);
    v.amp.gain.setTargetAtTime(0, now, v.dampTau);
    this.stopAfter(v, fade + 0.02);
    this.live = this.live.filter((x) => x !== v);
  }

  private stopAfter(v: Voice, seconds: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const at = ctx.currentTime + Math.max(0.01, seconds);
    for (const osc of [...v.oscs, v.mod, v.drift]) {
      try {
        osc.stop(at);
      } catch {
        // already scheduled to stop earlier; the earlier stop wins
      }
    }
    v.oscs[0].onended = (): void => {
      for (const node of [...v.oscs, v.mod, v.drift, v.modGain, v.driftGain, ...v.gains]) {
        node.disconnect();
      }
      v.filt.disconnect();
      v.amp.disconnect();
      this.live = this.live.filter((x) => x !== v);
    };
  }

  // --- Controls ------------------------------------------------------------

  setKnob(name: Knob, value: number): void {
    this.knobs[name] = clamp(value, 0, 1);
    this.applyKnobs();
  }

  setMode(mode: ScanMode): void {
    this.mode = mode;
    this.applyMode();
  }

  private driftScale(): number {
    return this.mode === "RADIO" ? 2.6 : 1;
  }

  private applyKnobs(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const t = ctx.currentTime;
    // TONE and DECAY are read at strike time; the delay is the live half.
    this.delayFb.gain.setTargetAtTime(0.14 + this.knobs.space * 0.3, t, SMOOTH);
    this.delayWet.gain.setTargetAtTime(0.02 + this.knobs.space * 0.36, t, SMOOTH);
    this.delayDamp.frequency.setTargetAtTime(1500 + this.knobs.tone * 1600, t, SMOOTH);
  }

  private applyMode(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const t = ctx.currentTime;
    const chorus = this.mode === "CHOR" ? 0.34 : this.mode === "RADIO" ? 0.18 : 0.13;
    this.chorusGain.gain.setTargetAtTime(chorus, t, SMOOTH);
    this.bandFilt.frequency.setTargetAtTime(this.mode === "RADIO" ? 4600 : 8600, t, SMOOTH);
    this.hum.gain.setTargetAtTime(this.mode === "RADIO" ? 0.0035 : 0, t, SMOOTH);
    const scale = this.driftScale();
    for (const v of this.live) {
      v.driftGain.gain.setTargetAtTime(v.shape.driftCents * scale, t, SMOOTH);
    }
  }

  // --- What the visuals may read -------------------------------------------

  /** The analytic envelope of the body, which is the part that outlives the
   *  strike and so the part a band's brightness should follow.
   *
   *  After release the visual decay uses TONE.md's per-source constant rather
   *  than the audio damp time — that is where the 520 ms / 700 ms difference
   *  lives, and it is what makes a keyed note read as more percussive than a
   *  lifted finger even when both damp identically in the ear. */
  private levelAt(v: Voice, t: number): number {
    const dt = t - v.startedAt;
    if (dt <= 0) return 0;
    const { atk, peak, bodyTau } = v.shape;
    const body = dt < atk ? dt / atk : Math.exp(-(dt - atk) / bodyTau);
    if (v.releasedAt === null || v.pedalled) return peak * body;
    const visualTau = VISUAL_DAMP_S[v.source] / 3;
    return v.levelAtRelease * Math.exp(-(t - v.releasedAt) / visualTau);
  }

  voices(): VoiceView[] {
    const ctx = this.ctx;
    if (ctx === null) return [];
    const t = ctx.currentTime;
    return this.live.map((v) => ({
      id: v.id,
      channel: v.channel,
      y01: v.y01,
      source: v.source,
      level: this.levelAt(v, t) / PEAK_REF,
      peak: v.shape.peak / PEAK_REF,
      freq: v.freq,
      ageS: t - v.startedAt,
      released: v.releasedAt !== null && !v.pedalled,
    }));
  }

  /** Time-domain samples off the master bus — actual output, after the limiter. */
  waveform(): Float32Array<ArrayBuffer> {
    if (this.ctx === null) return this.wave;
    this.analyser.getFloatTimeDomainData(this.wave);
    return this.wave;
  }

  /** Bus RMS, 0..1-ish. The CARRIER LOCK needle rides this. */
  rms(): number {
    const w = this.waveform();
    let sum = 0;
    for (let i = 0; i < w.length; i += 1) sum += w[i] * w[i];
    return Math.sqrt(sum / w.length);
  }

  static keyY(): number {
    return KEY_Y;
  }
}
