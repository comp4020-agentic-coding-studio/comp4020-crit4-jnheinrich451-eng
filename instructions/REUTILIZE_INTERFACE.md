# VOX-8 — Interface Functionality & Polish Pass

## Objective

Continue from the **current approved VOX-8 implementation**.

The current musical instrument is working and should be treated as the baseline:

* warm Rhodes-like struck tone
* 8 playable bands
* mouse interaction
* `A S D F G H J K` keyboard performance
* polyphonic chords
* `SPACE` sustain pedal
* TONE / DECAY / SPACE controls
* NORM / CHOR / RADIO scan modes
* center-out keyboard excitation
* waveform feedback
* active-band phosphor response
* carrier/lock meter
* green CRT / retro-futurist device aesthetic

**Do not redesign the musical core.**

Do not introduce another major sound mechanic.

This pass is specifically about:

1. making `PLAY / DECK / DATA / TUNE` meaningful
2. improving interface credibility
3. polishing instructional language
4. making existing information genuinely connected to the instrument
5. preserving the cold-open playability

---

# 1. Global Rule

The instrument must always remain playable.

Switching between:

```txt
PLAY
DECK
DATA
TUNE
```

must **never stop audio**, reset voices, destroy sustain state, or require the user to return to PLAY before using the keyboard.

`A S D F G H J K` and `SPACE` should continue working globally.

The mouse-playable field should also remain available whenever practical.

The top sections are different ways of viewing/configuring the same physical machine — not separate web pages.

---

# 2. PLAY

`PLAY` is the default view.

Preserve the current main layout almost exactly.

It contains:

* main phosphor performance field
* waveform
* 8 signal bands
* active band excitation
* keyboard labels
* right-side telemetry
* carrier meter
* bottom physical controls

This is the cleanest and most performance-focused view.

Do not add more panels to PLAY.

---

# 3. DECK

`DECK` means:

> **instrument architecture / operating schematic**

It is NOT a tutorial page.

It should feel like looking at the internal specification plate of the machine.

Keep the instrument visible and playable.

Add a restrained technical overlay or side panel containing information such as:

```txt
VOX-8 SIGNAL DECK

BAND ARRAY      08
VOICE ENGINE    STRUCK TINE
POLYPHONY       12 VOX
PEDAL           SPACE
INPUT A         POINTER
INPUT B         KEY ARRAY

B01  A
B02  S
B03  D
B04  F
B05  G
B06  H
B07  J
B08  K
```

Also show a simple technical signal-flow diagram:

```txt
INPUT
  ↓
BAND SELECT
  ↓
TINE / BODY
  ↓
TONE
  ↓
DECAY
  ↓
SPACE
  ↓
MASTER
```

Keep this extremely minimal and machine-like.

Do not write paragraphs explaining how to use the instrument.

DECK should communicate through schematic structure.

The main field should remain visible behind/beside the information.

---

# 4. DATA

`DATA` means:

> **live performance telemetry**

Everything displayed here must come from actual instrument state.

Do not invent fake random numbers.

Recommended live values:

```txt
MODE
TONE
DECAY
SPACE

ACTIVE BAND
ACTIVE VOICES
PEAK LEVEL
SUSTAIN
LAST STRIKE
LAST FREQUENCY
```

Example:

```txt
MODE          CHOR
TONE          050
DECAY         055
SPACE         028

ACTIVE BAND   B04
VOX           03/12
PEAK          0.61
PEDAL         HOLD
FREQ          196.00
```

Add a small live event log.

Example:

```txt
T+00:21:14   B04 STRIKE
T+00:21:15   B06 STRIKE
T+00:21:15   PEDAL DOWN
T+00:21:17   B04 RELEASE
T+00:21:18   PEDAL UP
```

Keep only approximately the last 6–10 events.

New events may enter from the bottom and older events fade upward.

No giant scrolling console.

The DATA view should make the instrument feel like a real machine observing its own performance.

---

# 5. DATA Visual Behaviour

DATA should remain visually quiet.

Use:

* tiny monospace typography
* thin green rules
* phosphor glow only on changing values
* brief flash when a value updates
* restrained animated meter response

Do not create colorful charts.

Do not make DATA look like an analytics dashboard.

Think:

```txt
field instrumentation
+
terminal telemetry
+
vintage electronic diagnostic equipment
```

