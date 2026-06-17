import { generateNpsPositions } from '@/lib/scaleAlgorithms';
import type { ScaleNote, ScalePosition } from '@/lib/scaleAlgorithms';

export type ScaleEntry = {
    name: string;
    intervals: number[];
    degrees: string[];
    defaultPattern: string;
    positions: ScalePosition[]; // alias for altPatterns[defaultPattern][0]
    // Each pattern key maps to an array of variants: [0] = base, [1] = linked, etc.
    altPatterns: Record<string, ScalePosition[][]>;
};

export type ScaleGroup = Record<string, ScaleEntry>;

// Builds blues box positions from the minor pentatonic 2nps boxes + ♭5 injection.
// Injects ♭5 (degree 3) whenever the 4th (degree 2) is immediately followed by
// the 5th (degree 4) in the note sequence — one rule covers both the same-string
// case (e.g. A string: 4–♭5–5) and the string-crossing case (G string ends on 4,
// B string starts on 5 → ♭5 appended to G string).
// Generic bebop standard-position builder.
// Takes the underlying base scale (without the passing tone), generates 3nps
// positions, re-maps degrees through `degreeMap` to leave a gap at the passing-
// tone slot, then injects the passing tone whenever `injectAfterDeg` is
// immediately followed by `injectBeforeDeg` — same logic and same edge-case
// handling as buildBluesStandard (covers same-string and string-crossing cases).
function buildBebopStandard(
    baseIntervals: number[],
    degreeMap: number[],
    injectAfterDeg: number,
    injectBeforeDeg: number,
    injectSemitone: number,
    injectDegree: number,
): ScalePosition[] {
    return generateNpsPositions(baseIntervals, 3).map(pos => {
        const notes = pos.notes.map(n => ({
            ...n,
            degree: degreeMap[n.degree],
        }));
        const withPassing: ScaleNote[] = [];
        for (let i = 0; i < notes.length; i++) {
            withPassing.push(notes[i]);
            const next = notes[i + 1];
            if (
                notes[i].degree === injectAfterDeg &&
                next?.degree === injectBeforeDeg
            ) {
                withPassing.push({
                    string: notes[i].string,
                    fretOffset: notes[i].fretOffset + 1,
                    semitones: injectSemitone,
                    degree: injectDegree,
                });
            }
        }
        return { ...pos, notes: withPassing };
    });
}

// Jazz Major (add ♭6) — Major scale + chromatic ♭6 passing tone between 5→6.
function buildBebopMajorStandard(): ScalePosition[] {
    // major deg 0–6 → bebop deg, skipping slot 5 (♭6 is the passing tone)
    return buildBebopStandard(
        [0, 2, 4, 5, 7, 9, 11],
        [0, 1, 2, 3, 4, 6, 7],
        4, // inject after 5th  (bebop deg 4)
        6, // inject before 6th (bebop deg 6)
        8, // ♭6 semitone
        5, // bebop degree index for ♭6
    );
}

// Bebop Dominant — Mixolydian + chromatic natural-7 passing tone between ♭7→root.
function buildBebopDominantStandard(): ScalePosition[] {
    // Mixolydian deg 0–6 map straight to bebop degs 0–6; natural 7 is slot 7
    return buildBebopStandard(
        [0, 2, 4, 5, 7, 9, 10],
        [0, 1, 2, 3, 4, 5, 6],
        6, // inject after ♭7   (bebop deg 6)
        0, // inject before root (bebop deg 0, next octave)
        11, // natural 7 semitone
        7, // bebop degree index for natural 7
    );
}

function buildBluesStandard(): ScalePosition[] {
    const pentaToBlues = [0, 1, 2, 4, 5]; // minor penta degree → blues degree index
    return generateNpsPositions([0, 3, 5, 7, 10], 2).map(pos => {
        const notes = pos.notes.map(n => ({
            ...n,
            degree: pentaToBlues[n.degree],
        }));
        const withB5: ScaleNote[] = [];
        for (let i = 0; i < notes.length; i++) {
            withB5.push(notes[i]);
            const next = notes[i + 1];
            if (notes[i].degree === 2 && next?.degree === 4) {
                withB5.push({
                    string: notes[i].string,
                    fretOffset: notes[i].fretOffset + 1,
                    semitones: 6,
                    degree: 3,
                });
            }
        }
        return { ...pos, notes: withB5 };
    });
}

function withModeNames(
    positions: ScalePosition[],
    modeNames?: string[],
): ScalePosition[] {
    if (!modeNames) return positions;
    return positions.map((p, i) => ({ ...p, modeName: modeNames[i] }));
}

