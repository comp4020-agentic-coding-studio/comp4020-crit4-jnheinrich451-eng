// The voice model, tested where it can be: the pure functions the engine hands
// its parameters to. No AudioContext exists in a test runner, so anything
// asserted here has to be arithmetic — which is exactly where instructions/TONE.md's
// numbers live, and exactly where a "simplification" would quietly land.
//
// TONE.md ends with five rules under "If you change the tone, protect these".
// Four of the five are arithmetic and are asserted below by name. The fifth
// (the per-voice filter must move) is asserted as filtOpen > filtClose, which
// is the shape of the movement; that it is actually scheduled is checked by
// ear and by the CDP pass.

import { describe, expect, it } from "vitest";
import {
  CHANNEL_COUNT,
  MAX_VOICES,
  VISUAL_DAMP_S,
  articulate,
  channelFreq,
  dampTime,
} from "../src/engine";

const TONE_DEFAULT = 0.5;
const DECAY_DEFAULT = 0.55;
const HEIGHTS = [0, 0.1, 0.25, 0.4, 0.5, 0.62, 0.75, 0.9, 1];

describe("tuning: no two channels can sound wrong together", () => {
  it("is the eight frequencies TONE.md names, ascending", () => {
    expect(CHANNEL_COUNT).toBe(8);
    const freqs = Array.from({ length: CHANNEL_COUNT }, (_, i) => channelFreq(i));
    expect(freqs).toEqual([130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63]);
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
        const where = `channels ${a + 1} and ${b + 1} are ${gap} semitones apart`;
        expect(gap, where).not.toBe(1);
        expect(gap, where).not.toBe(6);
        expect(gap, where).not.toBe(11);
      }
    }
  });

  it("stays inside the eight channels however it is asked", () => {
    expect(channelFreq(-4)).toBe(channelFreq(0));
    expect(channelFreq(99)).toBe(channelFreq(CHANNEL_COUNT - 1));
  });
});

describe("protect #1: the tine must collapse in under ~0.5 s", () => {
  it("holds at every height and every TONE setting", () => {
    for (const b of HEIGHTS) {
      for (const tone of [0, 0.25, 0.5, 0.75, 1]) {
        const s = articulate(b, channelFreq(0), tone, DECAY_DEFAULT);
        expect(s.tineDecay, `b=${b} tone=${tone}`).toBeLessThanOrEqual(0.5);
        expect(s.tineDecay).toBeGreaterThan(0.1);
      }
    }
  });

  it("never lets the index floor rise above freq * 0.2", () => {
    for (const b of HEIGHTS) {
      const f = channelFreq(7);
      expect(articulate(b, f, 1, DECAY_DEFAULT).modFloor).toBeLessThanOrEqual(f * 0.2);
    }
  });

  it("drops the index by more than an order of magnitude", () => {
    // The collapse, not the amplitude envelope, is what reads as struck.
    for (const b of HEIGHTS) {
      const s = articulate(b, channelFreq(3), TONE_DEFAULT, DECAY_DEFAULT);
      expect(s.modStart / s.modFloor).toBeGreaterThan(15);
    }
  });
});

describe("protect #2: the per-voice filter must move", () => {
  it("opens well above where it closes, at every height", () => {
    for (const b of HEIGHTS) {
      const s = articulate(b, channelFreq(2), TONE_DEFAULT, DECAY_DEFAULT);
      expect(s.filtOpen).toBeCloseTo(s.cut * 2.4, 6);
      expect(s.filtClose).toBeCloseTo(s.cut * 0.62, 6);
      expect(s.filtOpen / s.filtClose).toBeGreaterThan(3);
    }
  });

  it("sweeps the cutoff exponentially across the playfield", () => {
    // Equal steps in Y should be equal ratios in cutoff, because that is how
    // ears hear brightness. A linear map bunches the whole change at the top.
    const at = (b: number): number => articulate(b, channelFreq(0), TONE_DEFAULT, DECAY_DEFAULT).cut;
    const lower = at(0.5) / at(0);
    const upper = at(1) / at(0.5);
    expect(upper / lower).toBeCloseTo(1, 3);
  });
});

describe("protect #3: the fundamental stays loudest", () => {
  it("keeps every other part under the sine, at every knob position", () => {
    // Part peaks are relative to the voice's own `peak`, so comparing them to 1
    // is comparing them to the fundamental.
    for (const b of HEIGHTS) {
      for (const tone of [0, 0.5, 1]) {
        for (const v of [0, 0.5, 1]) {
          const s = articulate(b, channelFreq(0), tone, DECAY_DEFAULT, v);
          const where = `b=${b} tone=${tone} v=${v}`;
          expect(s.barPeak, where).toBeLessThan(1);
          expect(s.octPeak, where).toBeLessThan(1);
          expect(s.tinePeak, where).toBeLessThan(1);
        }
      }
    }
  });

  it("scales high notes down, as on the real thing", () => {
    const low = articulate(0.5, channelFreq(0), TONE_DEFAULT, DECAY_DEFAULT).peak;
    const high = articulate(0.5, channelFreq(7), TONE_DEFAULT, DECAY_DEFAULT).peak;
    expect(high).toBeLessThan(low);
    expect(high / low).toBeGreaterThan(0.7);
  });
});

