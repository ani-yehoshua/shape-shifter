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

### Defects the engine surfaced

Fixed (by hand, in `Chords.ts`; the validation passes with an empty
known-defects list):

- *Drop 3 / Low String Set / 2nd Inv. / Min7, alt 2* had `rootString: 1`
  but its root note is on string 2.
- *Drop 2 of 2 / Low String Set / 2nd Inv. / Maj7#5, alt 1* labelled the 5th
  `semitones: 7` (should be 8).

Still open:

- `ScaleChords.ts`: all 32 "Low" string-set templates for the eight non-base
  structures are copies of the "Mid" ones, alternates included (strings 1-4,
  not 2-5), so choosing Low + a non-base structure shows Mid-string shapes.
  **Decision: keep the Mid copies as a fallback**; try the engine's real Low
  shapes alongside and compare (see below).
- `ScaleChords.ts` `1 3 4 7` alternates: *High / 3rd Inv. / alt 1* has wrong
  `degree` labels, and *Mid and Low / 2nd Inv. / alt 1* has its root note on
  string 3 but `rootString: 4`. These sit in the block marked
  `// WAS VERIFYING ALT SHAPES` (Mid `1 3 4 7`) -- **resume that
  verification here**; carry the marker over when `ScaleChords.ts` is
  replaced.
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

1. **Done:** engine slice + validation; Chords.ts defects fixed; generated
   mobile copy (`npm run sync:mobile`).
2. Verify the remaining `ScaleChords.ts` alternates by hand (`1 3 4 7`
   block first).
3. `resolveScaleChord(...)`: one function for "scale + structure + voicing +
   string set + inversion + alt -> per-degree shapes", curated alts first,
   layout fallback. Also unlocks Drop 3 / Drop 2 of 2 / Raise 3/1 of 2 /
   Triads / Shells in Scale Chords (today: Drop 2 only).
4. Switch `app/page.tsx` (and mobile) to it; delete `ScaleChords.ts`.
5. Optional cleanup: store `Chords.ts` as layouts x qualities (~400 layouts)
   instead of 1,674 hand-typed shapes.
6. UX: Scale Chords as default, chord <-> scale cross-links (the reverse of
   `diatonicChords`: which scale degrees yield this chord), onion drill-down.

## Decisions so far

- **Alternates are hand-checked, always.** Nearly every alt needs a human to
  confirm the fret hand can actually reach it, and some that look "missing"
  are unplayable. So the engine never ships a derived alt on its own: derived
  layouts are *candidates* to review (e.g. the ~98 absent-but-span<=5
  combinations the validation reports -- span is only a heuristic, not
  proof of playability). Hand-authored alts stay authoritative.
- **`ScaleChords.ts` is replaced, not dropped.** Its authored shapes (162,
  alternates included) convert mechanically to layouts into a smaller
  "authored layouts" table keyed by voicing type / string set / degree
  structure / inversion, where new alts keep getting added. Library layouts
  (all voicing types, triads, shells) are the fallback for anything not
  authored. Nothing is deleted until the conversion round-trips exactly.
- **One source, generated mobile copy.** The website's `lib/` is the only
  place shared logic is edited; `npm run sync:mobile` regenerates the
  mobile copy (`scripts/sync-mobile-lib.mjs`, with `npm run
  check:mobile-sync` to catch drift). Chosen over importing across folders so
  `mobile/` stays self-contained for store builds.

## Notes for later: scales that aren't 7-note

From the author (to be designed, not built):

- **Pentatonic:** quartal chords, minor chords, major chords, CAGED shapes,
  maybe more.
- **Blues:** like pentatonic plus the added note; each scale root gets a
  second chord (minor and m7b5 on the 1).
- **Symmetric:** whole tone -> only two chords; diminished dominant -> two (to
  confirm); the "symmetrical" scale has a large handful.
- **8- and 9-note:** like Major, but each chord gains extra function from the
  altered interval.

This points at a "which chords fit inside this scale" search (every chord
whose tones are all in the scale) rather than one chord per degree; check
what falls out against the above before committing to it.

## Still open

- **Order of the UX work** (default view vs cross-links vs onion).
