// The voice model, tested where it can be: the pure functions the engine hands
// its parameters to. No AudioContext exists in a test runner, so anything
// asserted here has to be arithmetic — which is exactly where CLAUDE.md's
// numbers live, and exactly where a "simplification" would quietly land.

import { describe, expect, it } from "vitest";
import { CHANNEL_COUNT, MAX_VOICES, articulate, channelFreq, dampTime } from "../src/engine";

const TONE_MID = 0.55;
const DECAY_MID = 0.5;

describe("tuning: no two channels can sound wrong together", () => {
  it("has eight channels, ascending", () => {
    expect(CHANNEL_COUNT).toBe(8);
    const freqs = Array.from({ length: CHANNEL_COUNT }, (_, i) => channelFreq(i));
    for (let i = 1; i < freqs.length; i += 1) expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
  });

  it("contains no semitone and no tritone", () => {
    // A pentatonic is what makes "no way to play it wrong" true of the notes and
    // not just of the interface: every pair of channels is consonant, so a
    // twelve-note fistful of the keyboard still lands as a chord.
    const semis = Array.from({ length: CHANNEL_COUNT }, (_, i) =>
      Math.round(12 * Math.log2(channelFreq(i) / channelFreq(0))),
    );
    for (let a = 0; a < semis.length; a += 1) {
      for (let b = a + 1; b < semis.length; b += 1) {
        const gap = (semis[b] - semis[a]) % 12;
        expect(gap, `channels ${a + 1} and ${b + 1} are ${gap} semitones apart`).not.toBe(1);
        expect(gap, `channels ${a + 1} and ${b + 1} are ${gap} semitones apart`).not.toBe(6);
        expect(gap).not.toBe(11);
      }
    }
  });

  it("stays inside the eight channels however it is asked", () => {
    expect(channelFreq(-4)).toBe(channelFreq(0));
    expect(channelFreq(99)).toBe(channelFreq(CHANNEL_COUNT - 1));
  });
});

describe("articulation: the Y axis is the whole expressive range", () => {
  const f = channelFreq(3);
  const bottom = articulate(0, f, TONE_MID, DECAY_MID);
  const top = articulate(1, f, TONE_MID, DECAY_MID);

  it("is soft, dark and long at the bottom", () => {
    expect(bottom.peak).toBeLessThan(top.peak);
    expect(bottom.openHz).toBeLessThan(top.openHz);
    expect(bottom.bodyS).toBeGreaterThan(top.bodyS);
  });

  it("is bright and fast at the top", () => {
    expect(top.attack).toBeLessThan(bottom.attack);
    expect(top.tineIndex).toBeGreaterThan(bottom.tineIndex);
    expect(top.tineS).toBeLessThan(bottom.tineS);
  });

  it("keeps the body decay natural: 3.5-5.5 s before the DECAY knob", () => {
    // Knob at centre is knob-neutral only in feel, so assert the range at the
    // scale factor of 1: decay = 0.5 gives 1.125x, so check the ordering and
    // the endpoints of the unscaled map instead.
    const slow = articulate(0, f, TONE_MID, 0).bodyS / 0.55;
    const fast = articulate(1, f, TONE_MID, 0).bodyS / 0.55;
    expect(slow).toBeCloseTo(5.5, 5);
    expect(fast).toBeCloseTo(3.5, 5);
  });

  it("collapses the tine inside 150-400 ms at every height", () => {
    for (let i = 0; i <= 10; i += 1) {
      const s = articulate(i / 10, f, TONE_MID, DECAY_MID);
      expect(s.tineS).toBeGreaterThanOrEqual(0.15);
      expect(s.tineS).toBeLessThanOrEqual(0.4);
    }
  });

  it("opens the filter above where it closes, so impact is the bright moment", () => {
    for (let i = 0; i <= 10; i += 1) {
      const s = articulate(i / 10, f, TONE_MID, DECAY_MID);
      expect(s.openHz).toBeGreaterThan(s.closeHz);
    }
  });

  it("never lets a knob or a height produce silence or a runaway", () => {
    for (const tone of [0, 0.5, 1]) {
      for (const decay of [0, 0.5, 1]) {
        for (const y of [0, 0.5, 1]) {
          const s = articulate(y, channelFreq(7), tone, decay);
          expect(s.peak).toBeGreaterThan(0.5);
          expect(s.peak).toBeLessThanOrEqual(0.95);
          expect(s.openHz).toBeLessThanOrEqual(16000);
          expect(s.closeHz).toBeGreaterThanOrEqual(170);
          expect(s.bodyS).toBeGreaterThan(1);
        }
      }
    }
  });

  it("clamps articulation asked for outside the playfield", () => {
    expect(articulate(-3, f, TONE_MID, DECAY_MID)).toEqual(articulate(0, f, TONE_MID, DECAY_MID));
    expect(articulate(9, f, TONE_MID, DECAY_MID)).toEqual(articulate(1, f, TONE_MID, DECAY_MID));
  });
});

describe("damping", () => {
  it("stays inside 0.35-2 s whatever the DECAY knob does", () => {
    for (const source of ["pointer", "key"] as const) {
      for (const held of [0, 0.1, 0.5, 1, 2, 30]) {
        for (const decay of [0, 0.25, 0.5, 0.75, 1]) {
          const d = dampTime(source, held, decay);
          expect(d).toBeGreaterThanOrEqual(0.35);
          expect(d).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("is shorter for a note released early", () => {
    expect(dampTime("pointer", 0.05, DECAY_MID)).toBeLessThan(dampTime("pointer", 2, DECAY_MID));
  });

  it("is faster for a key than for a lifted finger — keys are percussive", () => {
    // CLAUDE.md pins this as intentional, so it gets a test rather than a
    // comment: a later tidy-up that unifies the two constants goes red here.
    expect(dampTime("key", 1, DECAY_MID)).toBeLessThan(dampTime("pointer", 1, DECAY_MID));
  });
});

describe("polyphony", () => {
  it("holds twelve voices", () => {
    expect(MAX_VOICES).toBe(12);
  });
});
