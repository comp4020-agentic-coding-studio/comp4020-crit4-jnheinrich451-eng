// Device chrome: the knobs, the rocker, the deck of band markers and the
// telemetry rail.
//
// The rail is not decoration. Every field on it reads live state off the engine
// — mode, knob positions, the last band struck, the voice count, and a needle
// riding the bus RMS. If the instrument is silent the needle sits at zero,
// because that is what the bus is doing.

import type { Engine, ScanMode } from "./engine";
import { CHANNEL_COUNT, MAX_VOICES } from "./engine";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The keys that play channels 01–08, left to right under the playing hand. */
export const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];

/** A drag-or-scroll knob. Also a real slider for anyone arriving by keyboard:
 *  arrows nudge, Home/End go to the ends, and the value is announced. */
export class KnobControl {
  private value: number;

  constructor(
    private root: HTMLElement,
    private readout: HTMLElement,
    initial: number,
    private onChange: (v: number) => void,
  ) {
    this.value = clamp(initial, 0, 1);

    root.setAttribute("role", "slider");
    root.setAttribute("aria-valuemin", "0");
    root.setAttribute("aria-valuemax", "100");
    root.tabIndex = 0;

    let dragging = false;
    let lastY = 0;

    root.addEventListener("pointerdown", (e: PointerEvent) => {
      dragging = true;
      lastY = e.clientY;
      root.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    root.addEventListener("pointermove", (e: PointerEvent) => {
      if (!dragging) return;
      // Up is more. 180 px of travel covers the full sweep, which is fine on a
      // trackpad and still reachable inside a phone-sized panel.
      this.set(this.value + (lastY - e.clientY) / 180);
      lastY = e.clientY;
    });
    const stop = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    };
    root.addEventListener("pointerup", stop);
    root.addEventListener("pointercancel", stop);

    root.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        e.preventDefault();
        this.set(this.value - Math.sign(e.deltaY) * 0.04);
      },
      { passive: false },
    );

    root.addEventListener("keydown", (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.01 : 0.05;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") this.set(this.value + step);
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") this.set(this.value - step);
      else if (e.key === "Home") this.set(0);
      else if (e.key === "End") this.set(1);
      else return;
      // Only swallow the keys the knob actually used, so A–K still play while a
      // knob holds focus.
      e.preventDefault();
      e.stopPropagation();
    });

    this.render();
  }

  set(v: number): void {
    const next = clamp(v, 0, 1);
    if (next === this.value) return;
    this.value = next;
    this.render();
    this.onChange(next);
  }

  get(): number {
    return this.value;
  }

  private render(): void {
    const pct = Math.round(this.value * 100);
    // −135° to +135°: the usual 270° sweep of a panel pot.
    this.root.style.setProperty("--turn", `${(this.value - 0.5) * 270}deg`);
    this.root.setAttribute("aria-valuenow", String(pct));
    this.root.setAttribute("aria-valuetext", `${pct} percent`);
    this.readout.textContent = String(pct).padStart(3, "0");
  }
}

/** The three-way SCAN MODE rocker. A radio group, so it behaves for a keyboard
 *  the way the physical part behaves for a thumb. */
export class Rocker {
  private mode: ScanMode = "NORM";

  constructor(
    private root: HTMLElement,
    private onChange: (m: ScanMode) => void,
  ) {
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-mode]")];
    for (const btn of buttons) {
      btn.addEventListener("click", () => {
        this.set(btn.dataset.mode as ScanMode);
      });
      btn.addEventListener("keydown", (e: KeyboardEvent) => {
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (dir === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const i = buttons.indexOf(btn);
        const next = buttons[(i + dir + buttons.length) % buttons.length];
        next.focus();
        this.set(next.dataset.mode as ScanMode);
      });
    }
    this.render();
  }

  set(mode: ScanMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.render();
    this.onChange(mode);
  }

  private render(): void {
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
      const on = btn.dataset.mode === this.mode;
      btn.setAttribute("aria-checked", String(on));
      btn.tabIndex = on ? 0 : -1;
    }
    this.root.dataset.mode = this.mode;
  }
}

/** The deck: eight lit markers under the screen. Each carries its channel number
 *  and the key that strikes it — faint until the player uses the keyboard, at
 *  which point the letters are worth reading and brighten to say so. */
export class Deck {
  private markers: HTMLElement[];
  private keysUsed = false;

  constructor(private root: HTMLElement) {
    this.markers = [...root.querySelectorAll<HTMLElement>(".deck__cell")];
  }

  revealKeys(): void {
    if (this.keysUsed) return;
    this.keysUsed = true;
    this.root.dataset.keys = "used";
  }

  update(energy: number[]): void {
    for (let i = 0; i < this.markers.length; i += 1) {
      this.markers[i].style.setProperty("--lit", (energy[i] ?? 0).toFixed(3));
    }
  }
}

type Fields = {
  mode: HTMLElement;
  tone: HTMLElement;
  decay: HTMLElement;
  space: HTMLElement;
  band: HTMLElement;
  vox: HTMLElement;
  voxBar: HTMLElement;
  needle: HTMLElement;
  lock: HTMLElement;
  uptime: HTMLElement;
  power: HTMLElement;
  pedal: HTMLElement;
};

export class Telemetry {
  private lastBand = "--";
  /** Smoothed so the needle swings like a moving-coil meter rather than
   *  snapping frame to frame. The value it chases is still the real RMS. */
  private needleValue = 0;

  constructor(
    private fields: Fields,
    private engine: Engine,
  ) {}

  noteBand(channel: number): void {
    this.lastBand = String(channel + 1).padStart(2, "0");
  }

  update(): void {
    const f = this.fields;
    const e = this.engine;

    f.mode.textContent = e.scanMode;
    f.tone.textContent = pct(e.knob("tone"));
    f.decay.textContent = pct(e.knob("decay"));
    f.space.textContent = pct(e.knob("space"));
    f.band.textContent = this.lastBand;

    const vox = e.activeCount;
    f.vox.textContent = `${String(vox).padStart(2, "0")}/${MAX_VOICES}`;
    f.voxBar.style.setProperty("--fill", (vox / MAX_VOICES).toFixed(3));

    // Fitted to measured bus RMS, not guessed: the Rhodes voice peaks at 0.155
    // where the old one peaked near 0.95, so the previous law parked a single
    // note near mid-scale and never got past 0.69 on a full chord. Measured
    // 0.099 RMS for one note and 0.223 for eight; this law puts those at 43%
    // and 80%, leaving travel at both ends.
    const rms = e.rms();
    this.needleValue += (Math.min(1, (rms / 0.3) ** 0.75) - this.needleValue) * 0.18;
    f.needle.style.setProperty("--swing", `${(this.needleValue - 0.5) * 96}deg`);
    // "Lock" is an honest threshold on the bus, not a prop: the needle has to be
    // reading something for the device to claim it.
    f.lock.dataset.locked = String(this.needleValue > 0.08);
    f.lock.textContent = this.needleValue > 0.08 ? "LOCK" : "SCAN";

    f.uptime.textContent = hhmmss(e.uptimeS);
    f.power.dataset.on = String(e.running);
    f.pedal.dataset.on = String(e.pedalDown);
  }
}

function pct(v: number): string {
  return String(Math.round(v * 100)).padStart(3, "0");
}

function hhmmss(seconds: number): string {
  const s = Math.floor(seconds);
  const parts = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60];
  return parts.map((n) => String(n).padStart(2, "0")).join(":");
}

export function emptyEnergy(): number[] {
  return Array.from({ length: CHANNEL_COUNT }, () => 0);
}
