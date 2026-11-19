// Voicing LAYOUTS: the part of a chord shape that is independent of which
// chord it is.
//
// A shape in lib/Shapes/Chords.ts (e.g. "Drop 2, High String Set, Root
// position, Min7") is stored as fret offsets. But those offsets are fully
// determined by two things:
//   1. which chord tone sits on which string, and in which octave -- the
//      LAYOUT (this file), the same for every chord quality; and
//   2. the chord's intervals -- supplied by a ChordQuality (or, for Scale
//      Chords, by the scale; see diatonic.ts).
//
// fretOffset = interval[slot] - (tuning[string] - tuning[rootString]) + 12 * octave
//
// `slot` is an index into quality.intervals / quality.degrees (0 = root), so
// a layout works for any chord with the same number of tones: Maj7, Min7,
// Dom7, or the 1-3-4-7 chord you get from a scale.
//
// Measured on the existing library (scripts/validate-harmony.ts): 1,674
// hand-authored Sevenths/Triads/Shells shapes are only 400 distinct layouts.
import type { ChordQuality } from '@/lib/chordQualities';
import { STANDARD_TUNING_SEMITONES } from '@/lib/chordQualities';
import type { ShapeFormula } from '@/lib/fretboardMap';

export type LayoutNote = {
    string: number;
    /** index into quality.intervals / quality.degrees */
    slot: number;
    /** whole octaves added to the interval when placing the note */
    octave: number;
};

export type VoicingLayout = {
    rootString: number;
    notes: LayoutNote[]; // sorted by string
};

/**
 * Extracts the layout of an existing shape. `quality` must be the quality
 * the shape was written for (it supplies the slot <-> degree mapping and the
 * intervals). Returns null if the shape isn't expressible as a layout (a
 * note whose degree isn't in the quality, or a non-whole-octave offset).
 */
export function layoutOfShape(
    shape: ShapeFormula,
    quality: ChordQuality,
    tuning: number[] = STANDARD_TUNING_SEMITONES,
): VoicingLayout | null {
    const notes: LayoutNote[] = [];
    for (const n of shape.pattern) {
        const slot = quality.degrees.indexOf(n.degree);
        if (slot < 0) return null;
        const base =
            quality.intervals[slot] -
            (tuning[n.string] - tuning[shape.rootString]);
        const diff = n.fretOffset - base;
        if (diff % 12 !== 0) return null;
        notes.push({ string: n.string, slot, octave: diff / 12 });
    }
    notes.sort((a, b) => a.string - b.string);
    return { rootString: shape.rootString, notes };
}

/** Places a layout for a given chord (any quality / any scale-derived chord). */
export function shapeFromLayout(
    layout: VoicingLayout,
    quality: ChordQuality,
    tuning: number[] = STANDARD_TUNING_SEMITONES,
): ShapeFormula {
    return {
        rootString: layout.rootString,
        pattern: layout.notes.map(n => ({
            string: n.string,
            fretOffset:
                quality.intervals[n.slot] -
                (tuning[n.string] - tuning[layout.rootString]) +
                12 * n.octave,
            semitones: quality.intervals[n.slot],
            degree: quality.degrees[n.slot],
        })),
    };
}

/** Stable identity for grouping/deduping layouts. */
export function layoutKey(layout: VoicingLayout): string {
    return (
        `${layout.rootString}|` +
        layout.notes.map(n => `${n.string}.${n.slot}.${n.octave}`).join(',')
    );
}

/** Fret span of a placed shape (max - min fretOffset). */
export function shapeSpan(shape: ShapeFormula): number {
    const offs = shape.pattern.map(n => n.fretOffset);
    return Math.max(...offs) - Math.min(...offs);
}
