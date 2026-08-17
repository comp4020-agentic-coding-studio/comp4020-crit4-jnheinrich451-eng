// The sound engine. Everything audible on the page is synthesised here at play
// time — there is no sample, no buffer of recorded material, no <audio>.
//
// The voice is a struck one: a sine fundamental for body, a restrained triangle
// for the wooden edge of the attack, and an FM "tine" that collapses inside
// 150–400 ms the way a Rhodes bar does. A lowpass opens on impact and closes
// again as the note settles, so the note is brightest in its first instant.
//
// Y position is articulation, and it is the whole expressive axis: struck at the
// bottom of the playfield a note is soft, dark and long; struck at the top it is
// bright and fast. That mapping is what makes two players sound different
// playing the same eight channels.

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

// D minor pentatonic over an octave and a half. A pentatonic has no leading
// tone and no tritone, so no two channels can be struck together and sound
// wrong — which is the spec's "no way to play it wrong" expressed in tuning
// rather than in a rule the player has to learn.
const CHANNEL_MIDI = [50, 53, 55, 57, 60, 62, 65, 67];

export const CHANNEL_COUNT = CHANNEL_MIDI.length;
export const MAX_VOICES = 12;

/** Nominal damping per input. Keys are the faster of the two on purpose: a key
 *  release is a definite gesture, a pointer lift is a vaguer one, and the
 *  shorter damp is what makes the keyboard feel percussive next to a drag. */
const DAMP_NOMINAL: Record<Source, number> = { pointer: 0.7, key: 0.52 };
const DAMP_MIN = 0.35;
const DAMP_MAX = 2.0;

/** Natural body decay, before the DECAY knob scales it. Top of the playfield is
 *  the short end. */
const BODY_FAST = 3.5;
const BODY_SLOW = 5.5;

/** Where a keyed strike sits on the articulation axis. Above centre, so keys
 *  land bright and percussive without pinning the axis to its extreme. */
const KEY_Y = 0.62;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** The pitch of a channel. Exported so the tuning can be asserted rather than
 *  taken on trust. */
export function channelFreq(channel: number): number {
  return midiToHz(CHANNEL_MIDI[clamp(Math.round(channel), 0, CHANNEL_COUNT - 1)]);
}

/** Everything the articulation axis and the two shaping knobs decide about a
 *  single strike, worked out before a node is created.
 *
 *  This is a pure function on purpose: it is where CLAUDE.md's numbers actually
 *  live, so it is the thing worth testing. An AudioContext cannot be built in a
 *  test runner; this can. */
export type VoiceShape = {
  attack: number;
  peak: number;
  bodyS: number;
  tineS: number;
  tineRatio: number;
  tineIndex: number;
  openHz: number;
  closeHz: number;
  filterTau: number;
  triGain: number;
  resonance: number;
};

export function articulate(y01: number, freq: number, tone: number, decay: number): VoiceShape {
  const y = clamp(y01, 0, 1);
  const bright = lerp(0.45, 2.1, clamp(tone, 0, 1));
  const decayScale = lerp(0.55, 1.7, clamp(decay, 0, 1));
  return {
    attack: lerp(0.009, 0.0016, y),
    peak: lerp(0.62, 0.95, y),
    bodyS: lerp(BODY_SLOW, BODY_FAST, y) * decayScale,
    tineS: lerp(0.4, 0.15, y),
    tineRatio: lerp(4, 7, y),
    tineIndex: freq * lerp(1.6, 6.5, y) * bright,
    openHz: clamp(freq * lerp(6, 26, y) * bright, 240, 16000),
    closeHz: clamp(freq * lerp(1.5, 3.6, y) * bright, 170, 9000),
    filterTau: lerp(0.55, 0.16, y),
    triGain: lerp(0.16, 0.09, y),
    resonance: lerp(0.7, 1.6, y),
  };
}

/** How long the damper takes to bring a released note to silence. Shorter for a
 *  note let go of early, and shorter for a key than for a lifted finger — held
 *  inside 0.35–2 s whatever the DECAY knob is doing. */
