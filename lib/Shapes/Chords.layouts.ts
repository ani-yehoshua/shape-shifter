// The chord library stored as FINGERINGS x CHORD QUALITIES, instead of one
// hand-typed shape per quality. Bootstrapped once from lib/Shapes/Chords.ts by
// scripts/gen-chords-layouts.ts; edit THIS file by hand from now on.
//
// STATUS: format approved, but the apps still read lib/Shapes/Chords.ts (kept
// until you decide it can go). scripts/check-chords-layouts.ts keeps the two
// in step: everything in Chords.ts must be here, and anything extra here is
// reported as "ahead" (shapes you approved by turning a '?' into a number).
//
// Every row is one fingering:
//
//   [rootString, 'string:chordTone@octave ...', [one cell per quality]]
//
//   notes   which chord tone sits on which string ('@1' = an octave up,
//           '@-1' = an octave down). Fret numbers are derived from the
//           chord's intervals, so they aren't stored.
//   cell    n  -> this fingering IS in the library for that quality, as its
//                 n-th shape (1 = the main shape, 2.. = alternates, in the
//                 order the app steps through them today)
//           0  -> not in the library for that quality
//          '?' -> not in the library, but within 5 frets: a candidate to
//                 hand-check. Never used until you change it to a number
//                 (the next free position for that quality), or to 0 if it
//                 isn't playable. Search for '?' to find what's left.
//          'x' -> WAS in Chords.ts for that quality, and was deliberately
//                 removed on review (not playable / replaced). Never used.
//                 scripts/check-chords-layouts.ts accepts a missing shape
//                 only where it is marked 'x', so mark a removal with 'x',
//                 not 0, and the check will tell you if you forget.
//
// At bootstrap 399 fingerings stood in for 1674 hand-typed shapes
// (+ the 5 CAGED shapes, kept as-is), with 98 '?' candidates to review.
//
// buildChordShapes() at the bottom rebuilds the CHORD_SHAPES tree in the same
// shape the app reads today from Chords.ts.
import { CHORD_QUALITIES, toShellQuality } from '@/lib/chordQualities';
import type { ChordQuality } from '@/lib/chordQualities';
import type { ShapeFormula } from '@/lib/fretboardMap';
import { shapeFromLayout } from '@/lib/harmony';

type Cell = number | '?' | 'x';
type Row = [rootString: number, notes: string, cells: Cell[]];

type QualityNode = {
    levelName: string;
    shell?: boolean;
    qualities: string[];
    positions: Record<string, Row[]>;
};
type ParentNode = { levelName: string; options: Record<string, LayoutNode> };
type CagedNode = { levelName: string; options: Record<string, ShapeFormula> };
type LayoutNode = QualityNode | ParentNode | CagedNode;

