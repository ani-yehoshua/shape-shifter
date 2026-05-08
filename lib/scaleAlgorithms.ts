import { STANDARD_TUNING_SEMITONES } from '@/lib/chordQualities';

export type ScaleNote = {
    string: number;     // 0 = high e, 5 = low E
    fretOffset: number; // relative to root at fret 0 on the lowest string
    semitones: number;  // 0–11 interval from root
    degree: number;     // 0-based index into the scale's intervals array
};

export type ScalePosition = {
    startDegree: number; // which scale degree begins on the lowest string
    modeName?: string;   // e.g. 'Ionian', 'Dorian' — set in Scales.ts, not by the algorithm
    notes: ScaleNote[];
};

/**
 * Generates N-notes-per-string positions for a scale.
 *
 * For nps=3 this coincides with standard "box" positions —
 * the B-string major-third compensation falls out automatically
 * from the tuning arithmetic.
 *
 * For a 7-note scale this produces 7 distinct positions
 * (one per starting scale degree on the lowest string).
 */
export function generateNpsPositions(
    intervals: number[],
    notesPerString: number,
    tuning: number[] = STANDARD_TUNING_SEMITONES,
    numStrings: number = 6,
): ScalePosition[] {
    const numNotes = intervals.length;
    const lowestString = numStrings - 1;
    const lowestTuning = tuning[lowestString];
    const positions: ScalePosition[] = [];

    for (let startDeg = 0; startDeg < numNotes; startDeg++) {
        const notes: ScaleNote[] = [];
        let totalDegIdx = startDeg; // increments continuously across strings

        // Iterate from lowest string to highest
        for (let s = lowestString; s >= 0; s--) {
            const stringDiff = lowestTuning - tuning[s];

            for (let n = 0; n < notesPerString; n++) {
                const deg = totalDegIdx % numNotes;
                const octave = Math.floor(totalDegIdx / numNotes);
                const semitones = intervals[deg];
                const fretOffset = semitones + octave * 12 + stringDiff;

                notes.push({ string: s, fretOffset, semitones, degree: deg });
                totalDegIdx++;
            }
        }

        positions.push({ startDegree: startDeg, notes });
    }

    return positions;
}