export function dampTime(source: Source, heldS: number, decay: number): number {
  const held01 = clamp(heldS / 2, 0, 1);
  const decayScale = lerp(0.55, 1.7, clamp(decay, 0, 1));
  return clamp(DAMP_NOMINAL[source] * (0.5 + 2.4 * held01) * decayScale, DAMP_MIN, DAMP_MAX);
}

type Voice = {
  id: number;
  channel: number;
  source: Source;
  y01: number;
  freq: number;
  peak: number;
  attack: number;
  /** Body decay time constant; the amp reaches about −60 dB at 6 τ. */
  tau: number;
  startedAt: number;
  releasedAt: number | null;
  levelAtRelease: number;
  dampTau: number;
  pedalled: boolean;
  carrier: OscillatorNode;
  tri: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  filter: BiquadFilterNode;
  amp: GainNode;
};

/** A noise impulse response, decaying exponentially — a room, generated rather
 *  than fetched, so the page ships no binary and works offline. */
function makeImpulse(ctx: AudioContext, seconds: number, curve: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** curve;
    }
  }
  return buf;
}

function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i += 1) {
    // One-pole lowpassed white noise: hiss with the top taken off it, which is
    // what a detuned receiver actually sounds like.
    last = 0.94 * last + 0.06 * (Math.random() * 2 - 1);
    data[i] = last * 3.2;
  }
  return buf;
}

export class Engine {
  private ctx: AudioContext | null = null;
  private voiceBus!: GainNode;
  private sum!: GainNode;
  private analyser!: AnalyserNode;
  private spaceSend!: GainNode;
  private modeGain!: Record<ScanMode, GainNode>;
  private radioHiss!: GainNode;
  // Explicitly buffer-backed: getFloatTimeDomainData will not take a view that
  // might sit on a SharedArrayBuffer.
  private wave: Float32Array<ArrayBuffer> = new Float32Array(1024);

  private live: Voice[] = [];
  private nextId = 1;
  private startedAtMs = 0;

  private knobs: Record<Knob, number> = { tone: 0.55, decay: 0.5, space: 0.3 };
  private mode: ScanMode = "NORM";
  private pedal = false;