export const CHORD_LAYOUTS: Record<string, LayoutNode> = {
    CAGED: {
        levelName: 'Positions',
        options: {
            'C': {
                name: 'C Shape',
                rootString: 4,
                pattern: [
                    { string: 0, fretOffset: -3, semitones: 4, degree: 3 },
                    { string: 1, fretOffset: -2, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: -3, semitones: 7, degree: 5 },
                    { string: 3, fretOffset: -1, semitones: 4, degree: 3 },
                    { string: 4, fretOffset: 0, semitones: 0, degree: 1 },
                ],
            },
            'A': {
                name: 'A Shape',
                rootString: 4,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 7, degree: 5 },
                    { string: 1, fretOffset: 2, semitones: 4, degree: 3 },
                    { string: 2, fretOffset: 2, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 4, fretOffset: 0, semitones: 0, degree: 1 },
                ],
            },
            'G': {
                name: 'G Shape',
                rootString: 5,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: -3, semitones: 4, degree: 3 },
                    { string: 2, fretOffset: -3, semitones: 0, degree: 1 },
                    { string: 3, fretOffset: -3, semitones: 7, degree: 5 },
                    { string: 4, fretOffset: -1, semitones: 4, degree: 3 },
                    { string: 5, fretOffset: 0, semitones: 0, degree: 1 },
                ],
            },
            'E': {
                name: 'E Shape',
                rootString: 5,
                pattern: [
                    { string: 0, fretOffset: 0, semitones: 0, degree: 1 },
                    { string: 1, fretOffset: 0, semitones: 7, degree: 5 },
                    { string: 2, fretOffset: 1, semitones: 4, degree: 3 },
                    { string: 3, fretOffset: 2, semitones: 0, degree: 1 },
                    { string: 4, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 5, fretOffset: 0, semitones: 0, degree: 1 },
                ],
            },
            'D': {
                name: 'D Shape',
                rootString: 3,
                pattern: [
                    { string: 0, fretOffset: 2, semitones: 4, degree: 3 },
                    { string: 1, fretOffset: 3, semitones: 0, degree: 1 },
                    { string: 2, fretOffset: 2, semitones: 7, degree: 5 },
                    { string: 3, fretOffset: 0, semitones: 0, degree: 1 },
                ],
            },
        },
    },
    Triads: {
        levelName: 'String Sets',
        options: {
            '1st String Set': {
                levelName: 'Chord Qualities',
                qualities: ['Maj', 'Min', 'Dim', 'Aug'],
                positions: {
                    'Root': [
                        // root  notes           Maj  Min  Dim  Aug
                        [2, '0:5  1:3  2:1',    [  1,   1,   1,   1]],
                        [2, '0:3@1  1:5  2:1',  [  2,   2,   2,   2]],
                    ],
                    '1st Inv.': [
                        // root  notes               Maj  Min  Dim  Aug
                        [0, '0:1  1:5@-1  2:3@-1',  [  1,   1,   1,   1]],
                        [1, '0:5  1:1  2:3@-1',     [  2,   2,   2,   2]],
                    ],
                    '2nd Inv.': [
                        // root  notes               Maj  Min  Dim  Aug
                        [1, '0:3  1:1  2:5@-1',     [  1,   1,   1,   1]],
                        [0, '0:1  1:3@-1  2:5@-2',  [  2,   2,   0,   2]],
                    ],
                },
            },
            '2nd String Set': {
                levelName: 'Chord Qualities',
                qualities: ['Maj', 'Min', 'Dim', 'Aug'],
                positions: {
                    'Root': [
                        // root  notes             Maj  Min  Dim  Aug
                        [3, '1:5  2:3  3:1',      [  1,   1,   1,   1]],
                        [3, '0:3@1  1:5  3:1',    [  2,   2,   2,   3]],
                        [3, '0:3@1  2:5  3:1',    [  3,   3,   3,   4]],
                        [3, '1:3@1  2:5  3:1',    [  4,   4,   4,   5]],
                        [3, '0:5@1  1:3@1  3:1',  [  0,   0,   5,   0]],
                        [3, '0:5  2:3  3:1',      [  0,   0,   0,   2]],
                    ],
                    '1st Inv.': [
                        // root  notes               Maj  Min  Dim  Aug
                        [1, '1:1  2:5@-1  3:3@-1',  [  1,   1,   1,   1]],
                        [0, '0:1  2:5@-1  3:3@-1',  [  2,   2,   2,   2]],
                        [0, '0:1  1:5@-1  3:3@-1',  [  3,   3,   0,   0]],
                        [1, '0:5  1:1  3:3@-1',     [  4,   4,   3,   3]],
                        [2, '0:5  2:1  3:3@-1',     [  5,   5,   4,   4]],
                        [2, '1:5  2:1  3:3@-1',     [  6,   6,   5,   5]],
                        [0, '0:1  1:5@-1  3:3@-2',  [  7,   0,   0,   0]],
                    ],
                    '2nd Inv.': [
                        // root  notes               Maj  Min  Dim  Aug
                        [2, '1:3  2:1  3:5@-1',     [  1,   1,   1,   1]],
                        [2, '0:3  2:1  3:5@-1',     [  2,   2,   2,   2]],
                        [1, '0:3  1:1  3:5@-1',     [  3,   3,   3,   0]],
                        [0, '0:1  1:3@-1  3:5@-2',  [  4,   4,   4,   3]],
                        [0, '0:1  2:3@-1  3:5@-2',  [  5,   5,   5,   4]],
                        [1, '1:1  2:3@-1  3:5@-2',  [  0,   0,   0,   5]],
                    ],
                },
            },
            '3rd String Set': {
                levelName: 'Chord Qualities',
                qualities: ['Maj', 'Min', 'Dim', 'Aug'],
                positions: {
                    'Root': [
                        // root  notes             Maj  Min  Dim  Aug
                        [4, '2:5  3:3  4:1',      [  1,   1,   1,   1]],
                        [4, '0:3@1  2:5  4:1',    [  2,   5,   2,   5]],
                        [4, '0:3@1  3:5  4:1',    [  3,   6,   3,   6]],
                        [4, '1:3@1  2:5  4:1',    [  4,   7,   4,   7]],
                        [4, '1:3@1  3:5  4:1',    [  5,   8,   5,   8]],
                        [4, '2:3@1  3:5  4:1',    [  6,   9,   6,   9]],
                        [4, '0:5@1  3:3  4:1',    [  7,  10,   7,  10]],
                        [4, '0:5@1  1:3@1  4:1',  [  8,  12,   9,  11]],
                        [4, '1:5@1  3:3  4:1',    [  9,  11,   8,   0]],
                        [4, '1:5  3:3  4:1',      [  0,   2,   0,   2]],
                        [4, '1:5  2:3  4:1',      [  0,   3,   0,   3]],
                        [4, '0:3@1  1:5  4:1',    [  0,   4,   0,   4]],
                        [4, '0:5@1  2:3@1  4:1',  [  0,  13,  10,   0]],
                        [4, '1:5@1  2:3@1  4:1',  [  0,  14,  11,  12]],
                    ],
                    '1st Inv.': [
                        // root  notes               Maj  Min  Dim  Aug
                        [2, '2:1  3:5@-1  4:3@-1',  [  1,   1,   1,   1]],
                        [1, '1:1  3:5@-1  4:3@-1',  [  2,   2,   2,   2]],
                        [1, '0:5  1:1  4:3@-1',     [  3,   3,   3,   4]],
                        [2, '0:5  2:1  4:3@-1',     [  4,   4,   4,   5]],
                        [3, '0:5  3:1  4:3@-1',     [  5,   5,   0,   6]],
                        [2, '1:5  2:1  4:3@-1',     [  6,   6,   5,   7]],
                        [3, '1:5  3:1  4:3@-1',     [  7,   7,   6,   8]],
                        [3, '2:5  3:1  4:3@-1',     [  8,   8,   7,   9]],
                        [0, '0:1  3:5@-2  4:3@-2',  [  9,   9,   8,  10]],
                        [0, '0:1  1:5@-1  4:3@-2',  [ 10,  10,   9,  11]],
                        [0, '0:1  2:5@-1  4:3@-2',  [ 11,  11,  10,   0]],
                        [1, '1:1  2:5@-1  4:3@-2',  [ 12,   0,   0,  12]],
                        [1, '1:1  2:5@-1  4:3@-1',  [  0,   0,   0,   3]],
                    ],
                    '2nd Inv.': [
                        // root  notes               Maj  Min  Dim  Aug
                        [3, '2:3  3:1  4:5@-1',     [  1,   1,   1,   1]],
                        [3, '1:3  3:1  4:5@-1',     [  2,   2,   2,   2]],
                        [2, '1:3  2:1  4:5@-1',     [  3,   3,   3,   3]],
                        [0, '0:1  1:3@-1  4:5@-2',  [  4,   4,   4,   4]],
                        [0, '0:1  2:3@-1  4:5@-2',  [  5,   5,   5,   5]],
                        [0, '0:1  3:3@-1  4:5@-2',  [  6,   6,   6,   6]],
                        [1, '1:1  2:3@-1  4:5@-2',  [  7,   7,   7,   7]],
                        [1, '1:1  3:3@-1  4:5@-2',  [  8,   8,   8,   8]],
                        [2, '2:1  3:3@-1  4:5@-2',  [  9,   9,   0,   9]],
                        [3, '0:3@1  3:1  4:5@-1',   [ 10,  10,   9,  10]],
                        [3, '1:3@1  3:1  4:5@-1',   [ 11,  11,   0,   0]],
                        [1, '0:3  1:1  4:5@-2',     [ 12,  12,  10,  11]],
                        [2, '0:3  2:1  4:5@-2',     [ 13,   0,   0,   0]],
                        [2, '1:3  2:1  4:5@-2',     [ 14,   0,   0,  12]],
                    ],
                },
            },
            '4th String Set': {
                levelName: 'Chord Qualities',
                qualities: ['Maj', 'Min', 'Dim', 'Aug'],
                positions: {
                    'Root': [
                        // root  notes             Maj  Min  Dim  Aug
                        [5, '3:5  4:3  5:1',      [  1,   1,   1,   1]],
                        [5, '0:5@1  1:3@1  5:1',  [  2,   2,   2,   3]],
                        [5, '0:5@1  4:3  5:1',    [  3,   3,   3,   4]],
                        [5, '0:5@1  2:3@1  5:1',  [  4,   4,   4,   5]],
                        [5, '1:5@1  4:3  5:1',    [  5,   5,   5,   6]],
                        [5, '2:5@1  4:3  5:1',    [  6,   6,   6,   7]],
                        [5, '1:3@1  3:5  5:1',    [  7,   7,   7,   8]],
                        [5, '1:3@1  4:5  5:1',    [  8,   8,   8,   9]],
                        [5, '2:3@1  3:5  5:1',    [  9,   9,   9,  10]],
                        [5, '2:3@1  4:5  5:1',    [ 10,  10,  10,  11]],
                        [5, '3:3@1  4:5  5:1',    [ 11,  11,  11,  12]],
                        [5, '1:5@1  2:3@1  5:1',  [ 12,  12,  12,  13]],
                        [5, '1:5@1  3:3@1  5:1',  [ 13,  13,  13,   0]],
                        [5, '2:5@1  3:3@1  5:1',  [ 14,  14,  14,   0]],
                        [5, '0:3@2  1:5@1  5:1',  [ 15,  15,  15,  15]],
                        [5, '0:3@2  2:5@1  5:1',  [ 16,  16,  16,  16]],
                        [5, '0:3@2  4:5  5:1',    [ 17,  17,  17,  17]],
                        [5, '0:5@1  3:3  5:1',    [  0,   0,   0,   2]],
                        [5, '0:3@2  3:5  5:1',    [  0,   0,   0,  14]],
                    ],
                    '1st Inv.': [
                        // root  notes               Maj  Min  Dim  Aug
                        [3, '3:1  4:5@-1  5:3@-1',  [  1,   1,   1,   1]],
                        [0, '0:1  1:5@-1  5:3@-2',  [  2,   6,   4,   3]],
                        [0, '0:1  4:5@-2  5:3@-2',  [  3,   7,   5,   4]],
                        [0, '0:1  2:5@-1  5:3@-2',  [  4,   8,   6,   5]],
                        [1, '1:1  4:5@-2  5:3@-2',  [  5,   9,   7,   6]],
                        [2, '2:1  4:5@-2  5:3@-2',  [  6,   0,   0,   7]],
                        [3, '1:5  3:1  5:3@-1',     [  7,  10,   8,   8]],
                        [4, '1:5  4:1  5:3@-1',     [  8,  11,   0,   9]],
                        [3, '2:5  3:1  5:3@-1',     [  9,  12,   9,  10]],
                        [4, '2:5  4:1  5:3@-1',     [ 10,  13,  10,  11]],
                        [4, '3:5  4:1  5:3@-1',     [ 11,  14,  11,  12]],
                        [1, '1:1  2:5@-1  5:3@-2',  [ 12,  15,  12,  13]],
                        [1, '1:1  3:5@-1  5:3@-2',  [ 13,  16,  13,   0]],
                        [2, '2:1  3:5@-1  5:3@-2',  [ 14,  17,  14,   0]],
                        [3, '0:5@1  3:1  5:3@-1',   [ 15,  18,  15,  14]],
                        [1, '0:5  1:1  5:3@-2',     [ 16,  19,  16,  15]],
                        [2, '0:5  2:1  5:3@-2',     [ 17,  20,  17,  16]],
                        [4, '0:5@1  4:1  5:3@-1',   [ 18,  21,  18,  17]],
                        [2, '2:1  4:5@-1  5:3@-1',  [  0,   2,   2,   0]],
                        [2, '2:1  3:5@-1  5:3@-1',  [  0,   3,   0,   0]],
                        [2, '1:5  2:1  5:3@-1',     [  0,   4,   3,   0]],
                        [0, '0:1  3:5@-2  5:3@-2',  [  0,   5,   0,   2]],
                    ],
                    '2nd Inv.': [
                        // root  notes               Maj  Min  Dim  Aug
                        [4, '3:3  4:1  5:5@-1',     [  1,   1,   1,   1]],
                        [4, '2:3  4:1  5:5@-1',     [  2,   2,   0,   0]],
                        [1, '1:1  2:3@-1  5:5@-2',  [  3,   0,   0,   0]],
                        [3, '0:3@1  3:1  5:5@-1',   [  4,   4,   5,   2]],
                        [1, '0:3  1:1  5:5@-2',     [  5,   5,   6,   3]],
                        [4, '0:3@1  4:1  5:5@-1',   [  6,   6,   7,   4]],
                        [2, '0:3  2:1  5:5@-2',     [  7,   7,   8,   5]],
                        [4, '1:3@1  4:1  5:5@-1',   [  8,   8,   9,   6]],
                        [4, '2:3@1  4:1  5:5@-1',   [  9,   9,  10,   7]],
                        [1, '1:1  3:3@-1  5:5@-2',  [ 10,  10,  11,   8]],
                        [1, '1:1  4:3@-1  5:5@-2',  [ 11,  11,  12,   9]],
                        [2, '2:1  3:3@-1  5:5@-2',  [ 12,  12,  13,  10]],
                        [2, '2:1  4:3@-1  5:5@-2',  [ 13,  13,  14,  11]],
                        [3, '3:1  4:3@-1  5:5@-2',  [ 14,  14,   0,  12]],
                        [2, '1:3  2:1  5:5@-2',     [ 15,  15,  15,  13]],
                        [3, '1:3  3:1  5:5@-2',     [ 16,   0,   0,   0]],
                        [0, '0:1  3:3@-2  5:5@-3',  [ 17,  16,   0,  14]],
                        [0, '0:1  1:3@-1  5:5@-3',  [ 18,  17,  16,  15]],
                        [0, '0:1  2:3@-1  5:5@-3',  [  0,  18,  17,  16]],
                        [0, '0:1  4:3@-2  5:5@-3',  [ 19,  19,  18,  17]],
                        [3, '2:3  3:1  5:5@-1',     [  0,   3,   2,   0]],
                        [0, '0:1  2:3@-1  5:5@-2',  [  0,   0,   3,   0]],
                        [0, '0:1  3:3@-1  5:5@-2',  [  0,   0,   4,   0]],
                    ],
                },
            },
        },
    },
    Sevenths: {
        levelName: 'Voicing Types',
        options: {
            'Drop 2': {
                levelName: 'String Sets',
                options: {
                    'High String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [3, '0:3@1  1:7  2:5  3:1',  [   1,    1,    1,      1,      1,     1,    1]],
                            ],
                            '1st Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [1, '0:5  1:1  2:7@-1  3:3@-1',     [   1,    1,    1,      1,      1,     1,    1]],
                                [0, '0:1  1:5@-1  2:7@-2  3:3@-2',  [   2,    2,    2,      0,      0,     2,    0]],
                            ],
                            '2nd Inv.': [
                                // root  notes                   Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [2, '0:7  1:3  2:1  3:5@-1',    [   1,    1,    1,      1,      1,     1,    1]],
                                [2, '0:3@1  1:7  2:1  3:5@-1',  [   0,    2,    0,      0,      0,     0,    0]],
                            ],
                            '3rd Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [0, '0:1  1:5@-1  2:3@-1  3:7@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [1, '0:5  1:1  2:3@-1  3:7@-2',     [   2,    2,    0,      0,      2,     0,    0]],
                            ],
                        },
                    },
                    'Mid String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [4, '1:3@1  2:7  3:5  4:1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [4, '0:3@1  2:7  3:5  4:1',  [   2,    0,    2,      0,      2,     2,    2]],
                                [4, '0:3@1  1:7  3:5  4:1',  [   3,    2,    0,      2,      3,     3,    0]],
                                [4, '0:3@1  1:7  2:5  4:1',  [   4,    3,    0,      3,      4,     4,    0]],
                            ],
                            '1st Inv.': [
                                // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [2, '1:5  2:1  3:7@-1  4:3@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [2, '0:5  2:1  3:7@-1  4:3@-1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [1, '0:5  1:1  2:7@-1  4:3@-1',  [   3,    4,    0,      3,      3,     3,    0]],
                                [1, '0:5  1:1  3:7@-1  4:3@-1',  [   0,    3,    0,      0,      0,     0,    0]],
                            ],
                            '2nd Inv.': [
                                // root  notes                 Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [3, '1:7  2:3  3:1  4:5@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [3, '0:7  2:3  3:1  4:5@-1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [3, '0:7  1:3  3:1  4:5@-1',  [   3,    0,    0,      3,      3,     0,    0]],
                                [2, '0:7  1:3  2:1  4:5@-1',  [   4,    0,    3,      4,      4,     0,    0]],
                            ],
                            '3rd Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [1, '1:1  2:5@-1  3:3@-1  4:7@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [0, '0:1  2:5@-1  3:3@-1  4:7@-2',  [   2,    2,    0,      2,      0,     2,    2]],
                                [0, '0:1  1:5@-1  3:3@-1  4:7@-2',  [   3,    3,    2,      0,      0,     3,    0]],
                                [0, '0:1  1:5@-1  2:3@-1  4:7@-2',  [   0,    4,    3,      0,      0,     4,    0]],
                            ],
                        },
                    },
                    'Low String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [5, '2:3@1  3:7  4:5  5:1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [5, '1:3@1  3:7  4:5  5:1',  [   2,    0,    2,      0,      2,     0,    2]],
                                [5, '1:3@1  2:7  3:5  5:1',  [   0,    0,    3,      0,      3,     3,    0]],
                                [5, '1:3@1  2:7  4:5  5:1',  [   0,    0,    0,      0,      0,     2,    0]],
                            ],
                            '1st Inv.': [
                                // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [3, '2:5  3:1  4:7@-1  5:3@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [3, '1:5  3:1  4:7@-1  5:3@-1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [2, '1:5  2:1  3:7@-1  5:3@-1',  [   0,    0,    0,      3,      0,     3,    0]],
                            ],
                            '2nd Inv.': [
                                // root  notes                 Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [4, '2:7  3:3  4:1  5:5@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [4, '1:7  3:3  4:1  5:5@-1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [3, '1:7  2:3  3:1  5:5@-1',  [   0,    0,    0,      3,      0,     0,    0]],
                            ],
                            '3rd Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [2, '2:1  3:5@-1  4:3@-1  5:7@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [1, '1:1  3:5@-1  4:3@-1  5:7@-2',  [   0,    0,    0,      2,      0,     0,    2]],
                            ],
                        },
                    },
                },
            },
            'Drop 3': {
                levelName: 'String Sets',
                options: {
                    'High String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                  Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [4, '0:5@1  1:3@1  2:7  4:1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [4, '0:5@1  1:3@1  3:7  4:1',  [   0,    2,    2,      0,      0,     2,    2]],
                                [4, '0:5@1  2:3@1  3:7  4:1',  [   2,    3,    0,      0,      0,     3,    2]],
                                [4, '1:5@1  2:3@1  3:7  4:1',  [   0,    4,    0,      0,      2,     0,    0]],
                            ],
                            '1st Inv.': [
                                // root  notes                 Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [2, '0:7  1:5  2:1  4:3@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [3, '0:7  1:5  3:1  4:3@-1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [3, '1:7  2:5  3:1  4:3@-1',  [   4,    0,    3,      4,      4,     3,    0]],
                                [3, '0:7  2:5  3:1  4:3@-1',  [   3,    0,    0,      3,      3,     0,    0]],
                            ],
                            '2nd Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [0, '0:1  1:7@-1  2:3@-1  4:5@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [0, '0:1  1:7@-1  3:3@-1  4:5@-2',  [   2,    2,    2,      2,      2,     2,    2]],
                                [1, '1:1  2:7@-1  3:3@-1  4:5@-2',  [   0,    3,    3,      0,      3,     3,    0]],
                            ],
                            '3rd Inv.': [
                                // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [1, '0:3  1:1  2:5@-1  4:7@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [1, '0:3  1:1  3:5@-1  4:7@-2',  [   2,    0,    0,      2,      0,     2,    2]],
                                [2, '0:3  2:1  3:5@-1  4:7@-2',  [   3,    2,    2,      0,      0,     3,    0]],
                                [2, '1:3  2:1  3:5@-1  4:7@-2',  [   4,    3,    3,      3,      2,     4,    0]],
                            ],
                        },
                    },
                    'Low String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                  Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [5, '1:5@1  2:3@1  3:7  5:1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [5, '0:5@1  2:3@1  3:7  5:1',  [   2,    0,    0,      0,      2,     0,    0]],
                                [5, '0:5@1  1:3@1  3:7  5:1',  [   3,    0,    0,      0,      0,     0,    0]],
                                [5, '1:5@1  2:3@1  4:7  5:1',  [   0,    2,    2,      0,      0,     2,    0]],
                                [5, '1:5@1  3:3@1  4:7  5:1',  [   0,    3,    0,      0,      0,     0,    0]],
                                [5, '2:5@1  3:3@1  4:7  5:1',  [   0,    0,    0,      0,      0,     0,    2]],
                            ],
                            '1st Inv.': [
                                // root  notes                 Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [3, '1:7  2:5  3:1  5:3@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [3, '0:7  2:5  3:1  5:3@-1',  [   2,    0,    0,      0,      2,     2,    0]],
                                [3, '0:7  1:5  3:1  5:3@-1',  [   3,    2,    0,      0,      3,     3,    0]],
                                [4, '1:7  2:5  4:1  5:3@-1',  [   4,    3,    2,      2,      4,     4,    0]],
                                [4, '1:7  3:5  4:1  5:3@-1',  [   5,    4,    0,      3,      5,     0,    0]],
                                [4, '2:7  3:5  4:1  5:3@-1',  [   6,    0,    3,      0,      6,     0,    2]],
                            ],
                            '2nd Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [1, '1:1  2:7@-1  3:3@-1  5:5@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [1, '1:1  2:7@-1  4:3@-1  5:5@-2',  [   2,    2,    0,      2,      2,     2,    0]],
                                [2, '2:1  3:7@-1  4:3@-1  5:5@-2',  [   3,    3,    2,      3,      3,     3,    2]],
                            ],
                            '3rd Inv.': [
                                // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [2, '1:3  2:1  3:5@-1  5:7@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [2, '1:3  2:1  4:5@-1  5:7@-2',  [   2,    0,    2,      2,      2,     0,    0]],
                                [3, '1:3  3:1  4:5@-1  5:7@-2',  [   3,    0,    3,      0,      0,     0,    0]],
                                [3, '2:3  3:1  4:5@-1  5:7@-2',  [   4,    2,    4,      3,      3,     2,    2]],
                            ],
                        },
                    },
                },
            },
            'Drop 2 of 2': {
                levelName: 'String Sets',
                options: {
                    'High String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [4, '0:5@1  2:7  3:3  4:1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [4, '0:5@1  1:7  3:3  4:1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [4, '1:5@1  2:7  3:3  4:1',  [   3,    0,    0,      3,      0,     3,    3]],
                            ],
                            '1st Inv.': [
                                // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [2, '0:7  2:1  3:5@-1  4:3@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [2, '1:7  2:1  3:5@-1  4:3@-1',  [   0,    0,    2,      0,      0,     0,    3]],
                                [1, '0:7  1:1  3:5@-1  4:3@-1',  [   0,    0,    0,      2,      0,     0,    2]],
                            ],
                            '2nd Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [0, '0:1  2:3@-1  3:7@-2  4:5@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [0, '0:1  1:3@-1  3:7@-2  4:5@-2',  [   2,    0,    2,      0,      2,     0,    2]],
                                [1, '1:1  2:3@-1  3:7@-2  4:5@-2',  [   3,    2,    3,      2,      3,     2,    3]],
                            ],
                            '3rd Inv.': [
                                // root  notes                   Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [3, '0:3@1  2:5  3:1  4:7@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [3, '0:3@1  1:5  3:1  4:7@-1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [3, '1:3@1  2:5  3:1  4:7@-1',  [   3,    3,    0,      3,      3,     3,    3]],
                            ],
                        },
                    },
                    'Low String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [5, '1:5@1  3:7  4:3  5:1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [5, '1:5@1  2:7  4:3  5:1',  [   2,    4,    0,      2,      4,     3,    0]],
                                [5, '2:5@1  3:7  4:3  5:1',  [   3,    5,    3,      3,      5,     4,    3]],
                                [5, '0:5@1  3:7  4:3  5:1',  [   0,    2,    0,      0,      2,     2,    0]],
                                [5, '0:5@1  2:7  4:3  5:1',  [   0,    3,    2,      0,      3,     0,    2]],
                            ],
                            '1st Inv.': [
                                // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [3, '1:7  3:1  4:5@-1  5:3@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [3, '0:7  3:1  4:5@-1  5:3@-1',  [   2,    0,    0,      2,      2,     2,    0]],
                                [3, '2:7  3:1  4:5@-1  5:3@-1',  [   3,    2,    2,      0,      3,     3,    3]],
                                [2, '0:7  2:1  4:5@-1  5:3@-1',  [   0,    0,    0,      0,      0,     0,    2]],
                            ],
                            '2nd Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [1, '1:1  3:3@-1  4:7@-2  5:5@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [2, '2:1  3:3@-1  4:7@-2  5:5@-2',  [   2,    2,    2,      3,      2,     2,    3]],
                                [0, '0:1  2:3@-1  4:7@-2  5:5@-2',  [   0,    0,    0,      2,      0,     0,    2]],
                            ],
                            '3rd Inv.': [
                                // root  notes                   Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [4, '1:3@1  3:5  4:1  5:7@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [4, '0:3@1  2:5  4:1  5:7@-1',  [   2,    0,    2,      0,      0,     0,    2]],
                                [4, '2:3@1  3:5  4:1  5:7@-1',  [   0,    2,    3,      2,      2,     2,    3]],
                            ],
                        },
                    },
                },
            },
            'Drop 3 of 2': {
                levelName: 'String Sets',
                options: {
                    'High String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                  Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [4, '0:7@1  1:3@1  3:5  4:1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [4, '0:7@1  1:3@1  2:5  4:1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [4, '0:7@1  2:3@1  3:5  4:1',  [   3,    3,    3,      3,      3,     3,    3]],
                            ],
                            '1st Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [0, '0:1  1:5@-1  3:7@-2  4:3@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [0, '0:1  1:5@-1  2:7@-2  4:3@-2',  [   2,    2,    2,      2,      2,     2,    2]],
                                [0, '0:1  2:5@-1  3:7@-2  4:3@-2',  [   3,    0,    0,      3,      0,     3,    3]],
                                [1, '1:1  2:5@-1  3:7@-2  4:3@-2',  [   0,    0,    0,      0,      3,     0,    0]],
                            ],
                            '2nd Inv.': [
                                // root  notes                   Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [3, '0:3@1  1:7  3:1  4:5@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [3, '0:3@1  2:7  3:1  4:5@-1',  [   2,    3,    2,      0,      2,     2,    3]],
                                [2, '0:3@1  1:7  2:1  4:5@-1',  [   0,    2,    0,      2,      0,     0,    2]],
                                [3, '1:3@1  2:7  3:1  4:5@-1',  [   0,    4,    0,      0,      0,     3,    0]],
                            ],
                            '3rd Inv.': [
                                // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [1, '0:5  1:1  3:3@-1  4:7@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [2, '0:5  2:1  3:3@-1  4:7@-2',  [   2,    2,    2,      2,      2,     2,    3]],
                                [2, '1:5  2:1  3:3@-1  4:7@-2',  [   3,    3,    0,      3,      3,     0,    0]],
                                [1, '0:5  1:1  2:3@-1  4:7@-2',  [   0,    0,    0,      0,      0,     0,    2]],
                            ],
                        },
                    },
                    'Low String Set': {
                        levelName: 'Chord Qualities',
                        qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                        positions: {
                            'Root': [
                                // root  notes                  Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [5, '1:7@1  2:3@1  4:5  5:1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [5, '0:7@1  2:3@1  4:5  5:1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [5, '0:7@1  1:3@1  4:5  5:1',  [   3,    3,    3,      3,      0,     3,    0]],
                                [5, '0:7@1  1:3@1  3:5  5:1',  [   4,    4,    4,      4,      3,     4,    3]],
                                [5, '0:7@1  2:3@1  3:5  5:1',  [   5,    5,    5,      5,      4,     5,    0]],
                                [5, '1:7@1  2:3@1  3:5  5:1',  [   6,    6,    6,      0,      5,     0,    0]],
                                [5, '1:7@1  3:3@1  4:5  5:1',  [   0,    7,    7,      6,      6,     6,    4]],
                            ],
                            '1st Inv.': [
                                // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [1, '1:1  2:5@-1  4:7@-2  5:3@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [0, '0:1  1:5@-1  4:7@-2  5:3@-2',  [   2,    3,    2,      0,      0,     3,    0]],
                                [0, '0:1  1:5@-1  3:7@-2  5:3@-2',  [   3,    4,    3,      0,      2,     4,    3]],
                                [0, '0:1  2:5@-1  3:7@-2  5:3@-2',  [   4,    5,    4,      3,      3,     5,    0]],
                                [1, '1:1  2:5@-1  3:7@-2  5:3@-2',  [   5,    6,    0,      4,      4,     6,    0]],
                                [1, '1:1  3:5@-1  4:7@-2  5:3@-2',  [   6,    7,    5,      5,      0,     7,    4]],
                                [2, '2:1  3:5@-1  4:7@-2  5:3@-2',  [   7,    8,    6,      0,      0,     8,    0]],
                                [0, '0:1  2:5@-1  4:7@-2  5:3@-2',  [   0,    2,    0,      2,      0,     2,    2]],
                            ],
                            '2nd Inv.': [
                                // root  notes                   Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [4, '1:3@1  2:7  4:1  5:5@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                                [4, '0:3@1  2:7  4:1  5:5@-1',  [   2,    2,    2,      2,      2,     2,    2]],
                                [4, '0:3@1  1:7  4:1  5:5@-1',  [   3,    3,    3,      3,      3,     3,    0]],
                                [4, '1:3@1  3:7  4:1  5:5@-1',  [   4,    4,    4,      0,      0,     6,    4]],
                                [4, '2:3@1  3:7  4:1  5:5@-1',  [   5,    5,    5,      0,      0,     7,    0]],
                                [3, '0:3@1  1:7  3:1  5:5@-1',  [   0,    0,    0,      4,      0,     4,    3]],
                                [3, '1:3@1  2:7  3:1  5:5@-1',  [   0,    0,    0,      0,      0,     5,    0]],
                            ],
                            '3rd Inv.': [
                                // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                                [2, '1:5  2:1  4:3@-1  5:7@-2',  [   1,    1,    1,      1,      1,     1,    1]],
                                [2, '0:5  2:1  4:3@-1  5:7@-2',  [   2,    2,    2,      2,      2,     2,    2]],
                                [2, '1:5  2:1  3:3@-1  5:7@-2',  [   3,    6,    4,      0,      0,     6,    0]],
                                [3, '1:5  3:1  4:3@-1  5:7@-2',  [   4,    7,    5,      3,      3,     7,    4]],
                                [3, '2:5  3:1  4:3@-1  5:7@-2',  [   5,    8,    0,      4,      4,     0,    0]],
                                [1, '0:5  1:1  4:3@-1  5:7@-2',  [   0,    3,    0,      0,      0,     3,    0]],
                                [1, '0:5  1:1  3:3@-1  5:7@-2',  [   0,    4,    0,      0,      0,     4,    3]],
                                [2, '0:5  2:1  3:3@-1  5:7@-2',  [   0,    5,    3,      0,      0,     5,    0]],
                            ],
                        },
                    },
                },
            },
            'Raise 3/1 of 2': {
                levelName: 'Chord Qualities',
                qualities: ['Maj7', 'Min7', 'Dom7', 'Min7b5', 'Maj7#5', 'mMaj7', 'Dim7'],
                positions: {
                    'Root': [
                        // root  notes                  Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                        [5, '0:3@2  1:5@1  3:7  5:1',  [   1,    1,    1,      1,      1,     1,    1]],
                        [5, '0:3@2  2:5@1  3:7  5:1',  [   2,    2,    2,      2,      0,     2,    2]],
                    ],
                    '1st Inv.': [
                        // root  notes                   Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                        [3, '0:5@1  1:7  3:1  5:3@-1',  [   1,    1,    1,      1,      1,     1,    1]],
                        [4, '0:5@1  1:7  4:1  5:3@-1',  [   2,    2,    2,      2,      3,     2,    0]],
                        [4, '0:5@1  2:7  4:1  5:3@-1',  [   0,    3,    4,    'x',      4,     0,    0]],
                        [3, '0:5@1  2:7  3:1  5:3@-1',  [   0,    0,    3,      3,      2,     0,    2]],
                    ],
                    '2nd Inv.': [
                        // root  notes                    Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                        [2, '0:7  2:1  3:3@-1  5:5@-2',  [   1,    3,    1,      2,      1,     3,    2]],
                        [2, '0:7  2:1  4:3@-1  5:5@-2',  [   2,    4,    2,      3,      2,     4,    0]],
                        [1, '0:7  1:1  3:3@-1  5:5@-2',  [   0,    1,    0,      1,      0,     1,    1]],
                        [1, '0:7  1:1  4:3@-1  5:5@-2',  [   0,    2,    0,      0,      0,     2,    0]],
                        [3, '0:7  3:1  4:3@-1  5:5@-2',  [   0,    0,    0,      0,      0,     5,    0]],
                    ],
                    '3rd Inv.': [
                        // root  notes                       Maj7  Min7  Dom7  Min7b5  Maj7#5  mMaj7  Dim7
                        [0, '0:1  1:3@-1  3:5@-2  5:7@-3',  [   1,    1,    1,      1,      1,     1,    1]],
                        [0, '0:1  1:3@-1  4:5@-2  5:7@-3',  [   2,    0,    2,      2,      0,     0,    0]],
                        [0, '0:1  2:3@-1  3:5@-2  5:7@-3',  [   3,    2,    3,      3,      2,     2,    2]],
                        [0, '0:1  2:3@-1  4:5@-2  5:7@-3',  [   4,    0,    4,      4,      3,     3,    0]],
                        [1, '1:1  2:3@-1  4:5@-2  5:7@-3',  [   5,    0,    0,      0,      4,     0,    0]],
                        [1, '1:1  3:3@-1  4:5@-2  5:7@-3',  [   0,    0,    0,      0,      0,     4,    0]],
                    ],
                },
            },
        },
    },
    Shells: {
        levelName: 'String Sets',
        options: {
            '1st String Set': {
                levelName: 'Chord Qualities',
                shell: true,
                qualities: ['Maj7', 'Min7', 'Dom7', 'mMaj7', 'Dim7'],
                positions: {
                    'Root': [
                        // root  notes           Maj7  Min7  Dom7  mMaj7  Dim7
                        [2, '0:7  1:3  2:1',    [   1,    1,    1,     1,    1]],
                        [2, '0:3@1  1:7  2:1',  [   0,    2,    0,     0,    2]],
                    ],
                    '1st Inv.': [
                        // root  notes               Maj7  Min7  Dom7  mMaj7  Dim7
                        [0, '0:1  1:7@-1  2:3@-1',  [   1,    1,    1,     1,    1]],
                    ],
                    '2nd Inv.': [
                        // root  notes               Maj7  Min7  Dom7  mMaj7  Dim7
                        [1, '0:3  1:1  2:7@-1',     [   1,    1,    1,     1,    1]],
                        [0, '0:1  1:3@-1  2:7@-2',  [   2,    2,    2,     2,    2]],
                    ],
                },
            },
            '2nd String Set': {
                levelName: 'Chord Qualities',
                shell: true,
                qualities: ['Maj7', 'Min7', 'Dom7', 'mMaj7', 'Dim7'],
                positions: {
                    'Root': [
                        // root  notes           Maj7  Min7  Dom7  mMaj7  Dim7
                        [3, '1:7  2:3  3:1',    [   1,    1,    1,     1,    1]],
                        [3, '0:7  2:3  3:1',    [   2,    2,    2,     2,    2]],
                        [3, '0:7  1:3  3:1',    [   3,    3,    3,     0,    3]],
                        [3, '0:3@1  1:7  3:1',  [   4,    4,    4,     3,    4]],
                        [3, '0:3@1  2:7  3:1',  [   5,    5,    5,     4,    5]],
                        [3, '1:3@1  2:7  3:1',  [   0,    6,    6,     5,    6]],
                    ],
                    '1st Inv.': [
                        // root  notes               Maj7  Min7  Dom7  mMaj7  Dim7
                        [1, '1:1  2:7@-1  3:3@-1',  [   1,    1,    1,     1,    1]],
                        [0, '0:1  1:7@-1  3:3@-1',  [   2,    3,    2,     2,    3]],
                        [1, '0:7  1:1  3:3@-1',     [   3,    4,    3,     3,    4]],
                        [2, '0:7  2:1  3:3@-1',     [   4,    5,    4,     4,    5]],
                        [0, '0:1  2:7@-1  3:3@-1',  [   0,    2,    0,     0,    2]],
                    ],
                    '2nd Inv.': [
                        // root  notes               Maj7  Min7  Dom7  mMaj7  Dim7
                        [2, '1:3  2:1  3:7@-1',     [   1,    1,    1,     1,    1]],
                        [0, '0:1  1:3@-1  3:7@-2',  [   2,    2,    2,     2,    2]],
                        [0, '0:1  2:3@-1  3:7@-2',  [   3,    3,    3,     3,    3]],
                        [1, '1:1  2:3@-1  3:7@-2',  [   4,    4,    4,     4,    0]],
                        [1, '0:3  1:1  3:7@-2',     [   5,    5,    5,     5,    0]],
                    ],
                },
            },
            '3rd String Set': {
                levelName: 'Chord Qualities',
                shell: true,
                qualities: ['Maj7', 'Min7', 'Dom7', 'mMaj7', 'Dim7'],
                positions: {
                    'Root': [
                        // root  notes             Maj7  Min7  Dom7  mMaj7  Dim7
                        [4, '2:7  3:3  4:1',      [   1,    1,    1,     1,    1]],
                        [4, '1:7  3:3  4:1',      [   2,    2,    2,     2,    2]],
                        [4, '1:7  2:3  4:1',      [   3,    3,    3,     0,    0]],
                        [4, '0:3@1  1:7  4:1',    [   4,    4,    4,     3,    3]],
                        [4, '0:3@1  2:7  4:1',    [   5,    5,    5,     4,    4]],
                        [4, '1:3@1  2:7  4:1',    [   6,    6,    6,     5,    5]],
                        [4, '1:3@1  3:7  4:1',    [   7,    7,    7,     6,    6]],
                        [4, '2:3@1  3:7  4:1',    [   8,    8,    8,     7,    7]],
                        [4, '0:7@1  3:3  4:1',    [   9,    9,    9,     8,    8]],
                        [4, '0:7@1  1:3@1  4:1',  [  10,   10,   10,     9,    9]],
                        [4, '0:7@1  2:3@1  4:1',  [  11,   11,   11,    10,   10]],
                    ],
                    '1st Inv.': [
                        // root  notes               Maj7  Min7  Dom7  mMaj7  Dim7
                        [2, '2:1  3:7@-1  4:3@-1',  [   1,    1,    1,     1,    1]],
                        [1, '1:1  2:7@-1  4:3@-1',  [   2,    2,    2,     2,    3]],
                        [1, '0:7  1:1  4:3@-1',     [   3,    3,    3,     3,    4]],
                        [2, '0:7  2:1  4:3@-1',     [   4,    4,    4,     4,    5]],
                        [3, '0:7  3:1  4:3@-1',     [   5,    5,    5,     5,    6]],
                        [2, '1:7  2:1  4:3@-1',     [   6,    6,    6,     6,    7]],
                        [3, '1:7  3:1  4:3@-1',     [   7,    7,    7,     7,    8]],
                        [0, '0:1  3:7@-2  4:3@-2',  [   8,    8,    8,     8,    9]],
                        [0, '0:1  1:7@-1  4:3@-2',  [   9,    9,    9,     9,   10]],
                        [1, '1:1  3:7@-2  4:3@-2',  [  10,   10,   10,    10,    0]],
                        [1, '1:1  3:7@-1  4:3@-1',  [   0,    0,    0,     0,    2]],
                    ],
                    '2nd Inv.': [
                        // root  notes               Maj7  Min7  Dom7  mMaj7  Dim7
                        [3, '2:3  3:1  4:7@-1',     [   1,    1,    1,     1,    1]],
                        [0, '0:1  3:3@-1  4:7@-2',  [   2,    3,    3,     3,    3]],
                        [1, '1:1  2:3@-1  4:7@-2',  [   3,    4,    4,     4,    4]],
                        [1, '1:1  3:3@-1  4:7@-2',  [   4,    5,    5,     5,    5]],
                        [2, '2:1  3:3@-1  4:7@-2',  [   5,    6,    6,     6,    6]],
                        [3, '0:3@1  3:1  4:7@-1',   [   6,    7,    7,     7,   10]],
                        [1, '0:3  1:1  4:7@-2',     [   7,    9,    8,     8,    7]],
                        [2, '0:3  2:1  4:7@-2',     [   8,   10,    9,     9,    8]],
                        [2, '1:3  2:1  4:7@-2',     [   9,   11,   10,    10,    9]],
                        [0, '0:1  1:3@-1  4:7@-3',  [  10,   12,   11,    11,    0]],
                        [0, '0:1  2:3@-1  4:7@-2',  [   0,    2,    2,     2,    2]],
                        [3, '1:3@1  3:1  4:7@-1',   [   0,    8,    0,     0,   11]],
                    ],
                },
            },
            '4th String Set': {
                levelName: 'Chord Qualities',
                shell: true,
                qualities: ['Maj7', 'Min7', 'Dom7', 'mMaj7', 'Dim7'],
                positions: {
                    'Root': [
                        // root  notes             Maj7  Min7  Dom7  mMaj7  Dim7
                        [5, '3:7  4:3  5:1',      [   1,    1,    1,     1,    1]],
                        [5, '2:7  4:3  5:1',      [   2,    2,    2,     2,    0]],
                        [5, '2:7  3:3  5:1',      [   3,    0,    3,     3,    0]],
                        [5, '1:3@1  2:7  5:1',    [   4,    3,    4,     4,    0]],
                        [5, '1:3@1  3:7  5:1',    [   5,    4,    5,     5,    6]],
                        [5, '2:3@1  3:7  5:1',    [   6,    5,    6,     6,    7]],
                        [5, '3:3@1  4:7  5:1',    [   7,    7,    8,     8,   10]],
                        [5, '0:7@1  1:3@1  5:1',  [   8,    8,    9,     9,    2]],
                        [5, '0:7@1  2:3@1  5:1',  [   9,    9,   10,    10,    3]],
                        [5, '1:7@1  2:3@1  5:1',  [  10,   10,   11,    11,   11]],
                        [5, '1:7@1  3:3@1  5:1',  [  11,   11,   12,    12,   12]],
                        [5, '0:7@1  4:3  5:1',    [  12,   12,   13,    13,    4]],
                        [5, '1:7@1  4:3  5:1',    [  13,   13,   14,    14,    5]],
                        [5, '0:3@2  3:7  5:1',    [  14,   14,   15,    15,    8]],
                        [5, '0:3@2  1:7@1  5:1',  [  15,   15,   16,    16,   14]],
                        [5, '2:3@1  4:7  5:1',    [   0,    6,    7,     7,    9]],
                        [5, '2:7@1  3:3@1  5:1',  [   0,    0,    0,     0,   13]],
                        [5, '0:3@2  2:7@1  5:1',  [   0,    0,    0,     0,   15]],
                        [5, '0:3@2  4:7  5:1',    [   0,    0,    0,     0,   16]],
                    ],
                    '1st Inv.': [
                        // root  notes               Maj7  Min7  Dom7  mMaj7  Dim7
                        [3, '3:1  4:7@-1  5:3@-1',  [   1,    1,    1,     1,    1]],
                        [0, '0:1  3:7@-2  5:3@-2',  [   2,    3,    2,     3,    3]],
                        [0, '0:1  1:7@-1  5:3@-2',  [   3,    4,    3,     4,    5]],
                        [1, '1:1  3:7@-2  5:3@-2',  [   4,    5,    4,     5,    4]],
                        [1, '1:1  4:7@-2  5:3@-2',  [   5,    7,    6,     6,    8]],
                        [1, '1:1  2:7@-1  5:3@-2',  [   6,    8,    7,     7,   14]],
                        [2, '2:1  4:7@-2  5:3@-2',  [   7,    9,    8,     8,    9]],
                        [3, '0:7  3:1  5:3@-1',     [   8,   10,    9,     9,    0]],
                        [3, '1:7  3:1  5:3@-1',     [   9,   11,   10,    10,   10]],
                        [3, '2:7  3:1  5:3@-1',     [  10,   12,   11,    11,   11]],
                        [4, '1:7  4:1  5:3@-1',     [  11,   13,   12,    12,   12]],
                        [2, '1:7@-1  2:1  5:3@-2',  [  12,    0,   13,     0,    0]],
                        [4, '2:7  4:1  5:3@-1',     [  13,   14,   14,    13,   13]],
                        [2, '2:1  3:7@-1  5:3@-1',  [   0,    2,    0,     2,    2]],
                        [4, '0:7@1  4:1  5:3@-1',   [   0,   15,    0,     0,   17]],
                        [1, '0:7  1:1  5:3@-2',     [   0,   16,    0,     0,   15]],
                        [0, '0:1  4:7@-2  5:3@-2',  [   0,    6,    5,     0,    6]],
                        [0, '0:1  2:7@-1  5:3@-2',  [   0,    0,    0,     0,    7]],
                        [2, '0:7  2:1  5:3@-2',     [   0,    0,    0,     0,   16]],
                    ],
                    '2nd Inv.': [
                        // root  notes               Maj7  Min7  Dom7  mMaj7  Dim7
                        [4, '3:3  4:1  5:7@-1',     [   1,    1,    1,     1,    1]],
                        [1, '1:1  3:3@-1  5:7@-2',  [   2,    2,    2,     2,    6]],
                        [2, '2:1  3:3@-1  5:7@-2',  [   3,    4,    3,     3,    8]],
                        [1, '1:1  4:3@-1  5:7@-2',  [   4,    3,    4,     4,    7]],
                        [2, '2:1  4:3@-1  5:7@-2',  [   5,    5,    5,     5,    9]],
                        [3, '3:1  4:3@-1  5:7@-2',  [   6,    6,    6,     6,   10]],
                        [4, '1:3@1  4:1  5:7@-1',   [   7,    7,    7,     7,    4]],
                        [4, '2:3@1  4:1  5:7@-1',   [   8,    8,    8,     8,    5]],
                        [2, '1:3  2:1  5:7@-2',     [   9,    9,    9,     9,   11]],
                        [3, '1:3  3:1  5:7@-2',     [  10,   10,   10,    10,   12]],
                        [3, '2:3  3:1  5:7@-2',     [  11,   11,   11,    11,   13]],
                        [3, '0:3@1  3:1  5:7@-2',   [  12,   12,   12,    12,    0]],
                        [0, '0:1  1:3@-1  5:7@-3',  [  13,   13,   13,    13,   14]],
                        [0, '0:1  2:3@-1  5:7@-3',  [  14,   14,   14,    14,   15]],
                        [1, '1:1  2:3@-1  5:7@-3',  [  15,    0,    0,     0,    0]],
                        [0, '0:1  4:3@-2  5:7@-3',  [  16,   15,   15,    15,   16]],
                        [1, '1:1  4:3@-2  5:7@-3',  [  17,    0,    0,     0,    0]],
                        [1, '0:3  1:1  5:7@-2',     [   0,    0,    0,     0,    2]],
                        [4, '0:3@1  4:1  5:7@-1',   [   0,    0,    0,     0,    3]],
                    ],
                },
            },
        },
    },
};

