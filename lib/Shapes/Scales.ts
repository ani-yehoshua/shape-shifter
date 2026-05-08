import { generateNpsPositions } from '@/lib/scaleAlgorithms';
import type { ScalePosition } from '@/lib/scaleAlgorithms';

export type ScaleEntry = {
    name: string;
    intervals: number[];
    degrees: string[];
    positions: ScalePosition[]; // box positions (3nps) — the default view
    altPatterns: {
        '2nps': ScalePosition[];
        '3nps': ScalePosition[]; // same as positions, exposed for symmetry
        '4nps': ScalePosition[];
    };
};

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
): ScaleEntry {
    return {
        name,
        intervals,
        degrees,
        positions: withModeNames(generateNpsPositions(intervals, 3), modeNames),
        altPatterns: {
            '2nps': withModeNames(
                generateNpsPositions(intervals, 2),
                modeNames,
            ),
            '3nps': withModeNames(
                generateNpsPositions(intervals, 3),
                modeNames,
            ),
            '4nps': withModeNames(
                generateNpsPositions(intervals, 4),
                modeNames,
            ),
        },
    };
}

export const SCALE_SHAPES: Record<string, ScaleEntry> = {
    Major: buildScale(
        'Major',
        [0, 2, 4, 5, 7, 9, 11],
        ['1', '2', '3', '4', '5', '6', '7'],
        [
            'Major (Ionian)',
            'Dorian',
            'Phrygian',
            'Lydian',
            'Mixolydian',
            'Minor (Aeolian)',
            'Locrian',
        ],
    ),
    'Harmonic Minor': buildScale(
        'Harmonic Minor',
        [0, 2, 3, 5, 7, 8, 11],
        ['1', '2', 'b3', '4', '5', 'b6', '7'],
        [
            'Harmonic Minor',
            'Locrian ♮6',
            'Major ♯5',
            'Dorian ♯4',
            'Phrygian Dominant',
            'Lydian ♯2',
            'Altered Diminished',
        ],
    ),
    'Melodic Minor': buildScale(
        'Melodic Minor',
        [0, 2, 3, 5, 7, 9, 11],
        ['1', '2', 'b3', '4', '5', '6', '7'],
        [
            'Melodic Minor',
            'Dorian b2',
            'Lydian Augmented',
            'Lydian Dominant',
            'Mixolydian b6',
            'Locrian ♮2',
            'Altered Dominant',
        ],
    ),
    'Harmonic Major': buildScale(
        'Harmonic Major',
        [0, 2, 4, 5, 7, 8, 11],
        ['1', '2', '3', '4', '5', 'b6', '7'],
        [
            'Harmonic Major',
            'Dorian b5',
            'Phrygian b4',
            'Lydian b3',
            'Mixolydian b2',
            'Lydian ♯2 ♯5',
            'Locrian Diminished',
        ],
    ),
    'Pentatonic': buildScale(
        'Pentatonic',
        [0, 2, 4, 7, 9],
        ['1', '2', '3', '5', '6'],
    ),
};