  get running(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** Seconds of audio uptime — real, not a page-load timer: it only advances
   *  once there is a context to advance. The header reads this. */
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

  /** Browsers will not let audio start without a gesture, so every entry point
   *  that could be a first gesture calls this first. Idempotent. */
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

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 0.9;

    this.sum = ctx.createGain();
    this.sum.gain.value = 1;

    // --- SCAN MODE: three permanently wired colourings, crossfaded ------------
    // Built once and mixed by gain rather than rewired on switch, so changing
    // mode never clicks and never drops a note that is already ringing.
    const norm = ctx.createGain();
    this.voiceBus.connect(norm);
    norm.connect(this.sum);

    const chor = ctx.createGain();
    this.voiceBus.connect(chor);
    const chorusOut = ctx.createGain();
    chorusOut.gain.value = 0.62;
    for (let i = 0; i < 3; i += 1) {
      const d = ctx.createDelay(0.08);
      d.delayTime.value = 0.011 + i * 0.007;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.17 + i * 0.113;
      const depth = ctx.createGain();
      depth.gain.value = 0.0032;
      lfo.connect(depth).connect(d.delayTime);
      lfo.start();
      chor.connect(d).connect(chorusOut);
    }
    chor.connect(chorusOut); // keep the dry centre so chorus widens, not smears
    chorusOut.connect(this.sum);

    const radio = ctx.createGain();
    this.voiceBus.connect(radio);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1350;
    band.Q.value = 1.5;
    const carrierAm = ctx.createGain();
    carrierAm.gain.value = 0.84;
    const amLfo = ctx.createOscillator();
    amLfo.frequency.value = 6.3;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.16;
    amLfo.connect(amDepth).connect(carrierAm.gain);
    amLfo.start();
    radio.connect(band).connect(carrierAm).connect(this.sum);

    // The hiss belongs to RADIO, so it is gated by that mode's gain and is
    // silent in the other two.
    const hiss = ctx.createBufferSource();
    hiss.buffer = makeNoise(ctx, 3);
    hiss.loop = true;
    const hissBand = ctx.createBiquadFilter();
    hissBand.type = "bandpass";
    hissBand.frequency.value = 1700;
    hissBand.Q.value = 0.7;
    this.radioHiss = ctx.createGain();
    this.radioHiss.gain.value = 0;
    hiss.connect(hissBand).connect(this.radioHiss).connect(this.sum);
    hiss.start();

    this.modeGain = { NORM: norm, CHOR: chor, RADIO: radio };
    norm.gain.value = 1;
    chor.gain.value = 0;
    radio.gain.value = 0;

    // --- SPACE: a generated room, on a send ----------------------------------
    this.spaceSend = ctx.createGain();
    this.spaceSend.gain.value = 0;
    const preDelay = ctx.createDelay(0.1);
    preDelay.delayTime.value = 0.019;
    const room = ctx.createConvolver();
    room.buffer = makeImpulse(ctx, 2.8, 3.1);
    const spaceReturn = ctx.createGain();
    spaceReturn.gain.value = 1;
    this.sum.connect(this.spaceSend).connect(preDelay).connect(room).connect(spaceReturn);

    // --- Bus compressor, then limiter ----------------------------------------
    // Twelve struck voices at once is a lot of transient. The compressor holds
    // the body together; the limiter exists only to make clipping impossible,
    // which is the audio half of "no way to play it wrong".
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.06;

    const master = ctx.createGain();
    master.gain.value = 0.92;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.wave = new Float32Array(this.analyser.fftSize);

    this.sum.connect(comp);
    spaceReturn.connect(comp);
    comp.connect(limiter).connect(master).connect(this.analyser);
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
    const freq = channelFreq(ch);

    // A re-strike on a channel this same input is already holding damps the old
    // note first, the way a piano damper drops before the hammer returns.
    for (const v of this.live) {
      if (v.channel === ch && v.source === source && v.releasedAt === null) this.damp(v, 0.08);
    }
    if (this.live.length >= MAX_VOICES) this.cull();

    const s = articulate(y, freq, this.knobs.tone, this.knobs.decay);
    const { attack, peak, tineIndex } = s;
    const tau = s.bodyS / 6;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + attack);
    amp.gain.setTargetAtTime(0, t0 + attack, tau);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = s.resonance;
    filter.frequency.setValueAtTime(s.closeHz, t0);
    filter.frequency.linearRampToValueAtTime(s.openHz, t0 + attack);
    filter.frequency.setTargetAtTime(s.closeHz, t0 + attack, s.filterTau);

    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;

    const tri = ctx.createOscillator();
    tri.type = "triangle";
    tri.frequency.value = freq;
    const triAmp = ctx.createGain();
    triAmp.gain.value = s.triGain;

    // The tine: a modulator on the carrier's frequency whose index collapses
    // fast. Nothing else in the voice is allowed to be this bright.
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * s.tineRatio;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(0, t0);
    modGain.gain.linearRampToValueAtTime(tineIndex, t0 + 0.0015);
    modGain.gain.setTargetAtTime(0, t0 + 0.0015, s.tineS / 4);
    mod.connect(modGain).connect(carrier.frequency);

    carrier.connect(filter);
    tri.connect(triAmp).connect(filter);
    filter.connect(amp).connect(this.voiceBus);

    carrier.start(t0);
    tri.start(t0);
    mod.start(t0);

    const voice: Voice = {
      id: this.nextId,
      channel: ch,
      source,
      y01: y,
      freq,
      peak,
      attack,
      tau,
      startedAt: t0,
      releasedAt: null,
      levelAtRelease: peak,
      dampTau: DAMP_NOMINAL[source] / 5,
      pedalled: false,
      carrier,
      tri,
      mod,
      modGain,
      filter,
      amp,
    };
    this.nextId += 1;
    this.live.push(voice);