---

# 6. TUNE

`TUNE` means:

> **safe musical calibration**

Do not expose raw synthesis engineering parameters.

Do NOT add:

* FM ratio
* oscillator waveform selection
* filter resonance
* LFO routing
* envelope graphs
* complex synth controls

The user should not be able to destroy the pleasant musical character.

TUNE should initially expose only a very small number of safe musical controls.

---

# 7. Pitch Bank

Add:

```txt
REGISTER

LOW
MID
HIGH
```

Recommended behavior:

### LOW

transpose the existing 8-band layout downward approximately one octave.

### MID

current approved tuning.

### HIGH

transpose the existing layout upward approximately one octave.

Keep the pentatonic relationships intact.

Do not change band ordering.

The user should always get musically compatible notes.

Default:

```txt
MID
```

---

# 8. Scale

For this implementation, show:

```txt
SCALE
PENTA
```

but keep it locked.

This can appear as a calibration readout rather than an editable control.

Do not add many musical scales unless there is a compelling reason later.

The pentatonic system is intentionally protecting the “no wrong way to play” quality.

---

# 9. Root / Transposition — Optional

Only if implementation remains simple and musically safe:

allow a small root selector such as:

```txt
ROOT

C
D
F
G
A
```

Changing root should transpose the entire eight-band system while maintaining the same pentatonic interval structure.

If this creates unnecessary complexity or bugs, omit it.

REGISTER is higher priority.

---

# 10. TUNE Feedback

When register/root changes:

* update band frequencies immediately
* update DATA telemetry
* briefly flash a calibration response
* optionally move the carrier gauge
* do NOT interrupt currently sounding voices abruptly

Existing voices may finish naturally at their original pitch.

New strikes use the new tuning.

This avoids ugly instantaneous retuning of ringing Rhodes voices.

---

# 11. Top Navigation Behaviour

The top buttons:

```txt
PLAY
DECK
DATA
TUNE
```

should have obvious active state.

Use the existing green phosphor language.

Active tab:

* filled/bright green background or stronger frame
* dark text if appropriate

Inactive:

* outline / low-opacity green

Do not use conventional web tab styling.

Switching views should be fast and subtle.

Recommended transition:

```txt
80–180 ms
```

Use:

* phosphor fade
* tiny horizontal scan transition
* brief CRT refresh

Do not use sliding app-page animations.

---

# 12. Preserve the Main Instrument

Even in DECK / DATA / TUNE, do not completely replace the performance field with a full blank page.

Preferred strategies:

### DECK

technical overlay / inset around the field

### DATA

field remains visible with expanded telemetry

### TUNE

field remains visible while calibration controls appear compactly

The user should always feel that they are still holding the same instrument.

---

# 13. Bottom Instruction Copy

Replace the current sentence:

```txt
drag or scroll a dial · SPACE holds the sustain pedal · nothing here can be set to a setting that stops it playing
```

It is too explanatory and reads like developer documentation.

Replace it with compact machine language.

Preferred:

```txt
A S D F G H J K // STRIKE
SPACE // SUSTAIN
DIAL // DRAG · SCROLL
```

This may be arranged on one or two lines depending on available width.

Use low-opacity green text.

Do not add additional tutorial paragraphs.

---

# 14. Cold-Open Protection

A new visitor should still be able to ignore all navigation and controls.

The first interaction must remain:

```txt
press screen
or
press A/S/D/F/G/H/J/K
→ immediate musical response
```

Do not introduce:

* welcome screen
* START button
* modal
* tutorial
* mandatory configuration
* initial tab selection

Default directly to PLAY.

---

# 15. Right-Side Telemetry

Preserve and strengthen the current right-side DATA block.

Even in PLAY, it should show concise live state:

```txt
MODE
TONE
DECAY
SPACE
BAND
VOX
```

Make sure these values are actually synchronized with:

* knob changes
* scan mode
* mouse interaction
* keyboard interaction
* polyphony

If no band is active:

```txt
BAND --
```

If voices are decaying:

VOX should still reflect them until voice cleanup.

---

# 16. Carrier / Lock Meter

The existing carrier gauge should become genuinely tied to musical activity.

Use combined voice energy / output level as its driver.

Behavior:

### idle

needle rests near minimum

### single quiet note

small movement

