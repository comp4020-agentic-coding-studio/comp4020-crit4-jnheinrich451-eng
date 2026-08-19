// Wiring: input in, engine, screen out.
//
// Both input modes are peers. A pointer and a key reach the same `strike`, the
// same knobs and the same SCAN MODE, and differ only where CLAUDE.md says they
// should — a key damps faster than a lifted finger, and a keyed note has no
// pointer to take its articulation from, so it lands at a fixed point up the
// axis and excites its band from the inside instead.

import { Engine } from "./src/engine";
import type { Knob, Register, Root, ScanMode } from "./src/engine";
import { Playfield } from "./src/playfield";
import type { View } from "./src/chrome";
import { Deck, KEYS, KnobControl, Rocker, Segmented, Telemetry, Views } from "./src/chrome";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`the page is missing #${id}`);
  return node as T;
};

const engine = new Engine();
const canvas = el<HTMLCanvasElement>("playfield");
const playfield = new Playfield(canvas, engine);
const deck = new Deck(el("deck"));
const invite = el("invite");

const telemetry = new Telemetry(
  {
    mode: el("tm-mode"),
    tone: el("tm-tone"),
    decay: el("tm-decay"),
    space: el("tm-space"),
    band: el("tm-band"),
    vox: el("tm-vox"),
    voxBar: el("tm-voxbar"),
    needle: el("tm-needle"),
    lock: el("tm-lock"),
    uptime: el("uptime"),
    power: el("tag-power"),
    pedal: el("tag-pedal"),
    peak: el("tm-peak"),
    pedalState: el("tm-pedalstate"),
    freq: el("tm-freq"),
    register: el("tm-register"),
    cal: el("tm-cal"),
    log: el("tm-log"),
    deckMap: el("deck-map"),
  },
  engine,
);

// --- Views ------------------------------------------------------------------

// PLAY / DECK / DATA / TUNE are ways of looking at one machine. Switching
// touches no audio state at all — no engine call in this handler, by design.
new Views(
  el("rig"),
  [...el("views").querySelectorAll<HTMLButtonElement>("[data-view]")],
  [el("pane-deck"), el("pane-data"), el("pane-tune")],
  (view: View) => {
    // Keep the field reachable: leaving a pane should not strand focus on a
    // control that has just gone inert.
    if (view === "PLAY") canvas.focus({ preventScroll: true });
  },
);

new Segmented<Register>(el("cal-register"), engine.tuning.register, (r) => {
  void engine.start();
  engine.setRegister(r);
});

new Segmented<Root>(el("cal-root"), engine.tuning.root, (r) => {
  void engine.start();
  engine.setRoot(r);
});

// --- Controls ---------------------------------------------------------------

const wireKnob = (name: Knob, initial: number): void => {
  new KnobControl(el(`knob-${name}`), el(`knob-${name}-value`), initial, (v) => {
    void engine.start();
    engine.setKnob(name, v);
  });
};
wireKnob("tone", engine.knob("tone"));
wireKnob("decay", engine.knob("decay"));
wireKnob("space", engine.knob("space"));

new Rocker(el("rocker"), (mode: ScanMode) => {
  void engine.start();
  engine.setMode(mode);
});

// --- Striking ---------------------------------------------------------------

/** Every path to a first sound goes through here. `engine.start()` builds the
 *  graph synchronously before it awaits the resume, so the note that opened the
 *  page is audible rather than swallowed by the gesture requirement. */
function strike(channel: number, y01: number, source: "pointer" | "key"): number {
  void engine.start();
  invite.dataset.open = "false";
  playfield.impact(channel, y01, source, 0.35 + y01 * 0.65);
  return engine.strike(channel, y01, source);
}

// --- Pointer and touch ------------------------------------------------------

type Held = { voice: number; channel: number };
const pointers = new Map<number, Held>();

const at = (e: PointerEvent): { channel: number; y01: number; x: number; y: number } => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  return { channel: playfield.channelAt(x), y01: playfield.y01At(y), x, y };
};

canvas.addEventListener("pointerdown", (e: PointerEvent) => {
  e.preventDefault();
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const p = at(e);
  playfield.trace(p.x, p.y);
  pointers.set(e.pointerId, { voice: strike(p.channel, p.y01, "pointer"), channel: p.channel });
});

canvas.addEventListener("pointermove", (e: PointerEvent) => {
  const held = pointers.get(e.pointerId);
  const p = at(e);
  playfield.trace(p.x, p.y);
  if (held === undefined) return;

  if (p.channel === held.channel) {
    // Same band: position is still timbre, continuously.
    engine.bend(held.voice, p.y01);
    return;
  }
  // Crossing a boundary strums: the old note is let go and the new band is
  // struck, and every edge passed over on the way brightens.
  const lo = Math.min(held.channel, p.channel);
  const hi = Math.max(held.channel, p.channel);
  for (let edge = lo + 1; edge <= hi; edge += 1) playfield.boundary(edge);
  engine.release(held.voice);
  pointers.set(e.pointerId, { voice: strike(p.channel, p.y01, "pointer"), channel: p.channel });
});

const lift = (e: PointerEvent): void => {
  const held = pointers.get(e.pointerId);
  if (held !== undefined) {
    engine.release(held.voice);
    pointers.delete(e.pointerId);
  }
  if (pointers.size === 0) playfield.clearTrace();
};
canvas.addEventListener("pointerup", lift);
canvas.addEventListener("pointercancel", lift);
canvas.addEventListener("pointerleave", lift);

// --- Keyboard ---------------------------------------------------------------

const keyHeld = new Map<string, number>();

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === " " || e.code === "Space") {
    // The pedal, always — including while a button holds focus. The spec asks
    // for SPACE to work globally, and a sustain pedal that stops working
    // because you last touched a dial is not a pedal. Buttons keep Enter.
    e.preventDefault();
    engine.setPedal(true);
    void engine.start();
    return;
  }

  const channel = KEYS.indexOf(e.key.toLowerCase());
  if (channel === -1 || keyHeld.has(e.key.toLowerCase())) return;
  e.preventDefault();
  deck.revealKeys();
  keyHeld.set(e.key.toLowerCase(), strike(channel, Engine.keyY(), "key"));
});

window.addEventListener("keyup", (e: KeyboardEvent) => {
  if (e.key === " " || e.code === "Space") {
    engine.setPedal(false);
    return;
  }
  const key = e.key.toLowerCase();
  const voice = keyHeld.get(key);
  if (voice === undefined) return;
  keyHeld.delete(key);
  engine.release(voice);
});

// Focus can leave mid-note — alt-tab, a click into the address bar — and the
// keyup never arrives. Let go of everything rather than leave a note stuck on.
window.addEventListener("blur", () => {
  for (const voice of keyHeld.values()) engine.release(voice);
  keyHeld.clear();
  engine.setPedal(false);
});

// --- Frame ------------------------------------------------------------------

playfield.start((energy) => {
  deck.update(energy);
  telemetry.update();
});
