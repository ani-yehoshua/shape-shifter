// GENERATED FILE -- do not edit. Source: lib/harmony/scaleVoicings.ts (the website's lib is the single source).
// Edit that file, then run `npm run sync:mobile` from the repo root.
// A shape placed on the root chord of a scale, moved to every degree of that
// scale. This is the same algorithm as generateDiatonicVoicings in
// lib/Shapes/ScaleChords.ts, copied here so the layout tables
// (Chords.layouts.ts / ScaleChords.layouts.ts) don't depend on that file, which
// is going to be retired. scripts/validate-harmony.ts checks the two give
// identical results.
import type { ShapeFormula } from '../fretboardMap';

type Pattern = ShapeFormula['pattern'];

// Transpose every note in a template to a new diatonic position.
//   positionIndex 0 -> root chord, 1 -> 2nd chord, ..., N-1 -> Nth chord.
//
// For each note at degree D:
//   newDeg      = (D - 1 + positionIndex) % N
//   octaveWrap  = floor((D - 1 + positionIndex) / N)  -- full scale cycles passed
//   delta       = scale[newDeg] - scale[positionIndex] + octaveWrap*12 - scale[D-1]
//   newFretOffset = oldFretOffset + delta
function transposeDiatonic(
    template: ShapeFormula,
    scaleIntervals: number[],
    positionIndex: number,
): Pattern {
    const N = scaleIntervals.length;
    const rootInterval = scaleIntervals[positionIndex];
    return template.pattern.map(note => {
        const baseDeg = note.degree - 1;
        const newDeg = (baseDeg + positionIndex) % N;
        const octaveWrap = Math.floor((baseDeg + positionIndex) / N);
        const delta =
            scaleIntervals[newDeg] -
            rootInterval +
            octaveWrap * 12 -
            note.semitones; // the template's actual interval, not the target scale's degree
        return {
            string: note.string,
            fretOffset: note.fretOffset + delta,
            semitones: (((scaleIntervals[newDeg] - rootInterval) % 12) + 12) % 12,
            degree: note.degree, // keep the chord-quality degree for spellNote
        };
    });
}

/**
 * One pattern per scale degree (length === scaleIntervals.length) for a
 * template placed on the scale's root chord.
 */
export function generateDiatonicVoicings(
    template: ShapeFormula,
    scaleIntervals: number[],
): Pattern[] {
    return scaleIntervals.map((_, posIdx) => transposeDiatonic(template, scaleIntervals, posIdx));
}
