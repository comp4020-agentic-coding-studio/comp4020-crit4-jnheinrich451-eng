// C4's published spec, as far as a test can carry it, asserted against the
// BUILT site — what actually ships, not what the source intends.
//
// The lines a machine can hold:
//   - sound is synthesised live by player action, not played back
//   - the player's choices shape what they hear, and two players sound different
//   - a stranger can play it uninstructed; the opening screen invites the first sound
//   - playable via mouse, keyboard, or touch
//   - no way to play it wrong: no score, no fail state
//
// The lines only the crit can judge — whether it is musical, whether a stranger
// actually reaches for it — are deliberately not here.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const DIST = resolve("dist");
const doc = new JSDOM(readFileSync(join(DIST, "index.html"), "utf8")).window.document;

/** Every byte of script the built page ships, concatenated. */
function bundledScript(): string {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return walk(path);
      return e.name.endsWith(".js") ? [readFileSync(path, "utf8")] : [];
    });
  return walk(DIST).join("\n");
}

const script = bundledScript();
const text = doc.body.textContent ?? "";

describe("sound is synthesised, not played back", () => {
  it("builds a Web Audio graph", () => {
    expect(script).toMatch(/AudioContext/);
    expect(script).toMatch(/createOscillator/);
    expect(script).toMatch(/createBiquadFilter/);
  });

  it("ships no recorded material to play back", () => {
    expect(doc.querySelector("audio")).toBeNull();
    expect(doc.querySelector("video")).toBeNull();
    const media = readdirSync(DIST, { recursive: true, withFileTypes: true }).filter((e) =>
      /\.(mp3|ogg|wav|m4a|flac|aac|webm)$/i.test(e.name),
    );
    expect(media.map((e) => e.name)).toEqual([]);
  });

  it("keeps a bus limiter, so no combination of notes can clip", () => {
    expect(script).toMatch(/createDynamicsCompressor/);
  });
});

describe("the player's choices shape what they hear", () => {
  it("offers eight channels to strike", () => {
    expect(doc.querySelectorAll(".deck__cell")).toHaveLength(8);
    for (let i = 1; i <= 8; i += 1) {
      expect(text).toContain(String(i).padStart(2, "0"));
    }
  });

  it("offers three continuous shaping controls, each a real slider", () => {
    const dials = [...doc.querySelectorAll('[id^="knob-"]')].filter((n) => n.id.endsWith("-value") === false);
    expect(dials).toHaveLength(3);
    for (const name of ["TONE", "DECAY", "SPACE"]) expect(text).toContain(name);
    // Set by script at startup, so assert the hooks the script needs exist.
    for (const id of ["knob-tone", "knob-decay", "knob-space"]) {
      expect(doc.getElementById(id), `#${id} is missing`).toBeTruthy();
      expect(doc.getElementById(`${id}-value`), `#${id}-value is missing`).toBeTruthy();
    }
  });

  it("offers a three-way scan mode", () => {
    // Scoped to #rocker: the view switcher is a radiogroup too now, and a bare
    // [role="radiogroup"] quietly matched whichever came first in the document.
    const group = doc.getElementById("rocker");
    expect(group).toBeTruthy();
    const modes = [...(group?.querySelectorAll('[role="radio"]') ?? [])].map(
      (n) => (n as HTMLElement).dataset.mode,
    );
    expect(modes).toEqual(["NORM", "CHOR", "RADIO"]);
  });

  it("makes vertical position an expressive axis, not just a hit target", () => {
    // Two players who strike the same band at different heights must not get
    // the same note. The mapping lives in articulate(); this is the page's
    // promise that the axis exists at all.
    expect(script).toMatch(/y01|articulat/i);
  });
});

describe("a stranger can play it uninstructed", () => {
  it("opens with an invitation that is visible before any interaction", () => {
    const invite = doc.getElementById("invite");
    expect(invite).toBeTruthy();
    expect(invite?.getAttribute("data-open")).toBe("true");
  });

  it("names both ways in, in the invitation itself", () => {
    const invite = doc.getElementById("invite")?.textContent ?? "";
    expect(invite.toLowerCase()).toMatch(/touch|tap|drag|press/);
    expect(invite.replace(/\s+/g, "")).toContain("ASDFGHJK");
  });

  it("labels the playfield for anyone who cannot see it", () => {
    const label = doc.getElementById("playfield")?.getAttribute("aria-label") ?? "";
    expect(label.length).toBeGreaterThan(20);
  });
});

