/**
 * Checks the scale data in lib/Shapes/Scales.ts for the slips that made Draw
 * Mode spell a scale wrongly:
 *  - every scale lists one degree label per interval (a missing label shifts
 *    the spelling of every note after it)
 *  - every named mode starts on the same note in the Std. pattern as in each
 *    N-notes-per-string pattern (names must not drift off their positions
 *    around an added note)
 *  - the "Major (add b5, b7)" mode of the 9-note Jazz Dominant matches in Draw Mode
 *    and is spelled C D E F Gb G A Bb B
 *
 * Run:  npx tsx scripts/validate-scales.ts
 * Exits 1 if anything is wrong.
 */
import { SCALE_SHAPES } from '../lib/Shapes/Scales.js';
import { CHORD_SHAPES } from '../lib/Shapes/Chords.js';
import { generateFretboardMap } from '../lib/fretboardMap.js';
import { findDrawMatches, shapeForMatch, summarizeDrawn } from '../lib/drawMatches.js';
import { spellNote } from '../lib/MusicTheory.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
let failed = false;
const check = (ok: boolean, msg: string) => {
    if (!ok) {
        failed = true;
        console.error(`  FAIL ${msg}`);
    }
};

let scales = 0;
for (const [group, entries] of Object.entries<any>(SCALE_SHAPES as any)) {
    for (const [name, e] of Object.entries<any>(entries)) {
        scales++;
        check(e.degrees.length === e.intervals.length, `${group} | ${name}: ${e.intervals.length} intervals but ${e.degrees.length} degree labels`);
        const std = e.altPatterns['Std.']?.[0];
        if (!std) continue;
        for (const [pattern, variants] of Object.entries<any>(e.altPatterns)) {
            if (pattern === 'Std.') continue;
            for (const pos of variants[0]) {
                if (!pos.modeName) continue;
                const stdPos = std.find((s: any) => s.modeName === pos.modeName);
                check(!!stdPos, `${group} | ${name} | ${pattern}: mode "${pos.modeName}" has no Std. position`);
                if (stdPos) {
                    check(
                        stdPos.notes[0].semitones === pos.notes[0].semitones,
                        `${group} | ${name} | ${pattern}: "${pos.modeName}" starts on ${pos.notes[0].semitones} here but ${stdPos.notes[0].semitones} in Std.`,
                    );
                }
            }
        }
    }
}
console.log(`scales checked: ${scales}`);

// the reported case, end to end through Draw Mode's matcher
{
    const TUNING = ['E', 'B', 'G', 'D', 'A', 'E'];
    const map = generateFretboardMap(TUNING, 24);
    const entry: any = (SCALE_SHAPES as any)['9-note']['Jazz Dominant (add ♭3, ♮7)'];
    const pos = entry.altPatterns['4nps'][0].find((p: any) => p.modeName === 'Major (add ♭5, ♭7)');
    check(!!pos, 'Jazz Dominant (add b3, nat7) 4nps should have a "Major (add b5, b7)" mode');
    if (pos) {
        const rootFret = (((3 - pos.notes[0].semitones - 7) % 12) + 12) % 12; // C is index 3 in NOTES
        const keys = pos.notes.map((n: any) => `${n.string}:${n.fretOffset + rootFret}`);
        const { positions, semis } = summarizeDrawn(keys, map, 'C');
        const chordShapes: any = {
            CAGED: (CHORD_SHAPES as any).CAGED,
            Triads: (CHORD_SHAPES as any).Triads,
            Sevenths: (CHORD_SHAPES as any).Sevenths,
            Shells: (CHORD_SHAPES as any).Shells,
        };
        const matches = findDrawMatches({ drawnSemis: semis, drawnPositions: positions, drawnKeys: keys, chordShapes, root: 'C', fretboardMap: map, tuning: TUNING });
        const m = matches.find(x => x.displayLabel === 'Major (add ♭5, ♭7)' && x.contextLabel === 'Scales · 9-note · Jazz Dominant (add ♭3, ♮7)');
        check(!!m, 'drawing that box should match "Major (add b5, b7)" in Jazz Dominant (add b3, nat7)');
        // one row per scale mode: no pattern/variant/box rows
        const scaleRows = matches.filter(x => x.tab === 'Scales').map(x => `${x.contextLabel}|${x.displayLabel}`);
        check(new Set(scaleRows).size === scaleRows.length, 'each scale mode should appear once');
        const shape = m ? shapeForMatch(m, { drawnPositions: positions, drawnKeys: keys, root: 'C', fretboardMap: map, tuning: TUNING }) : null;
        const spelled = new Map<number, string>();
        for (const n of shape ?? []) spelled.set(n.semitones ?? 0, spellNote('C', n.semitones ?? 0, n.degree ?? 1));
        const text = [...spelled.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]).join(' ');
        check(text === 'C D E F Gb G A Bb B', `spelled "${text}", expected "C D E F Gb G A Bb B"`);
    }
}

if (failed) {
    console.error('\nvalidate-scales: FAILED');
    process.exit(1);
}
console.log('validate-scales: OK');
