import type { ShapeFormula } from '@/lib/fretboardMap';

export type ScaleChordTemplate = ShapeFormula;

// voicing group → base chord quality → inversion → template
export type ScaleChordLibrary = Record<
    string,
    Record<string, Record<string, ScaleChordTemplate>>
>;

// Transpose every note in a template to a new diatonic position.
//   positionIndex 0 → root chord, 1 → 2nd chord, …, N-1 → Nth chord.
//
// For each note at degree D:
//   newDeg      = (D - 1 + positionIndex) % N
//   octaveWrap  = floor((D - 1 + positionIndex) / N)  — how many full scale cycles passed
//   delta       = scale[newDeg] − scale[positionIndex] + octaveWrap×12 − scale[D−1]
//   newFretOffset = oldFretOffset + delta
function transposeDiatonic(
    template: ScaleChordTemplate,
    scaleIntervals: number[],
    positionIndex: number,
): ScaleChordTemplate['pattern'] {
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
            note.semitones; // use template's actual interval, not target scale's degree
        return {
            string: note.string,
            fretOffset: note.fretOffset + delta,
            semitones:
                (((scaleIntervals[newDeg] - rootInterval) % 12) + 12) % 12,
            degree: note.degree, // preserve chord-quality degree for spellNote
        };
    });
}

// Returns one pattern array per scale degree (length === scaleIntervals.length).
export function generateDiatonicVoicings(
    template: ScaleChordTemplate,
    scaleIntervals: number[],
): ScaleChordTemplate['pattern'][] {
    return scaleIntervals.map((_, posIdx) =>
        transposeDiatonic(template, scaleIntervals, posIdx),
    );
}

// ─── Template library ─────────────────────────────────────────────────────────