describe("playable via mouse, keyboard, or touch", () => {
  it("drives play from pointer events, which cover mouse, pen and touch alike", () => {
    expect(script).toMatch(/pointerdown/);
    expect(script).toMatch(/pointermove/);
    expect(script).toMatch(/pointerup/);
  });

  it("does not let a drag scroll the page out from under the player", () => {
    const css = readdirSync(DIST, { recursive: true, withFileTypes: true })
      .filter((e) => e.name.endsWith(".css"))
      .map((e) => readFileSync(join(e.parentPath, e.name), "utf8"))
      .join("\n");
    expect(css).toMatch(/touch-action:\s*none/);
  });

  it("maps eight keys under one hand, and says which on the deck", () => {
    // The minifier is free to pick its own quote character, so compare with the
    // quoting and whitespace taken out rather than pinning one spelling.
    const bare = script.replace(/["'`\s]/g, "");
    expect(bare).toContain("[a,s,d,f,g,h,j,k]");
    const deck = doc.getElementById("deck")?.textContent?.replace(/[^A-Z]/g, "") ?? "";
    expect(deck).toBe("ASDFGHJK");
  });

  it("reaches the playfield by keyboard", () => {
    expect(doc.getElementById("playfield")?.getAttribute("tabindex")).toBe("0");
  });
});

describe("no way to play it wrong", () => {
  it("ships no scoring or fail-state vocabulary", () => {
    const banned = /\b(score|high ?score|game over|you (lose|win)|failed|fail state|lives|level \d)\b/i;
    expect(text).not.toMatch(banned);
  });

  it("has no control that can silence the instrument", () => {
    // Every dial's floor is a usable setting, not an off switch: the spec's
    // "no fail state" has to hold for the panel too.
    expect(doc.querySelector('[data-mode="OFF"]')).toBeNull();
    expect(text).not.toMatch(/\bmute\b/i);
  });
});

describe("the device reads real state", () => {
  it("carries the telemetry fields the rail claims", () => {
    for (const id of ["tm-mode", "tm-tone", "tm-decay", "tm-space", "tm-band", "tm-vox", "tm-needle", "tm-lock", "uptime"]) {
      expect(doc.getElementById(id), `#${id} is missing`).toBeTruthy();
    }
  });

  it("drives the needle off measured bus level rather than a timer", () => {
    expect(script).toMatch(/getFloatTimeDomainData/);
  });
});

describe("PLAY / DECK / DATA / TUNE are views on one machine", () => {
  it("offers all four, with PLAY selected on load", () => {
    const views = [...(doc.getElementById("views")?.querySelectorAll('[role="radio"]') ?? [])];
    expect(views.map((n) => (n as HTMLElement).dataset.view)).toEqual(["PLAY", "DECK", "DATA", "TUNE"]);
    const checked = views.filter((n) => n.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect((checked[0] as HTMLElement).dataset.view).toBe("PLAY");
  });

  it("cold-opens straight into PLAY with no gate in front of it", () => {
    // No START button, no modal, no mandatory choice: the first gesture has to
    // be a note. The invite is a hint over a live field, not a door.
    expect(doc.getElementById("rig")?.dataset.view).toBe("PLAY");
    expect(doc.getElementById("invite")?.getAttribute("data-open")).toBe("true");
    expect(text).not.toMatch(/\b(start|begin|enter|continue|welcome|tutorial)\b/i);
  });

  it("keeps the playfield present under every view", () => {
    // The panes live inside the glass, so no view can replace the instrument
    // with a page. If one ever moved out, this goes red.
    const glass = doc.querySelector(".stage__glass");
    expect(glass?.querySelector("#playfield")).toBeTruthy();
    for (const id of ["pane-deck", "pane-data", "pane-tune"]) {
      expect(glass?.querySelector(`#${id}`), `#${id} must sit over the field`).toBeTruthy();
    }
  });

  it("starts with every pane closed and inert", () => {
    for (const id of ["pane-deck", "pane-data", "pane-tune"]) {
      const pane = doc.getElementById(id);
      expect(pane?.getAttribute("data-open"), id).toBe("false");
      expect(pane?.hasAttribute("inert"), `${id} must be inert while closed`).toBe(true);
    }
  });

  it("lets the field stay playable with a pane open", () => {
    const css = readdirSync(DIST, { recursive: true, withFileTypes: true })
      .filter((e) => e.name.endsWith(".css"))
      .map((e) => readFileSync(join(e.parentPath, e.name), "utf8"))
      .join("\n");
    // The pane passes pointer events through; only the calibration bank takes
    // them back. Without this a pane would silently disable half the field.
    expect(css).toMatch(/\.pane\{[^}]*pointer-events:none/);
    expect(css).toMatch(/\.cal__bank\{[^}]*pointer-events:auto/);
  });
});

describe("DECK, DATA and TUNE say something true", () => {
  it("gives DECK a schematic rather than prose", () => {
    const deck = doc.getElementById("pane-deck")?.textContent ?? "";
    for (const label of ["BAND ARRAY", "VOICE ENGINE", "POLYPHONY", "INPUT A", "INPUT B"]) {
      expect(deck).toContain(label);
    }
    // A signal chain, in order.
    const flow = [...(doc.querySelectorAll("#pane-deck .flow__step") ?? [])].map((n) => n.textContent);
    expect(flow).toEqual(["INPUT", "BAND SELECT", "TINE / BODY", "TONE", "DECAY", "SPACE", "MASTER"]);
    // No paragraphs explaining how to play.
    expect(doc.querySelectorAll("#pane-deck p")).toHaveLength(0);
  });

  it("gives DATA live fields and a bounded log", () => {
    for (const id of ["tm-peak", "tm-pedalstate", "tm-freq", "tm-register", "tm-cal", "tm-log"]) {
      expect(doc.getElementById(id), `#${id} is missing`).toBeTruthy();
    }
    // The log is filled from engine events at runtime, so it ships empty — a
    // pre-baked row would be exactly the fake telemetry this rules out.
    expect(doc.getElementById("tm-log")?.children).toHaveLength(0);
  });

  it("keeps TUNE to calibration, with the scale locked", () => {
    const tune = doc.getElementById("pane-tune")?.textContent ?? "";
    expect(tune).toContain("REGISTER");
    expect(tune).toContain("LOCKED");
    const regs = [...(doc.getElementById("cal-register")?.querySelectorAll("[data-opt]") ?? [])];
    expect(regs.map((n) => (n as HTMLElement).dataset.opt)).toEqual(["LOW", "MID", "HIGH"]);
    // None of the synthesis internals are exposed as controls. Whole words
    // only: a substring check fails on the panel's own heading, because
    // CALIB-RATIO-N contains "RATIO".
    for (const banned of ["RATIO", "RESONANCE", "LFO", "WAVEFORM", "ENVELOPE", "ATTACK"]) {
      expect(tune, `TUNE must not expose ${banned}`).not.toMatch(new RegExp(`\b${banned}\b`, "i"));
    }
  });
});

describe("the bottom copy reads like a machine", () => {
  it("states the three inputs and explains nothing", () => {
    const legend = doc.querySelector(".legend")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    expect(legend).toContain("STRIKE");
    expect(legend).toContain("SUSTAIN");
    expect(legend).toContain("DRAG");
    // The old sentence was developer documentation; nothing here should read
    // like an explanation of why the controls are safe.
    expect(legend).not.toMatch(/nothing here|cannot|can be set|it playing/i);
    expect(legend.length).toBeLessThan(90);
  });
});

describe("the view switcher and the rocker speak the same dialect", () => {
  it("uses aria-checked throughout, matching role=radio", () => {
    // A stylesheet keyed on aria-checked plus a script writing aria-selected
    // leaves the active tab lit on whichever view happened to load first, and
    // both halves look correct in isolation.
    const script = bundledScript();
    expect(script).not.toMatch(/aria-selected/);
    for (const group of ["views", "rocker", "cal-register", "cal-root"]) {
      const radios = [...(doc.getElementById(group)?.querySelectorAll('[role="radio"]') ?? [])];
      expect(radios.length, `#${group} has no radios`).toBeGreaterThan(1);
      for (const r of radios) {
        expect(r.hasAttribute("aria-checked"), `#${group} radio needs aria-checked`).toBe(true);
      }
      expect(radios.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
    }
  });
});
