// GENERATED FILE -- do not edit. Source: lib/theory/intervals.ts (the website's lib is the single source).
// Edit that file, then run `npm run sync:mobile` from the repo root.
// Names and small formatting helpers shared by the chord and scale info.
import { MAJOR_SCALE_OFFSETS } from '../MusicTheory';

const wrap12 = (n: number) => ((n % 12) + 12) % 12;

/** Signed distance between two semitone values on the 12-note circle, in -6..5. */
function diff12(actual: number, expected: number): number {
    let d = wrap12(actual - expected);
    if (d > 6) d -= 12;
    return d;
}

/**
 * "major 3rd", "perfect 5th", "minor 7th", ... for a chord/scale degree and
 * its size in semitones above the root.
 */
export function intervalName(degree: number, semitones: number): string {
    if (degree === 1 && wrap12(semitones) === 0) return 'root';
    const simple = ((degree - 1) % 7) + 1;
    const d = diff12(semitones, MAJOR_SCALE_OFFSETS[simple]);
    const perfect = simple === 1 || simple === 4 || simple === 5;
    const quality = perfect
        ? ({ 0: 'perfect', [-1]: 'diminished', 1: 'augmented' } as Record<number, string>)[d]
        : ({ 0: 'major', [-1]: 'minor', [-2]: 'diminished', 1: 'augmented' } as Record<number, string>)[d];
    return `${quality ?? (d < 0 ? 'lowered' : 'raised')} ${ordinal(degree)}`;
}

export function ordinal(n: number): string {
    if (n === 1) return 'root';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** "1st string (high E)", "6th string (low E)". String 0 is the highest string. */
export function stringName(index: number, tuningNotes: string[]): string {
    const last = tuningNotes.length - 1;
    const note = tuningNotes[index];
    const sameEnds = tuningNotes[0] === tuningNotes[last];
    const label = sameEnds && index === 0 ? `high ${note}` : sameEnds && index === last ? `low ${note}` : note;
    return `${index + 1}${['st', 'nd', 'rd'][index] ?? 'th'} string (${label})`;
}

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** A key (tonic) name for a semitone 0-11, e.g. 7 -> "G". */
export const keyName = (semitone: number): string => KEY_NAMES[wrap12(semitone)];