// ── Rebuild the tree the app reads ─────────────────────────────────────────────
// The shape of this result is identical to CHORD_SHAPES in Chords.ts, so
// nothing that consumes the library has to change.
export type BuiltNode = { levelName: string; options: Record<string, BuiltNode | ShapeFormula> };

function parseNotes(text: string, quality: ChordQuality) {
    return text.trim().split(/\s+/).map(tok => {
        const [string, rest] = tok.split(':');
        const [degree, octave] = rest.split('@');
        return {
            string: Number(string),
            slot: quality.degrees.indexOf(Number(degree)),
            octave: octave ? Number(octave) : 0,
        };
    });
}

function buildQualityNode(node: QualityNode): BuiltNode {
    const options: Record<string, BuiltNode | ShapeFormula> = {};
    node.qualities.forEach((qualityKey, qi) => {
        const quality = node.shell
            ? toShellQuality(CHORD_QUALITIES[qualityKey])
            : CHORD_QUALITIES[qualityKey];
        const positions: Record<string, ShapeFormula> = {};
        for (const [inversion, rows] of Object.entries(node.positions)) {
            // keep only the fingerings this quality actually has, in its own order
            const shapes = rows
                .filter(r => typeof r[2][qi] === 'number' && r[2][qi] > 0)
                .sort((a, b) => (a[2][qi] as number) - (b[2][qi] as number))
                .map(([rootString, notes]) =>
                    shapeFromLayout({ rootString, notes: parseNotes(notes, quality) }, quality),
                );
            if (!shapes.length) continue; // nothing approved for this quality / position
            const [primary, ...alts] = shapes;
            positions[inversion] = {
                name: inversion,
                rootString: primary.rootString,
                pattern: primary.pattern,
                ...(alts.length ? { altShapes: alts } : {}),
            };
        }
        options[qualityKey] = { levelName: 'Positions', options: positions };
    });
    return { levelName: node.levelName, options };
}

