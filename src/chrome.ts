// Device chrome: the knobs, the rocker, the deck of band markers and the
// telemetry rail.
//
// The rail is not decoration. Every field on it reads live state off the engine
// — mode, knob positions, the last band struck, the voice count, and a needle
// riding the bus RMS. If the instrument is silent the needle sits at zero,
// because that is what the bus is doing.

import type { Engine, EngineEvent, ScanMode } from "./engine";
import { CHANNEL_COUNT, MAX_VOICES, channelFreq } from "./engine";

export type View = "PLAY" | "DECK" | "DATA" | "TUNE";

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

/** PLAY / DECK / DATA / TUNE.
 *
 *  These are views onto one machine, not pages. Nothing here touches the
 *  engine: switching cannot stop audio, drop voices or clear the pedal,
 *  because the only thing it changes is which overlay is drawn over a
 *  playfield that never goes away. */
export class Views {
  private view: View = "PLAY";

  constructor(
    private root: HTMLElement,
    private tabs: HTMLButtonElement[],
    private panes: HTMLElement[],
    private onChange: (v: View) => void,
  ) {
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        this.set(tab.dataset.view as View);
      });
      tab.addEventListener("keydown", (e: KeyboardEvent) => {
        const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (dir === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const next = tabs[(tabs.indexOf(tab) + dir + tabs.length) % tabs.length];
        next.focus();
        this.set(next.dataset.view as View);
      });
    }
    this.render();
  }

  set(view: View): void {
    if (view === this.view) return;
    this.view = view;
    this.render();
    this.onChange(view);
  }

  get(): View {
    return this.view;
  }

  private render(): void {
    this.root.dataset.view = this.view;
    for (const tab of this.tabs) {
      const on = tab.dataset.view === this.view;
      // aria-CHECKED, not aria-selected: these are role="radio", and the state
      // the stylesheet reads has to be the state the role actually defines.
      // Written the other way the view changed and the lit tab did not.
      tab.setAttribute("aria-checked", String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const pane of this.panes) {
      const on = pane.dataset.pane === this.view;
      pane.dataset.open = String(on);
      // `inert` keeps a closed pane out of the tab order and the a11y tree
      // while leaving it in the DOM for the fade.
      pane.toggleAttribute("inert", !on);
    }
  }
}

/** REGISTER and ROOT. A segmented readout rather than a control panel: TUNE is
 *  calibration, and there is deliberately nothing here that can make the
 *  instrument sound bad. */
export class Segmented<T extends string> {
  private value: T;

  constructor(
    private root: HTMLElement,
    initial: T,
    private onChange: (v: T) => void,
  ) {
    this.value = initial;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-opt]")];
    for (const btn of buttons) {
      btn.addEventListener("click", () => {
        this.set(btn.dataset.opt as T);
      });
      btn.addEventListener("keydown", (e: KeyboardEvent) => {
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (dir === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const next = buttons[(buttons.indexOf(btn) + dir + buttons.length) % buttons.length];
        next.focus();
        this.set(next.dataset.opt as T);
      });
    }
    this.render();
  }

  set(v: T): void {
    if (v === this.value) return;
    this.value = v;
    this.render();
    this.onChange(v);
  }

  private render(): void {
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>("[data-opt]")) {
      const on = btn.dataset.opt === this.value;
      btn.setAttribute("aria-checked", String(on));
      btn.tabIndex = on ? 0 : -1;
    }
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
  peak: HTMLElement;
  pedalState: HTMLElement;
  freq: HTMLElement;
  register: HTMLElement;
  cal: HTMLElement;
  log: HTMLElement;
  deckMap: HTMLElement;
};

/** Meter ballistics. Fast to rise and slow to fall, like a moving-coil meter
 *  with a real spring behind it — a symmetric filter reads as a graph. */
const RISE = 0.34;
const FALL = 0.06;

export class Telemetry {
  private needleValue = 0;
  private shown = new Map<HTMLElement, string>();
  private logLen = -1;

  constructor(
    private fields: Fields,
    private engine: Engine,
  ) {}