    // A voice left untouched still has to stop: schedule the natural end so a
    // note nobody releases cannot leak an oscillator.
    this.stopAfter(voice, s.bodyS + 1.5);
    this.balance();
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
    const bright = lerp(0.45, 2.1, this.knobs.tone);
    const target = clamp(v.freq * lerp(1.5, 3.6, y) * bright, 170, 9000);
    v.filter.frequency.setTargetAtTime(target, ctx.currentTime, 0.06);
  }

  release(id: number): void {
    const v = this.live.find((x) => x.id === id);
    if (v === undefined || v.releasedAt !== null) return;
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
    return dampTime(v.source, ctx.currentTime - v.startedAt, this.knobs.decay);
  }

  private damp(v: Voice, seconds: number): void {
    const ctx = this.ctx;
    if (ctx === null || v.releasedAt !== null) return;
    const now = ctx.currentTime;
    const level = this.levelAt(v, now);
    v.releasedAt = now;
    v.levelAtRelease = level;
    v.dampTau = seconds / 5;
    v.amp.gain.cancelScheduledValues(now);
    v.amp.gain.setValueAtTime(level, now);
    v.amp.gain.setTargetAtTime(0, now, v.dampTau);
    this.stopAfter(v, seconds + 0.2);
  }

  /** Oldest first — with twelve voices the note being stolen is always the one
   *  furthest into its decay, so the theft is the least audible one available. */
  private cull(): void {
    const oldest = this.live.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
    if (oldest.releasedAt === null) this.damp(oldest, 0.05);
    else this.stopAfter(oldest, 0.05);
  }

  private stopAfter(v: Voice, seconds: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const at = ctx.currentTime + Math.max(0.01, seconds);
    for (const osc of [v.carrier, v.tri, v.mod]) {
      try {
        osc.stop(at);
      } catch {
        // already scheduled to stop earlier; the earlier stop wins
      }
    }
    v.carrier.onended = (): void => {
      v.carrier.disconnect();
      v.tri.disconnect();
      v.mod.disconnect();
      v.modGain.disconnect();
      v.filter.disconnect();
      v.amp.disconnect();
      this.live = this.live.filter((x) => x !== v);
      this.balance();
    };
  }

  /** Per-voice gain management: the bus is pulled down as voices stack up, so a
   *  twelve-note chord is louder than one note but nowhere near twelve times so. */
  private balance(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const n = Math.max(1, this.live.length);
    this.voiceBus.gain.setTargetAtTime(0.9 / n ** 0.42, ctx.currentTime, 0.03);
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

  private applyKnobs(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    // TONE and DECAY are read at strike time, so only SPACE has a live target.
    this.spaceSend.gain.setTargetAtTime(this.knobs.space * 0.7, ctx.currentTime, 0.05);
  }

  private applyMode(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const t = ctx.currentTime;
    for (const key of ["NORM", "CHOR", "RADIO"] as const) {
      this.modeGain[key].gain.setTargetAtTime(key === this.mode ? 1 : 0, t, 0.04);
    }
    this.radioHiss.gain.setTargetAtTime(this.mode === "RADIO" ? 0.02 : 0, t, 0.08);
  }

  // --- What the visuals may read -------------------------------------------

  /** The analytic envelope: the same curve the amp's automation is running, so
   *  a band's brightness is the note's loudness rather than a guess at it. */
  private levelAt(v: Voice, t: number): number {
    const dt = t - v.startedAt;
    if (dt <= 0) return 0;
    const body = dt < v.attack ? dt / v.attack : Math.exp(-(dt - v.attack) / v.tau);
    if (v.releasedAt === null) return v.peak * body;
    return v.levelAtRelease * Math.exp(-(t - v.releasedAt) / v.dampTau);
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
      level: this.levelAt(v, t),
      peak: v.peak,
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