function buildScale(
    name: string,
    intervals: number[],
    degrees: string[],
    modeNames?: string[],
    defaultNps: number = 3,
    npsOptions: number[] = [2, 3, 4],
    standardPositions?: ScalePosition[],
    npsOverlaps: Partial<Record<number, number[]>> = {},
): ScaleEntry {
    const generated: Record<string, ScalePosition[][]> = {};
    if (standardPositions) {
        generated['Std.'] = [withModeNames(standardPositions, modeNames)];
    }
    for (const nps of npsOptions) {
        const base = withModeNames(
            generateNpsPositions(intervals, nps),
            modeNames,
        );
        const overlaps = npsOverlaps[nps] ?? [];
        generated[`${nps}nps`] = [
            base,
            ...overlaps.map(ov =>
                withModeNames(
                    generateNpsPositions(
                        intervals,
                        nps,
                        undefined,
                        undefined,
                        ov,
                    ),
                    modeNames,
                ),
            ),
        ];
    }
    const defaultPattern = standardPositions ? 'Std.' : `${defaultNps}nps`;
    return {
        name,
        intervals,
        degrees,
        defaultPattern,
        positions: (generated[defaultPattern] ??
            generated[Object.keys(generated)[0]])[0],
        altPatterns: generated,
    };
}

// ─── Scale library ────────────────────────────────────────────────────────────
//
// Structure: SCALE_SHAPES[noteGroup][scaleName]
// noteGroup keys: '5-note', '6-note', '7-note', '8-note', '9-note'
//
// Groups with empty objects ({}) are reserved placeholders — the UI renders
// them as coming-soon until scales are added.

