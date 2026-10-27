// Chords-from-scales: what chord does each scale degree give you?
//
// This replaces the hand-built lib/Shapes/ScaleChords.ts data. A "degree
// structure" says which scale degrees (counted from the chord's own root)
// make up the chord: [1, 3, 5, 7] is stacked thirds, [1, 3, 4, 7] is the
// 1-3-4-7 chord, etc. For each scale degree we derive the chord's intervals
// above ITS root, then name it by matching CHORD_QUALITIES -- so it can be
// looked up in the chord library (lib/Shapes/Chords.ts) when it has a named
// quality, or placed from a layout (layouts.ts) when it doesn't.
import type { ChordQuality } from '@/lib/chordQualities';
import { CHORD_QUALITIES } from '@/lib/chordQualities';

/** Scale degrees (1-based, counted from the chord root) that make up the chord. */
export type DegreeStructure = number[];

export const STACKED_THIRDS_7: DegreeStructure = [1, 3, 5, 7];
export const STACKED_THIRDS_3: DegreeStructure = [1, 3, 5];

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * The chord on scale degree `degreeIndex` (0-based) of a scale given as
 * semitone offsets from its tonic, e.g. Major = [0,2,4,5,7,9,11].
 * `intervals` are semitones above the chord's own root.
 */
export function chordAtDegree(
    scaleIntervals: number[],
    degreeIndex: number,
    structure: DegreeStructure,
): ChordQuality {
    const n = scaleIntervals.length;
    const rootInterval = scaleIntervals[degreeIndex];
    const intervals = structure.map(step => {
        const idx = degreeIndex + step - 1;
        const interval =
            scaleIntervals[idx % n] + 12 * Math.floor(idx / n) - rootInterval;
        return mod12(interval);
    });
    return { intervals, degrees: [...structure] };
}

/**
 * The CHORD_QUALITIES key whose intervals and degree labels exactly match,
 * or null when the chord has no registry name (e.g. the 1-3-4-7 chord).
 */
export function matchQuality(chord: ChordQuality): string | null {
    for (const [key, q] of Object.entries(CHORD_QUALITIES)) {
        if (
            q.intervals.length === chord.intervals.length &&
            q.intervals.every((x, i) => mod12(x) === mod12(chord.intervals[i])) &&
            q.degrees.every((d, i) => d === chord.degrees[i])
        ) {
            return key;
        }
    }
    return null;
}

export type DiatonicChord = {
    degreeIndex: number;
    chord: ChordQuality;
    /** CHORD_QUALITIES key, or null if the chord has no registry name */
    qualityKey: string | null;
};

/** The chord on every degree of the scale for one degree structure. */
export function diatonicChords(
    scaleIntervals: number[],
    structure: DegreeStructure = STACKED_THIRDS_7,
): DiatonicChord[] {
    return scaleIntervals.map((_, degreeIndex) => {
        const chord = chordAtDegree(scaleIntervals, degreeIndex, structure);
        return { degreeIndex, chord, qualityKey: matchQuality(chord) };
    });
}