### stronger strike

larger movement

### chord

larger combined response

### decay

needle smoothly returns

### silence

settles naturally

Use damping/smoothing.

Do not jitter from frame-to-frame peak values.

The meter should feel mechanical.

---

# 17. Main Waveform

Preserve the waveform across the CRT.

Use it as a representation of the combined output signal.

Do not create eight giant independent waveforms.

Suggested behavior:

### single note

clean readable trace

### chord

more complex composite waveform

### CHOR mode

subtle secondary ghost trace / phase offset

### RADIO mode

very small irregularity / phosphor instability

### NORM

cleanest presentation

The waveform should remain elegant and restrained.

---

# 18. Mode Visual Character

Keep the UI fundamentally the same across:

```txt
NORM
CHOR
RADIO
```

But allow very subtle changes.

### NORM

cleanest phosphor trace

### CHOR

slightly wider/doubled waveform persistence

### RADIO

subtle instability/static/interference

Do not transform the entire UI.

Modes change the behavior of the machine, not its identity.

---

# 19. Knob Credibility

Preserve:

```txt
TONE
DECAY
SPACE
```

Improve interaction feedback if necessary.

When user drags or scrolls a dial:

* dial pointer moves smoothly
* numeric value updates
* relevant telemetry flashes briefly
* audio parameter changes smoothly
* no zipper noise
* value range remains musically safe

Do not add more knobs during this pass.

Three is enough.

---

# 20. Visual Density

The current restraint is approved.

Do not fill empty space merely because DECK/DATA/TUNE now exist.

Retain:

* dark negative space
* thin green lines
* small typography
* phosphor persistence
* sparse highlights
* clear large performance field

Do not emulate Fallout inventory density directly.

This is a musical instrument, not an inventory terminal.

---

# 21. Device Language

Continue using terms such as:

```txt
VOX
BAND
FIELD
CARRIER
LOCK
SCAN
TINE
DECK
SIGNAL
REGISTER
CAL
PEDAL
STRIKE
```

Avoid generic website language such as:

```txt
Settings
Options
Dashboard
Help
Page
Menu
```

---

# 22. No New Major Features

Do not add:

* sequencer
* song recorder
* MIDI editor
* drum machine
* presets browser
* additional oscillator system
* 20 extra controls
* score/game logic
* achievements
* inventory parody
* lore pages

The musical interaction is already sufficient.

This is a polish/credibility pass.

---

# 23. Implementation Priority

Perform the work in this order:

## Phase 1

Make PLAY / DECK / DATA / TUNE switch correctly.

Do not break performance.

## Phase 2

Implement DECK schematic.

## Phase 3

Implement live DATA telemetry + event log.

## Phase 4

Implement TUNE register selector.

## Phase 5

Connect carrier meter to real voice energy.

## Phase 6

Replace bottom instructional copy.

## Phase 7

Polish transitions and phosphor feedback.

Do not add additional scope after this unless necessary to fix usability.

---

# 24. Final Cold Test

After implementation, open the site from a fresh load.

Do not interact with the navigation.

Verify:

1. PLAY appears immediately.
2. Pressing `A` immediately produces the warm Rhodes strike.
3. Corresponding band performs its center-out excitation.
4. Pressing several keys produces a chord.
5. SPACE sustains it.
6. TONE / DECAY / SPACE remain responsive.
7. NORM / CHOR / RADIO work.
8. Carrier meter reacts.
9. PLAY / DECK / DATA / TUNE now all have real purposes.
10. Returning to PLAY never feels like reloading or restarting the instrument.

Then test DECK, DATA, and TUNE.

They should feel like deeper layers of the **same physical object**, not separate web pages.

---

# 25. Success Definition

This pass is complete when VOX-8 feels like:

> **a believable retro-futurist phosphor musical instrument with a simple surface, deeper machine telemetry, and no fake controls.**

The project should now have three levels of discovery:

### Immediate

Press and make sound.

### Expressive

Play chords, sweep bands, sustain, adjust tone/decay/space.

### Curious

Open DECK, DATA, or TUNE and understand more about the machine.

Do not sacrifice the first level to improve the third.

The final priority remains:

> **PLAYABILITY → MUSICAL FEEL → VISUAL FEEDBACK → DEVICE CREDIBILITY → EXTRA DETAIL**