function buildNode(node: LayoutNode): BuiltNode {
    if ('qualities' in node) return buildQualityNode(node);
    const options: Record<string, BuiltNode | ShapeFormula> = {};
    for (const [key, child] of Object.entries(node.options)) {
        // CAGED's children are already finished shapes
        options[key] = 'pattern' in child ? child : buildNode(child as LayoutNode);
    }
    return { levelName: node.levelName, options };
}

export function buildChordShapes(): Record<string, BuiltNode> {
    return Object.fromEntries(
        Object.entries(CHORD_LAYOUTS).map(([family, node]) => [family, buildNode(node)]),
    );
}

/**
 * The shapes marked 'x' (in Chords.ts, deliberately removed on review), keyed
 * by their place in the tree: "Sevenths > Drop 2 > Mid String Set > Min7b5 > Root".
 * Used by scripts/check-chords-layouts.ts to tell a deliberate removal from a
 * shape that went missing by accident.
 */
export function removedChordShapes(): Record<string, ShapeFormula[]> {
    const out: Record<string, ShapeFormula[]> = {};
    const walk = (node: LayoutNode, path: string[]) => {
        if ('qualities' in node) {
            node.qualities.forEach((qualityKey, qi) => {
                const quality = node.shell
                    ? toShellQuality(CHORD_QUALITIES[qualityKey])
                    : CHORD_QUALITIES[qualityKey];
                for (const [inversion, rows] of Object.entries(node.positions)) {
                    const removed = rows
                        .filter(r => r[2][qi] === 'x')
                        .map(([rootString, notes]) =>
                            shapeFromLayout({ rootString, notes: parseNotes(notes, quality) }, quality),
                        );
                    if (removed.length) out[[...path, qualityKey, inversion].join(' > ')] = removed;
                }
            });
        } else {
            for (const [key, child] of Object.entries(node.options)) {
                if (!('pattern' in child)) walk(child as LayoutNode, [...path, key]);
            }
        }
    };
    for (const [family, node] of Object.entries(CHORD_LAYOUTS)) walk(node, [family]);
    return out;
}