describe("protect #5: Y is a continuous articulation axis", () => {
  const f = channelFreq(3);
  const bottom = articulate(0, f, TONE_DEFAULT, DECAY_DEFAULT);
  const top = articulate(1, f, TONE_DEFAULT, DECAY_DEFAULT);

  it("is soft, dark and long at the bottom", () => {
    expect(bottom.cut).toBeLessThan(top.cut);
    expect(bottom.tineAmt).toBeLessThan(top.tineAmt);
    expect(bottom.body).toBeGreaterThan(top.body);
  });

  it("is bright, fast and percussive at the top", () => {
    expect(top.atk).toBeLessThan(bottom.atk);
    expect(top.tineDecay).toBeLessThan(bottom.tineDecay);
  });

  it("moves monotonically, with no step or preset boundary", () => {
    // A preset switch would show up as two heights sharing a value, or as the
    // ordering reversing somewhere in the middle.
    const cuts = HEIGHTS.map((b) => articulate(b, f, TONE_DEFAULT, DECAY_DEFAULT).cut);
    const bodies = HEIGHTS.map((b) => articulate(b, f, TONE_DEFAULT, DECAY_DEFAULT).body);
    for (let i = 1; i < HEIGHTS.length; i += 1) {
      expect(cuts[i]).toBeGreaterThan(cuts[i - 1]);
      expect(bodies[i]).toBeLessThan(bodies[i - 1]);
    }
  });

  it("keeps the body between 3.5 s and 5.4 s before the DECAY knob", () => {
    const unscaled = (b: number): number => articulate(b, f, TONE_DEFAULT, 0).body / 0.42;
    expect(unscaled(0)).toBeCloseTo(5.4, 5);
    expect(unscaled(1)).toBeCloseTo(3.5, 5);
  });

  it("clamps articulation asked for outside the playfield", () => {
    expect(articulate(-3, f, TONE_DEFAULT, DECAY_DEFAULT)).toEqual(
      articulate(0, f, TONE_DEFAULT, DECAY_DEFAULT),
    );
    expect(articulate(9, f, TONE_DEFAULT, DECAY_DEFAULT)).toEqual(
      articulate(1, f, TONE_DEFAULT, DECAY_DEFAULT),
    );
  });
});

describe("no setting can make the instrument unplayable", () => {
  it("never produces silence, a runaway or an inaudible note", () => {
    for (const tone of [0, 0.5, 1]) {
      for (const decay of [0, 0.5, 1]) {
        for (const b of [0, 0.5, 1]) {
          const s = articulate(b, channelFreq(7), tone, decay);
          const where = `b=${b} tone=${tone} decay=${decay}`;
          expect(s.peak, where).toBeGreaterThan(0.05);
          expect(s.cut, where).toBeGreaterThan(200);
          expect(s.cut, where).toBeLessThan(16000);
          expect(s.body, where).toBeGreaterThan(1);
          expect(s.atk, where).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("damping", () => {
  it("stays inside 0.28-2.6 s whatever the DECAY knob does", () => {
    for (const b of HEIGHTS) {
      for (const held of [0, 0.1, 0.25, 0.5, 1, 1.6, 2, 30]) {
        for (const decay of [0, 0.25, 0.5, 0.75, 1]) {
          const d = dampTime(b, held, decay);
          expect(d).toBeGreaterThanOrEqual(0.28);
          expect(d).toBeLessThanOrEqual(2.6);
        }
      }
    }
  });

  it("damps a short tap faster than a held note", () => {
    expect(dampTime(0.5, 0.1, DECAY_DEFAULT)).toBeLessThan(dampTime(0.5, 2, DECAY_DEFAULT));
  });

  it("lets the bottom of the playfield ring on longest", () => {
    expect(dampTime(1, 1, DECAY_DEFAULT)).toBeLessThan(dampTime(0, 1, DECAY_DEFAULT));
  });

  it("puts the keyboard/pointer difference in the visuals, not the audio", () => {
    // TONE.md moved this: audio damping is source-independent, and keys read as
    // more percussive because their band decays faster on screen.
    expect(VISUAL_DAMP_S.key).toBeCloseTo(0.52, 5);
    expect(VISUAL_DAMP_S.pointer).toBeCloseTo(0.7, 5);
    expect(VISUAL_DAMP_S.key).toBeLessThan(VISUAL_DAMP_S.pointer);
  });
});

describe("polyphony", () => {
  it("holds twelve voices", () => {
    expect(MAX_VOICES).toBe(12);
  });
});