  /** Write a value and flash the field if it actually changed. The flash is the
   *  only animation on the rail, and it is driven by a value moving — nothing
   *  here pulses on a timer. */
  private put(el: HTMLElement, text: string): void {
    if (this.shown.get(el) === text) return;
    this.shown.set(el, text);
    el.textContent = text;
    el.dataset.flash = "on";
    // Restart the animation rather than waiting for it: values can change
    // faster than the flash lasts.
    void el.offsetWidth;
    requestAnimationFrame(() => {
      el.dataset.flash = "off";
    });
  }

  update(): void {
    const f = this.fields;
    const e = this.engine;

    this.put(f.mode, e.scanMode);
    this.put(f.tone, pct(e.knob("tone")));
    this.put(f.decay, pct(e.knob("decay")));
    this.put(f.space, pct(e.knob("space")));
    this.put(f.band, e.band === null ? "--" : bandName(e.band));

    const vox = e.activeCount;
    this.put(f.vox, `${String(vox).padStart(2, "0")}/${MAX_VOICES}`);
    f.voxBar.style.setProperty("--fill", (vox / MAX_VOICES).toFixed(3));

    const level = e.level01();
    this.needleValue += (level - this.needleValue) * (level > this.needleValue ? RISE : FALL);
    f.needle.style.setProperty("--swing", `${(this.needleValue - 0.5) * 96}deg`);
    const locked = this.needleValue > 0.08;
    f.lock.dataset.locked = String(locked);
    this.put(f.lock, locked ? "LOCK" : "SCAN");

    this.put(f.peak, this.needleValue.toFixed(2));
    this.put(f.pedalState, e.pedalDown ? "HOLD" : "OPEN");
    this.put(f.freq, e.lastFreq === 0 ? "------" : e.lastFreq.toFixed(2));

    const { register, root } = e.tuning;
    this.put(f.register, register);
    this.put(f.cal, `${root} PENTA`);

    this.put(f.uptime, hhmmss(e.uptimeS));
    f.power.dataset.on = String(e.running);
    f.pedal.dataset.on = String(e.pedalDown);

    this.renderLog(e.events());
    this.renderDeckMap();
  }

  /** Rebuild only when the log actually grew. Repainting ten rows every frame
   *  would restart every entry's fade sixty times a second. */
  private renderLog(events: EngineEvent[]): void {
    const stamp = events.length === 0 ? -1 : events.length * 1e6 + Math.round(events[events.length - 1].at * 100);
    if (stamp === this.logLen) return;
    this.logLen = stamp;
    this.fields.log.replaceChildren(
      ...events.map((ev, i) => {
        const row = document.createElement("li");
        row.className = "log__row";
        // Oldest fade out at the top; the newest is full strength.
        row.style.setProperty("--age", ((events.length - 1 - i) / Math.max(1, events.length - 1)).toFixed(3));
        const t = document.createElement("span");
        t.className = "log__time";
        t.textContent = `T+${hhmmss(ev.at)}`;
        const what = document.createElement("b");
        what.className = "log__what";
        what.textContent = ev.band === null ? `${ev.kind} ${ev.note}`.trim() : `${bandName(ev.band)} ${ev.kind}`;
        row.append(t, what);
        return row;
      }),
    );
  }

  /** The DECK key map carries live pitches, so the schematic retunes with the
   *  instrument instead of describing a machine that no longer exists. */
  private renderDeckMap(): void {
    const { register, root } = this.engine.tuning;
    const key = `${register}${root}`;
    if (this.shown.get(this.fields.deckMap) === key) return;
    this.shown.set(this.fields.deckMap, key);
    this.fields.deckMap.replaceChildren(
      ...Array.from({ length: CHANNEL_COUNT }, (_, i) => {
        const row = document.createElement("li");
        row.className = "map__row";
        const b = document.createElement("span");
        b.className = "map__band";
        b.textContent = bandName(i);
        const k = document.createElement("b");
        k.className = "map__key";
        k.textContent = KEYS[i].toUpperCase();
        const hz = document.createElement("i");
        hz.className = "map__hz";
        hz.textContent = `${channelFreq(i, register, root).toFixed(1)} HZ`;
        row.append(b, k, hz);
        return row;
      }),
    );
  }
}

function bandName(channel: number): string {
  return `B${String(channel + 1).padStart(2, "0")}`;
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