export const SCALE_CHORD_SHAPES: ScaleChordLibrary = {
    // need base diatonic shapes

    'Drop 2': {
        '(Base) 1 3 5 7': {
            'Root': {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 4, degree: 3 },
                    { string: 1, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 2, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: 3, semitones: 11, degree: 7 },
                    { string: 3, fretOffset: 1, semitones: 4, degree: 3 },
                    // 5th-string not played
                    // 6th-string not played
                ],
                altShapes: [
                    {
                        rootString: 0,
                        pattern: [
                            { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                            { string: 1, fretOffset: 0, semitones: 7, degree: 5 },
                            { string: 2, fretOffset: -4, semitones: 11, degree: 7 },
                            { string: 3, fretOffset: -6, semitones: 4, degree: 3 },
                            // 5th-string not played
                            // 6th-string not played
                        ],
                    },
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 1, fretOffset: 0, semitones: 4, degree: 3 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: 0, semitones: 7, degree: 5 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: 0, semitones: 7, degree: 5 },
                    { string: 2, fretOffset: 1, semitones: 4, degree: 3 },
                    { string: 3, fretOffset: 1, semitones: 11, degree: 7 },
                    // 5th-string not played
                    // 6th-string not played
                ],
                altShapes: [
                    {
                        rootString: 1,
                        pattern: [
                            { string: 0, fretOffset: 2, semitones: 7, degree: 5 },
                            { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                            { string: 2, fretOffset: -4, semitones: 4, degree: 3 },
                            { string: 3, fretOffset: -4, semitones: 11, degree: 7 },
                            // 5th-string not played
                            // 6th-string not played
                        ],
                    },
                ],
            },
        },
        '1 3 4 7': {
            'Root': {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 4, degree: 3 },
                    { string: 1, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 2, fretOffset: 0, semitones: 5, degree: 4 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 5, degree: 4 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: 3, semitones: 11, degree: 7 },
                    { string: 3, fretOffset: 1, semitones: 4, degree: 3 },
                    // 5th-string not played
                    // 6th-string not played
                ],
                altShapes: [
                    {
                        rootString: 0,
                        pattern: [
                            { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                            { string: 1, fretOffset: -2, semitones: 5, degree: 4 },
                            { string: 2, fretOffset: -4, semitones: 11, degree: 7 },
                            { string: 3, fretOffset: -6, semitones: 4, degree: 3 },
                            // 5th-string not played
                            // 6th-string not played
                        ],
                    },
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 1, fretOffset: 0, semitones: 4, degree: 3 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: -2, semitones: 5, degree: 4 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: -2, semitones: 5, degree: 4 },
                    { string: 2, fretOffset: 1, semitones: 4, degree: 3 },
                    { string: 3, fretOffset: 1, semitones: 11, degree: 7 },
                    // 5th-string not played
                    // 6th-string not played
                ],
                altShapes: [
                    {
                        rootString: 1,
                        pattern: [
                            { string: 0, fretOffset: 0, semitones: 5, degree: 4 },
                            { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                            { string: 2, fretOffset: -4, semitones: 4, degree: 2 },
                            { string: 3, fretOffset: -4, semitones: 11, degree: 4 },
                            // 5th-string not played
                            // 6th-string not played
                        ],
                    },
                ],
            },
        },
        '1 4 5 6': { // Maj9 from 4th
            'Root': {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 3, semitones: 5, degree: 4 },
                    { string: 1, fretOffset: 0, semitones: 9, degree: 6 },
                    { string: 2, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: 1, semitones: 9, degree: 6 },
                    { string: 3, fretOffset: 2, semitones: 5, degree: 4 },
                    // 5th-string not played
                    // 6th-string not played
                ],
                altShapes: [
                    {
                        rootString: 0,
                        pattern: [
                            { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                            { string: 1, fretOffset: 0, semitones: 7, degree: 5 },
                            { string: 2, fretOffset: -6, semitones: 9, degree: 6 },
                            { string: 3, fretOffset: -5, semitones: 5, degree: 4 },
                            // 5th-string not played
                            // 6th-string not played
                        ],
                    },
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 9, degree: 6 },
                    { string: 1, fretOffset: 1, semitones: 5, degree: 4 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: 0, semitones: 7, degree: 5 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: 0, semitones: 7, degree: 5 },
                    { string: 2, fretOffset: 2, semitones: 5, degree: 4 },
                    { string: 3, fretOffset: -1, semitones: 9, degree: 6 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
        },
        '1 2 4 5': { // Maj9 from 9th
            'Root': {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 2, degree: 2 },
                    { string: 1, fretOffset: -2, semitones: 7, degree: 5 },
                    { string: 2, fretOffset: 0, semitones: 5, degree: 4 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 5, degree: 4 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: -1, semitones: 7, degree: 5 },
                    { string: 3, fretOffset: -1, semitones: 2, degree: 2 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: -2, semitones: 7, degree: 5 },
                    { string: 1, fretOffset: -2, semitones: 2, degree: 2 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: -2, semitones: 5, degree: 4 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: -2, semitones: 5, degree: 4 },
                    { string: 2, fretOffset: -1, semitones: 2, degree: 2 },
                    { string: 3, fretOffset: -3, semitones: 7, degree: 5 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
        },
        '1 3 4 5': { // 1 2 5 7 from 4th; 
            'Root': {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 4, degree: 3 },
                    { string: 1, fretOffset: -2, semitones: 7, degree: 5 },
                    { string: 2, fretOffset: 0, semitones: 5, degree: 4 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 5, degree: 4 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: -1, semitones: 7, degree: 5 },
                    { string: 3, fretOffset: 1, semitones: 4, degree: 3 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: -2, semitones: 7, degree: 5 },
                    { string: 1, fretOffset: 0, semitones: 4, degree: 3 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: -2, semitones: 5, degree: 4 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: -2, semitones: 5, degree: 4 },
                    { string: 2, fretOffset: 1, semitones: 4, degree: 3 },
                    { string: 3, fretOffset: -3, semitones: 7, degree: 5 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
        },
        '1 4 6 7': { // Maj#11 from 4th
            'Root': {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 3, semitones: 5, degree: 4 },
                    { string: 1, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 2, fretOffset: 4, semitones: 9, degree: 6 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 4, semitones: 9, degree: 6 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: 3, semitones: 11, degree: 7 },
                    { string: 3, fretOffset: 2, semitones: 5, degree: 4 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 1, fretOffset: 1, semitones: 5, degree: 4 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: 2, semitones: 9, degree: 6 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: 2, semitones: 9, degree: 6 },
                    { string: 2, fretOffset: 2, semitones: 5, degree: 4 },
                    { string: 3, fretOffset: 1, semitones: 11, degree: 7 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
        },
        '1 5 6 7': { // Min9 from 6th
            'Root': {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 5, semitones: 7, degree: 5 },
                    { string: 1, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 2, fretOffset: 4, semitones: 9, degree: 6 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 4, semitones: 9, degree: 6 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: 3, semitones: 11, degree: 7 },
                    { string: 3, fretOffset: 4, semitones: 7, degree: 5 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 1, fretOffset: 3, semitones: 7, degree: 5 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: 2, semitones: 9, degree: 6 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: 2, semitones: 9, degree: 6 },
                    { string: 2, fretOffset: 4, semitones: 7, degree: 5 },
                    { string: 3, fretOffset: 1, semitones: 11, degree: 7 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
        },
        '1 2 5 7': { // 1 3 4 5 from 5th
            Root: {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 2, degree: 2 },
                    { string: 1, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 2, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: 3, semitones: 11, degree: 7 },
                    { string: 3, fretOffset: -1, semitones: 2, degree: 2 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 1, fretOffset: -2, semitones: 2, degree: 2 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: 0, semitones: 7, degree: 5 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: 0, semitones: 7, degree: 5 },
                    { string: 2, fretOffset: -1, semitones: 2, degree: 2 },
                    { string: 3, fretOffset: 1, semitones: 11, degree: 7 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
        },
        '1 3 6 7': { // Min9 from 3rd
            Root: {
                name: 'Root',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 4, degree: 3 },
                    { string: 1, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 2, fretOffset: 4, semitones: 9, degree: 6 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '1st Inv.': {
                name: '1st Inv.',
                rootString: 1,
                pattern: [
                    { string: 0, fretOffset: 4, semitones: 9, degree: 6 },
                    { string: 1, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: 3, semitones: 11, degree: 7 },
                    { string: 3, fretOffset: 1, semitones: 4, degree: 3 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '2nd Inv.': {
                name: '2nd Inv.',
                rootString: 2,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 11, degree: 7 },
                    { string: 1, fretOffset: 0, semitones: 4, degree: 3 },
                    { string: 2, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: 2, semitones: 9, degree: 6 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
            '3rd Inv.': {
                name: '3rd Inv.',
                rootString: 0,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: 2, semitones: 9, degree: 6 },
                    { string: 2, fretOffset: 1, semitones: 4, degree: 3 },
                    { string: 3, fretOffset: 1, semitones: 11, degree: 7 },
                    // 5th-string not played
                    // 6th-string not played
                ],
            },
        },
    },
};
