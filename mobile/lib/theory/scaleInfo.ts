// GENERATED FILE -- do not edit. Source: lib/theory/scaleInfo.ts (the website's lib is the single source).
// Edit that file, then run `npm run sync:mobile` from the repo root.
// "What am I looking at?" for a scale on the fretboard: the notes, the step
// pattern, what the fingering pattern means, and the mode when a position
// starts on a different note of the scale. Worked out from the app's scale
// data; only the notes-per-string wording comes from the glossary.
import { spellNote } from '../MusicTheory';
import type { InfoContent, InfoSection } from './chordInfo';
import { NPS_BLURB } from './glossary';
import { intervalName } from './intervals';

export type ScaleInfoInput = {
    rootNote: string;
    scaleName: string;
    /** semitones above the root for each scale note, e.g. Major = [0,2,4,5,7,9,11] */
    intervals: number[];
    /** degree labels, e.g. ["1","2","♭3",...] (same length as intervals) */
    degrees: string[];
    /** the fingering pattern, e.g. "3nps", "2nps", "Std." */
    pattern?: string;
    /** the mode a position starts on, e.g. "Dorian (2nd mode)" */
    modeName?: string;
    /** 1-based position number when a single position is shown */
    positionNumber?: number;
};

const STEP_NAME: Record<number, string> = { 1: 'H', 2: 'W', 3: 'W+H', 4: 'W+W' };

function stepPattern(intervals: number[]): string {
    const steps = intervals.map((semi, i) => (i === intervals.length - 1 ? 12 : intervals[i + 1]) - semi);
    return steps.map(s => STEP_NAME[s] ?? `${s}`).join(' – ');
}

const degreeNumber = (label: string) => Number(label.replace(/[^0-9]/g, '')) || 1;

export function explainScale(input: ScaleInfoInput): InfoContent {
    const { rootNote, scaleName, intervals, degrees, pattern, modeName, positionNumber } = input;
    const sections: InfoSection[] = [];

    sections.push({
        kind: 'list',
        title: 'The scale',
        intro: `${intervals.length} notes. Step pattern (H = half step, W = whole step): ${stepPattern(intervals)}.`,
        items: intervals.map((semi, i) => {
            const n = degreeNumber(degrees[i]);
            return {
                label: spellNote(rootNote, semi, n),
                value: i === 0 ? 'root' : `${degrees[i]} · ${intervalName(n, semi)}`,
            };
        }),
    });

    const reading: string[] = [];
    if (pattern && NPS_BLURB[pattern]) reading.push(`${pattern}: ${NPS_BLURB[pattern]}`);
    if (modeName) {
        reading.push(
            `This position starts on a different note of the scale, which makes it ${modeName}. The notes are the same; starting from another note changes which one sounds like home.`,
        );
    } else if (positionNumber) {
        reading.push(`Position ${positionNumber} is one place on the neck to play these notes. The other positions use the same notes elsewhere, and they overlap, so together they cover the whole fretboard.`);
    }
    if (reading.length) sections.push({ kind: 'text', title: 'Reading the pattern', paragraphs: reading });

    sections.push({
        kind: 'text',
        title: 'Try this',
        paragraphs: [
            'Switch to Intervals to see each note as a number from the root (1, ♭3, 5 ...). Those numbers are the same in every key.',
            'Change the key: the shape stays put and only its location on the neck moves.',
            'Step through the positions and notice which notes repeat from one position to the next.',
        ],
    });

    return { title: `${rootNote} ${scaleName}`, subtitle: `${intervals.length}-note scale`, sections };
}
