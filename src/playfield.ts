// The CRT playfield.
//
// One rule governs this file: every mark on the canvas is caused by an audio
// event. Band brightness is a voice's analytic envelope, the horizontal trace is
// time-domain data off the master bus, rings are struck notes and boundaries
// brighten because a note is ringing next to them. Nothing here animates on a
// timer of its own, so a silent instrument draws a still screen.

import type { Engine, Source, VoiceView } from "./engine";
import { CHANNEL_COUNT } from "./engine";

const PHOS = "87, 255, 160";
const INK = "4, 9, 7";

/** Phosphor persistence. Lower alpha = longer trails; this is what makes a drag
 *  leave a trace without any trail bookkeeping.
 *
 *  Tuned by looking: at 0.26 an eight-band chord stacked enough ghost frames to
 *  bury the bands it was supposed to be showing. Persistence has to be short
 *  enough that the screen still reads as eight channels while it is busy. */
const PERSIST = 0.44;

/** Keyed strikes travel from the impact point to the band's ends in this long. */
const PULSE_S = 0.2;
const RING_S = 0.7;

type Impact = { x: number; y: number; y01: number; t: number; source: Source; strength: number };
type Flash = { edge: number; t: number };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class Playfield {
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private impacts: Impact[] = [];
  private flashes: Flash[] = [];
  private pointer: { x: number; y: number } | null = null;
  private t0 = performance.now();
  private frame = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private engine: Engine,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (ctx === null) throw new Error("this browser has no 2d canvas context");
    this.ctx = ctx;
    this.resize();
    new ResizeObserver(() => {
      this.resize();
    }).observe(canvas);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.fillStyle = `rgb(${INK})`;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  /** Screen geometry for a channel. Bands are vertical: X picks the channel,
   *  Y is the articulation axis the engine reads. */
  bandWidth(): number {
    return this.w / CHANNEL_COUNT;
  }

  channelAt(x: number): number {
    return clamp(Math.floor(x / this.bandWidth()), 0, CHANNEL_COUNT - 1);
  }

  /** 0 at the bottom of the playfield, 1 at the top — the engine's convention. */
  y01At(y: number): number {
    return clamp(1 - y / this.h, 0, 1);
  }

  impact(channel: number, y01: number, source: Source, strength: number): void {
    const bw = this.bandWidth();
    this.impacts.push({
      x: (channel + 0.5) * bw,
      y: (1 - y01) * this.h,
      y01,
      t: performance.now(),
      source,
      strength,
    });
    if (this.impacts.length > 48) this.impacts.shift();
  }

  /** A drag crossing into a new band: the shared edge brightens. */
  boundary(edge: number): void {
    this.flashes.push({ edge, t: performance.now() });
    if (this.flashes.length > 24) this.flashes.shift();
  }

  trace(x: number, y: number): void {
    this.pointer = { x, y };
  }

  clearTrace(): void {
    this.pointer = null;
  }

  /** One animation loop drives the whole device: the canvas draws, then the
   *  chrome reads the same frame's energy, so the rail can never disagree with
   *  what the screen is showing. */
  start(onFrame?: (energy: number[]) => void): void {
    const loop = (): void => {
      const energy = this.draw();
      onFrame?.(energy);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private draw(): number[] {
    const c = this.ctx;
    const now = performance.now();
    const time = (now - this.t0) / 1000;
    const { w, h } = this;
    const bw = this.bandWidth();
    this.frame += 1;

    // Persistence rather than a clear, so traces and rings decay like phosphor.
    c.globalCompositeOperation = "source-over";
    c.fillStyle = `rgba(${INK}, ${PERSIST})`;
    c.fillRect(0, 0, w, h);

    const voices = this.engine.voices();
    const energy: number[] = Array.from({ length: CHANNEL_COUNT }, () => 0);
    for (const v of voices) energy[v.channel] = Math.min(1, energy[v.channel] + v.level);

    c.globalCompositeOperation = "lighter";

    this.drawBands(energy, bw);
    this.drawKeyExcitation(voices, time, bw);
    this.drawBoundaries(energy, now, bw);
    this.drawImpacts(now);
    this.drawWaveform();
    this.drawPointer();

    c.globalCompositeOperation = "source-over";
    this.drawLabels(energy, bw);
    this.drawScanlines();

    return energy;
  }

  /** Channel wash: a band is lit in proportion to what is sounding inside it. */
  private drawBands(energy: number[], bw: number): void {
    const c = this.ctx;
    for (let i = 0; i < CHANNEL_COUNT; i += 1) {
      const x = i * bw;
      const e = energy[i];
      // The idle rail keeps all eight bands legible before the first note, so
      // the playfield reads as eight playable things when it is silent.
      c.fillStyle = `rgba(${PHOS}, ${0.012 + e * 0.06})`;
      c.fillRect(x, 0, bw, this.h);
      c.fillStyle = `rgba(${PHOS}, ${0.05 + e * 0.4})`;
      c.fillRect(x + bw / 2 - 0.5, 0, 1, this.h);
    }
  }

  /** A keyed strike has no pointer to follow, so it excites its band from the
   *  inside: two heads run out from the impact point, then the band blooms and
   *  settles into a resonance wash with a shimmering line down its middle. */
  private drawKeyExcitation(voices: VoiceView[], time: number, bw: number): void {
    const c = this.ctx;
    for (const v of voices) {
      const cx = (v.channel + 0.5) * bw;
      const cy = (1 - v.y01) * this.h;

      if (v.source === "key" && v.ageS < PULSE_S) {
        const p = v.ageS / PULSE_S;
        const reach = p * Math.max(cy, this.h - cy);
        const a = (1 - p) * 0.9;
        c.fillStyle = `rgba(${PHOS}, ${a})`;
        for (const y of [cy - reach, cy + reach]) {
          c.fillRect(cx - bw * 0.38, y - 1.5, bw * 0.76, 3);
        }
        c.fillStyle = `rgba(${PHOS}, ${a * 0.25})`;
        c.fillRect(cx - bw * 0.2, cy - reach, bw * 0.4, reach * 2);
      }

      if (v.level < 0.012) continue;

      // The shimmering line: a standing wave inside the band whose rate is the
      // note's own frequency, so a low channel shimmers slowly and a high one
      // fast. It is the voice made visible, not decoration.
      const amp = v.level * bw * 0.2;
      c.strokeStyle = `rgba(${PHOS}, ${Math.min(0.4, v.level * 0.8)})`;
      c.lineWidth = 1;
      c.beginPath();
      for (let y = 0; y <= this.h; y += 5) {
        const phase = (y / this.h) * 5 + time * v.freq * 0.045;
        const x = cx + Math.sin(phase) * amp * Math.sin((Math.PI * y) / this.h);
        if (y === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  /** Boundary brightening: the edge between two bands is lit by whichever of
   *  them is louder, and flares when a drag crosses it. */
  private drawBoundaries(energy: number[], now: number, bw: number): void {
    const c = this.ctx;
    this.flashes = this.flashes.filter((f) => now - f.t < 420);
    for (let edge = 1; edge < CHANNEL_COUNT; edge += 1) {
      const near = Math.max(energy[edge - 1], energy[edge]);
      let a = 0.035 + near * 0.45;
      for (const f of this.flashes) {
        if (f.edge === edge) a += (1 - (now - f.t) / 420) * 0.8;
      }
      c.fillStyle = `rgba(${PHOS}, ${Math.min(1, a)})`;
      c.fillRect(edge * bw - 0.5, 0, 1, this.h);
    }
  }

  /** Impact rings, with bloom wide at the bottom of the playfield and sharp at
   *  the top — the same axis the ear hears as dark-and-long against bright-and-fast. */
  private drawImpacts(now: number): void {
    const c = this.ctx;
    this.impacts = this.impacts.filter((i) => (now - i.t) / 1000 < RING_S);
    // Sized off the short edge, not the long one: a ring is a note landing in a
    // band, so it has to stay inside the band's neighbourhood rather than wash
    // the whole tube every time a drag crosses an edge.
    const maxR = Math.min(this.w, this.h) * 0.22;
    for (const im of this.impacts) {
      const p = (now - im.t) / 1000 / RING_S;
      const r = Math.sqrt(p) * maxR * (0.55 + im.strength * 0.6);
      const a = (1 - p) ** 2 * 0.5 * (0.35 + im.strength * 0.5);
      c.shadowBlur = lerp(44, 9, im.y01);
      c.shadowColor = `rgba(${PHOS}, ${a})`;
      c.strokeStyle = `rgba(${PHOS}, ${a})`;
      c.lineWidth = lerp(3.2, 1.2, im.y01) * (1 - p * 0.6);
      c.beginPath();
      c.arc(im.x, im.y, Math.max(1, r), 0, Math.PI * 2);
      c.stroke();
      c.shadowBlur = 0;
    }
  }

  /** The ringing trace: time-domain samples off the master bus, drawn across the
   *  whole screen. When the instrument is silent this is a flat line, which is
   *  the honest reading. */
  private drawWaveform(): void {
    const c = this.ctx;
    const data = this.engine.waveform();
    const mid = this.h * 0.5;
    const step = Math.max(1, Math.floor(data.length / this.w));
    c.strokeStyle = `rgba(${PHOS}, 0.55)`;
    c.lineWidth = 1.3;
    c.beginPath();
    for (let px = 0; px < this.w; px += 1) {
      const s = data[Math.min(data.length - 1, px * step)] ?? 0;
      // A quarter of the height, not near-half: the master trace is one voice
      // in the picture, not the picture.
      const y = mid - s * this.h * 0.26;
      if (px === 0) c.moveTo(px, y);
      else c.lineTo(px, y);
    }
    c.stroke();
  }

  private drawPointer(): void {
    if (this.pointer === null) return;
    const c = this.ctx;
    const { x, y } = this.pointer;
    c.fillStyle = `rgba(${PHOS}, 0.6)`;
    c.fillRect(x - 5, y - 0.5, 10, 1);
    c.fillRect(x - 0.5, y - 5, 1, 10);
  }

  private drawLabels(energy: number[], bw: number): void {
    const c = this.ctx;
    c.font = "500 10px ui-monospace, monospace";
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    for (let i = 0; i < CHANNEL_COUNT; i += 1) {
      c.fillStyle = `rgba(${PHOS}, ${0.3 + energy[i] * 0.7})`;
      c.fillText(String(i + 1).padStart(2, "0"), (i + 0.5) * bw, this.h - 8);
    }
  }

  private drawScanlines(): void {
    const c = this.ctx;
    c.fillStyle = `rgba(${INK}, 0.34)`;
    for (let y = 0; y < this.h; y += 3) c.fillRect(0, y, this.w, 1);
    // A slow roll bar, the one thing on screen that is a property of the tube
    // rather than of a note.
    const bar = ((this.frame * 0.6) % (this.h + 120)) - 120;
    c.fillStyle = `rgba(${PHOS}, 0.012)`;
    c.fillRect(0, bar, this.w, 120);
  }
}
