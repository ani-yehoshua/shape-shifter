# Phase 2: the harmony engine (backend redesign)

Status: engine slice + validation script landed (`lib/harmony/`,
`scripts/validate-harmony.ts`); **nothing in the web or mobile app uses it
yet.** Run `npx tsx scripts/validate-harmony.ts` any time.

## Goals (from the Phase 2 notes)

1. Scale Chords should be computed from the chord library layered on the
   scale library, not a second hand-built copy (`lib/Shapes/ScaleChords.ts`).
2. Scale Chords as the default view ("Major scale and its chords"), so the app
   teaches harmony instead of being a library of shapes.
3. Chords and Scales stay "freeform", but each links to the scales/chords it
   belongs to.
4. A harmony "onion": scale harmony (outer) -> chord harmony -> melodic
   harmony (one note, inner).

This document covers goal 1 and the engine that goals 2-4 are built on.

## What the data actually looks like (measured)

- `Chords.ts` (~20k lines): Sevenths (5 voicing types), Triads, Shells, CAGED.
  Hand-authored per chord quality.
- `ScaleChords.ts` (~2.1k lines): **Drop 2 only**, 9 "degree structures" (the
  stacked-thirds `1 3 5 7` plus eight like `1 3 4 7`), reshaped across a
  scale's degrees by `generateDiatonicVoicings`.

Findings from `scripts/validate-harmony.ts`:

| Finding | Number |
| --- | --- |
| Hand-authored Sevenths/Triads/Shells shapes (primary + alts) | 1,674 |
| ...which are only this many distinct *layouts* | 399 |
| `(Base) 1 3 5 7` Scale Chords reproduced by one library layout placed on each degree's chord, for all six 7-note scales | 504 / 504 |
| Other eight structures reproduced the same way (High + Mid string sets) | 448 / 448 |
| Layouts present for every quality / only some | 225 / 174 |
| Missing (layout, quality) combinations that would be playable (<= 5 frets) | 99 of 506 |

**A voicing is a layout (which chord tone on which string, in which octave)
plus a chord (the intervals).** `fretOffset = interval[slot] - (tuning[string]
- tuning[rootString]) + 12 * octave`. Scale Chords is the same layout with the
intervals taken from the scale instead of from a named quality -- which is why
Hungarian Minor and Dominant #9, whose chords the registry doesn't name, work
with no new library data.

### Defects the engine surfaced (not fixed in this branch)

- `Chords.ts`: *Drop 3 / Low String Set / 2nd Inv. / Min7, alt 2* has
  `rootString: 1` but its root note is on string 2 (shape draws at wrong
  frets).
- `Chords.ts`: *Drop 2 of 2 / Low String Set / 2nd Inv. / Maj7#5, alt 1*
  labels the 5th `semitones: 7` (should be 8; affects note naming).
- `ScaleChords.ts`: all 32 "Low" string-set templates for the eight non-base
  structures are byte-for-byte copies of the "Mid" ones (strings 1-4, not
  2-5), so choosing Low + any non-base structure on the website shows Mid
  shapes.
- `Chords.ts` nesting is inconsistent: "Raise 3/1 of 2" skips the string-set
  level.

## Architecture

```
scale (intervals)  ──diatonicChords(structure)──▶  chord per degree      (diatonic.ts)
                                                     │  (intervals + degree labels,
                                                     │   optional registry name)
voicing layout  ──────────────────────────────────── ▼
(voicing type / string set / inversion)  ──shapeFromLayout──▶  placed shape  (layouts.ts)
```

- `lib/harmony/diatonic.ts` -- `chordAtDegree`, `matchQuality`,
  `diatonicChords`: the chord each scale degree gives for a degree structure.
- `lib/harmony/layouts.ts` -- `layoutOfShape`, `shapeFromLayout`,
  `layoutKey`: split/recombine a shape into layout x chord.
- Layouts come from the existing library (`Chords.ts`) -- the curated source
  of truth -- not from the brute-force generator
  (`voicingAlgorithms.ts`), which stays as a tool for *authoring* new
  layouts.

The onion falls out of the same data: **scale layer** = `diatonicChords()`
(all the chords), **chord layer** = one chord's voicings (layouts), **melodic
layer** = a single slot/degree of that chord against the scale's positions
(`Scales.ts`).

## Plan

1. **Done:** engine slice + validation (this branch).
2. Fix the data defects above (small, separate PR; web and mobile both carry
   copies of `Shapes/`).
3. `resolveScaleChord(...)`: one function for "scale + structure + voicing +
   string set + inversion + alt -> per-degree shapes", curated alts first,
   layout fallback. Also unlocks Drop 3 / Drop 2 of 2 / Raise 3/1 of 2 /
   Triads / Shells in Scale Chords (today: Drop 2 only).
4. Switch `app/page.tsx` (and mobile) to it; delete `ScaleChords.ts`.
5. Optional cleanup: store `Chords.ts` as layouts x qualities (~400 layouts)
   instead of 1,674 hand-typed shapes.
6. UX: Scale Chords as default, chord <-> scale cross-links (the reverse of
   `diatonicChords`: which scale degrees yield this chord), onion drill-down.

## Open decisions

- **Alternates:** keep the curated per-quality alts (safe, ragged), or derive
  alts from layouts (fills ~99 playable gaps; changes what users see).
- **Non-7-note scales** (pentatonic, blues, symmetric, 8/9-note): what is "the
  chord on a degree" there?
- **Web/mobile sharing:** `mobile/lib` is a copy of `lib`. Share the engine or
  keep a synced copy?
- **Order of the UX work** (default view vs cross-links vs onion).
