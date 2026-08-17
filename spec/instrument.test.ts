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
    const group = doc.querySelector('[role="radiogroup"]');
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