export const SCALE_SHAPES: Record<string, ScaleGroup> = {
    // ── Symmetrical ───────────────────────────────────────────────────────────
    Symmetrical: {
        Diminished: buildScale(
            'Diminished',
            [0, 2, 3, 5, 6, 8, 9, 11],
            ['1', '2', '♭3', '4', '♭5', '♭6', '6', '7'],
            ['Diminished', 'Dominant (♭9 #9 #11 13)'],
            3,
            [2, 3, 4],
            undefined,
            { 3: [1, -1], 4: [1] },
        ),
        Symmetrical: buildScale(
            'Symmetrical',
            [0, 1, 2, 4, 5, 6, 8, 9, 10],
            ['1', '♭2', '2', '3', '4', '♭5', '♭6', '6', '♭7'],
            undefined,
            3,
            [3, 4],
            undefined,
            { 3: [-1, -2], 4: [1, -1] },
        ),
        'Whole Tone': buildScale(
            'Whole Tone',
            [0, 2, 4, 6, 8, 10],
            ['1', '2', '3', '#4', '#5', '♭7'],
            undefined, // only 2 distinct modes (all positions sound the same)
            3,
            [2, 3],
            undefined,
            { 3: [1] },
        ),
    },

    // ── 5-note ────────────────────────────────────────────────────────────────
    '5-note': {
        Pentatonic: buildScale(
            'Pentatonic',
            [0, 2, 4, 7, 9],
            ['1', '2', '3', '5', '6'],
            undefined,
            2,
            [2, 3],
            undefined,
            { 3: [1] },
        ),
    },

    // ── 6-note ────────────────────────────────────────────────────────────────
    // Common 6-note scales: Whole Tone, Blues, Augmented, Prometheus, …
    '6-note': {
        Blues: buildScale(
            'Blues',
            [0, 3, 5, 6, 7, 10],
            ['1', '♭3', '4', '♭5', '5', '♭7'],
            undefined,
            2,
            [2, 3],
            buildBluesStandard(),
            { 2: [1], 3: [1] },
        ),
    },

    // ── 7-note ────────────────────────────────────────────────────────────────
    '7-note': {
        Major: buildScale(
            'Major',
            [0, 2, 4, 5, 7, 9, 11],
            ['1', '2', '3', '4', '5', '6', '7'],
            [
                'Major (Ionian)',
                'Minor (Dorian)',
                'Phrygian',
                'Lydian',
                'Dominant (Mixolydian)',
                'Natural Minor (Aeolian)',
                'Locrian',
            ],
            3,
            [2, 3, 4],
            undefined,
            { 3: [1, -1], 4: [1, 2] },
        ),
        'Harmonic Minor': buildScale(
            'Harmonic Minor',
            [0, 2, 3, 5, 7, 8, 11],
            ['1', '2', '♭3', '4', '5', '♭6', '7'],
            [
                'Harmonic Minor',
                'Locrian ♮6',
                'Major ♯5',
                'Minor ♯4 (Dorian ♯4)',
                'Phrygian Dominant',
                'Lydian ♯2',
                'Altered Diminished',
            ],
            3,
            [2, 3, 4],
            undefined,
            { 3: [1, -1], 4: [1, 2] },
        ),
        'Melodic Minor': buildScale(
            'Melodic Minor',
            [0, 2, 3, 5, 7, 9, 11],
            ['1', '2', '♭3', '4', '5', '6', '7'],
            [
                'Melodic Minor',
                'Minor ♭2 (Dorian ♭2)',
                'Lydian ♯5',
                'Lydian Dominant',
                'Dominant ♭6 (Mixolydian ♭6)',
                'Locrian ♮2',
                'Altered Dominant',
            ],
            3,
            [2, 3, 4],
            undefined,
            { 3: [1, -1], 4: [1, 2] },
        ),
        'Harmonic Major': buildScale(
            'Harmonic Major',
            [0, 2, 4, 5, 7, 8, 11],
            ['1', '2', '3', '4', '5', '♭6', '7'],
            [
                'Harmonic Major',
                'Minor ♭5 (Dorian ♭5)',
                'Phrygian ♭4',
                'Lydian ♭3',
                'Dominant ♭2 (Mixolydian ♭2)',
                'Lydian ♯2 ♯5',
                'Locrian Diminished',
            ],
            3,
            [2, 3, 4],
            undefined,
            { 3: [1, -1], 4: [1, 2] },
        ),
        'Hungarian Minor': buildScale(
            'Hungarian Minor',
            [0, 2, 3, 6, 7, 8, 11],
            ['1', '2', '♭3', '♯4', '5', '♭6', '7'],
            [
                'Double Harmonic Minor (Hungarian Minor)',
                'Dominant ♭2 ♭5 (Mixolydian ♭2 ♭5)',
                'Major ♯2 ♯5',
                'Locrian Diminished ♭♭3',
                'Double Harmonic Major (Phrygian Maj3 Maj7)',
                'Lydian ♯2 ♯6',
                'Altered Diminished ♮5',
            ],
            3,
            [2, 3, 4],
            undefined,
            { 3: [1, -1], 4: [1, 2] },
        ),
        'Dominant #9': buildScale(
            'Dominant #9',
            [0, 3, 4, 5, 7, 9, 10],
            ['1', '#2', '3', '4', '5', '6', '♭7'],
            undefined,
            3,
            [2, 3],
            undefined,
            { 3: [1, -1] },
        ),
    },

    // ── 8-note ────────────────────────────────────────────────────────────────
    // The algorithm handles any note count; degree spelling still uses the
    // 7-letter diatonic system (% 7), so repeated letter-numbers (e.g. two
    // "3"s for ♭3 and #3) are normal and spell correctly.
    '8-note': {
        'Jazz Major (add ♭6)': buildScale(
            'Jazz Major (add ♭6)',
            [0, 2, 4, 5, 7, 8, 9, 11],
            ['1', '2', '3', '4', '5', '♭6', '6', '7'],
            [
                'Jazz Major (add ♭6)',
                'Minor (add ♭5)',
                'Phrygian (add 3)',
                'Lydian (add ♭3)',
                'Dominant (add ♭2)',
                'Nat. Minor (add 7)',
                'Locrian (add 6)',
            ],
            3,
            [2, 3, 4],
            buildBebopMajorStandard(),
            { 3: [1, -1], 4: [1, 2] },
        ),
        'Jazz Dominant (add ♮7)': buildScale(
            'Jazz Dominant (add ♮7)',
            [0, 2, 4, 5, 7, 9, 10, 11],
            ['1', '2', '3', '4', '5', '6', '♭7', '7'],
            [
                'Jazz Dominant (add ♮7)',
                'Minor (add ♭5)',
                'Phrygian (add 3)',
                'Lydian (add ♭3)',
                'Dominant (add ♭2)',
                'Nat. Minor (add 7)',
                'Locrian (add 6)',
            ],
            3,
            [2, 3, 4],
            buildBebopDominantStandard(),
            { 3: [1, -1], 4: [1, 2] },
        ),
    },

    // ── 9-note ────────────────────────────────────────────────────────────────
    // 9-note (and beyond) scales are common in Slonimsky and bebop theory.
    // Hand-authored positions are strongly recommended for dense scales since
    // NPS patterns cycle 1.5+ times across 6 strings.
    '9-note': {
        'Bebop Dominant': buildScale(
            'Bebop Dominant',
            [0, 2, 4, 5, 7, 9, 10, 11],
            ['1', '2', '3', '4', '5', '6', '♭7', '7'],
            undefined,
            3,
            [2, 3, 4],
            buildBebopDominantStandard(),
            { 3: [1, -1], 4: [1, 2] },
        ),
    },
};
