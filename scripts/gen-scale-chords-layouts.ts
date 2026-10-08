/**
 * ONE-TIME BOOTSTRAP for lib/Shapes/ScaleChords.layouts.ts: the Scale Chords
 * data in the same fingerings-x-columns table as Chords.layouts.ts, where the
 * columns are the nine degree structures ((Base) 1 3 5 7, 1 3 4 7, ...)
 * instead of chord qualities.
 *
 * Rows come from two places:
 *   - every shape in lib/Shapes/ScaleChords.ts (the numbers: what the app
 *     shows today, alternates in their current order), and
 *   - every approved fingering of the same voicing / string set / inversion
 *     in Chords.layouts.ts, as CANDIDATES ('?') for you to hand-check. That
 *     includes the voicing types ScaleChords.ts doesn't have yet.
 *
 * After the first run the output file is HAND-MAINTAINED, so this refuses to
 * overwrite it (--force discards edits).
 *
 * Run:  npx tsx scripts/gen-scale-chords-layouts.ts [--force]
 * Then: npx tsx scripts/check-scale-chords-layouts.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCALE_CHORD_SHAPES } from '../lib/Shapes/ScaleChords.js';
import { CHORD_LAYOUTS } from '../lib/Shapes/Chords.layouts.js';
import type { ChordQuality } from '../lib/chordQualities.js';
import type { ShapeFormula } from '../lib/fretboardMap.js';
import {
    chordAtDegree,
    layoutKey,
    layoutOfShape,
    shapeFromLayout,
    shapeSpan,
} from '../lib/harmony/index.js';
import type { VoicingLayout } from '../lib/harmony/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const here = dirname(fileURLToPath(import.meta.url));
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const CANDIDATE_MAX_SPAN = 5; // frets, measured on the Major root chord
const BASE_DEGREES = [1, 3, 5, 7]; // labels used in the notes text

type Cell = number | '?';
type Row = { layout: VoicingLayout; cells: Cell[] };
type SetData = {
    structures: string[];
    positions: Record<string, Row[]>;
};

const degreesOf = (structure: string): number[] =>
    structure.startsWith('(Base)') ? BASE_DEGREES : structure.split(' ').map(Number);
const chordOf = (structure: string): ChordQuality => chordAtDegree(MAJOR, 0, degreesOf(structure));
const shortLabel = (structure: string) => (structure.startsWith('(Base)') ? 'Base' : structure.replace(/ /g, ''));

// ── Comments in ScaleChords.ts (e.g. "// Maj9 from 4th", "// WAS VERIFYING ALT SHAPES")
const sourceLines = readFileSync(join(here, '..', 'lib', 'Shapes', 'ScaleChords.ts'), 'utf8').split('\n');
const sourceNotes: Record<string, string> = {}; // "Set|structure" -> comment
{
    let set = '';
    for (const line of sourceLines) {
        const s = /^ {8}'(High|Mid|Low)': \{/.exec(line);
        if (s) set = s[1];
        const st = /^ {12}'([^']+)': \{\s*(?:\/\/\s*(.*))?$/.exec(line);
        if (st && set && st[2]) sourceNotes[`${set}|${st[1]}`] = st[2].trim();
    }
}

// ── Candidate rows from the approved chord fingerings ────────────────────────
function chordRows(voicing: string, setLong: string, inversion: string): VoicingLayout[] {
    const node: any = (CHORD_LAYOUTS as any).Sevenths?.options?.[voicing]?.options?.[setLong];
    const rows: any[] | undefined = node?.positions?.[inversion];
    if (!rows) return [];
    return rows
        .filter(r => (r[2] as Cell[]).some(c => typeof c === 'number' && c > 0)) // approved for some quality
        .map(([rootString, notes]) => ({
            rootString: rootString as number,
            notes: String(notes)
                .trim()
                .split(/\s+/)
                .map(tok => {
                    const [string, rest] = tok.split(':');
                    const [degree, octave] = rest.split('@');
                    return {
                        string: Number(string),
                        slot: BASE_DEGREES.indexOf(Number(degree)),
                        octave: octave ? Number(octave) : 0,
                    };
                }),
        }));
}

// ── Build ────────────────────────────────────────────────────────────────────
const library: any = SCALE_CHORD_SHAPES;
const structures: string[] = Object.keys(library['Drop 2']['High']);
const notConverted: string[] = [];

// Voicing types to cover: the ones in ScaleChords.ts plus the 4-note ones the
// chord library has with a string-set level. (Raise 3/1 of 2 has no string-set
// level in the chord library, so it is left out for now.)
const chordSevenths: any = (CHORD_LAYOUTS as any).Sevenths.options;
const voicingTypes = [
    ...Object.keys(library),
    // a voicing with a string-set level has `options` (sets); "Raise 3/1 of 2"
    // is a quality node itself, so it has none and is skipped
    ...Object.keys(chordSevenths).filter(v => !(v in library) && chordSevenths[v].options),
];

const data: Record<string, Record<string, SetData>> = {};
for (const voicing of voicingTypes) {
    data[voicing] = {};
    const sets: string[] = voicing in library
        ? Object.keys(library[voicing])
        : Object.keys(chordSevenths[voicing].options).map(s => s.replace(' String Set', ''));
    for (const set of sets) {
        const setLong = `${set} String Set`;
        const positions: Record<string, Row[]> = {};
        const invKeys: string[] = voicing in library
            ? Object.keys(library[voicing][set][structures[0]])
            : Object.keys(chordSevenths[voicing].options[setLong].positions);
        for (const inv of invKeys) {
            const rows: Row[] = [];
            const index = new Map<string, number>();
            const rowFor = (layout: VoicingLayout) => {
                const key = layoutKey(layout);
                let ri = index.get(key);
                if (ri === undefined) {
                    ri = rows.length;
                    index.set(key, ri);
                    rows.push({ layout, cells: structures.map(() => 0) });
                }
                return ri;
            };
            // 1) what ScaleChords.ts has today (numbers)
            if (voicing in library) {
                structures.forEach((st, si) => {
                    const tpl: ShapeFormula = library[voicing][set][st][inv];
                    [tpl, ...(tpl.altShapes ?? [])].forEach((s, i) => {
                        const layout = layoutOfShape(s, chordOf(st));
                        if (!layout) {
                            notConverted.push(`${voicing} > ${set} > ${st} > ${inv}#${i}`);
                            return;
                        }
                        const r = rows[rowFor(layout)];
                        if (r.cells[si] !== 0) throw new Error(`${voicing}/${set}/${st}/${inv}: fingering listed twice`);
                        r.cells[si] = i + 1;
                    });
                });
            }
            // 2) approved chord fingerings for the same slot, as candidates
            for (const layout of chordRows(voicing, setLong, inv)) rowFor(layout);
            // 3) candidates: any empty cell within reach on the Major root chord
            for (const r of rows)
                structures.forEach((st, si) => {
                    if (r.cells[si] === 0 && shapeSpan(shapeFromLayout(r.layout, chordOf(st))) <= CANDIDATE_MAX_SPAN)
                        r.cells[si] = '?';
                });
            positions[inv] = rows;
        }
        data[voicing][set] = { structures, positions };
    }
}

// ── Emit ─────────────────────────────────────────────────────────────────────
const q = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
const padL = (s: string, w: number) => ' '.repeat(Math.max(0, w - s.length)) + s;
const noteText = (l: VoicingLayout) =>
    l.notes.map(n => `${n.string}:${BASE_DEGREES[n.slot]}${n.octave ? `@${n.octave}` : ''}`).join('  ');

let rowCount = 0;
let numbered = 0;
let candidates = 0;
const widths = structures.map(st => Math.max(shortLabel(st).length, 3));

// Indentation: voicing key at 4, string-set key at 8, its contents at 12,
// inversion keys at 16, rows (and their heading) at 20.
const sp = (n: number) => ' '.repeat(n);

const emitSet = (voicing: string, set: string, sd: SetData): string => {
    const noteLines = structures
        .map(st => ({ st, note: sourceNotes[`${set}|${st}`] }))
        .filter(x => voicing === 'Drop 2' && x.note)
        .map(x => `${sp(12)}// ${pad(x.st, 16)} ${x.note}${x.note!.includes('WAS VERIFYING') ? '   <-- resume here' : ''}`);
    const groups = Object.entries(sd.positions)
        .map(([inv, rows]) => {
            rowCount += rows.length;
            for (const r of rows)
                for (const c of r.cells) {
                    if (typeof c === 'number' && c > 0) numbered++;
                    else if (c === '?') candidates++;
                }
            const noteW = Math.max(...rows.map(r => noteText(r.layout).length));
            const head =
                `${sp(20)}//` +
                pad(' root  notes', noteW + 8) +
                structures.map((st, i) => padL(shortLabel(st), widths[i])).join('  ');
            const lines = rows.map(r => {
                const cells = r.cells.map((c, i) => padL(c === '?' ? "'?'" : String(c), widths[i])).join(', ');
                return `${sp(20)}[${r.layout.rootString}, ${pad(q(noteText(r.layout)) + ',', noteW + 4)} [${cells}]],`;
            });
            return `${sp(16)}${q(inv)}: [\n${head}\n${lines.join('\n')}\n${sp(16)}],`;
        })
        .join('\n');
    return (
        `${sp(8)}${q(set)}: {\n` +
        (noteLines.length ? `${noteLines.join('\n')}\n` : '') +
        `${sp(12)}positions: {\n${groups}\n${sp(12)}},\n${sp(8)}},`
    );
};

const body = Object.entries(data)
    .map(
        ([voicing, sets]) =>
            `${sp(4)}${q(voicing)}: {\n${Object.entries(sets)
                .map(([set, sd]) => emitSet(voicing, set, sd))
                .join('\n')}\n${sp(4)}},`,
    )
    .join('\n');

const out = `// Scale Chords stored as FINGERINGS x DEGREE STRUCTURES, in the same table
// format as lib/Shapes/Chords.layouts.ts, instead of one hand-typed template
// per structure (lib/Shapes/ScaleChords.ts). Bootstrapped once by
// scripts/gen-scale-chords-layouts.ts; edit THIS file by hand from now on.
//
// STATUS: ScaleChords.ts is kept and is still what the apps read.
// scripts/check-scale-chords-layouts.ts keeps the two in step: everything in
// ScaleChords.ts must be here (except NOT_CONVERTED below), and anything extra
// here is reported as "ahead" (fingerings you approved by turning a '?' into
// a number).
//
// Every row is one fingering:
//
//   [rootString, 'string:chordTone@octave ...', [one cell per structure]]
//
//   columns   the degree structures, left to right:
//             ${structures.map(shortLabel).join('  ')}
//             (Base = the stacked-thirds 1 3 5 7 chord)
//   notes     which chord tone sits on which string ('@1' = an octave up,
//             '@-1' = an octave down). Chord tones are named for the base
//             1-3-5-7 chord: the 3rd voice is written '5' even in 1 3 4 7,
//             where it is really the 4th degree. Fret numbers aren't stored:
//             each one is worked out from the scale degree the chord is on.
//   cell      n  -> this fingering IS in ScaleChords.ts for that structure, as
//                   its n-th shape (1 = main shape, 2.. = alternates, in the
//                   order the app steps through them today)
//             0  -> not there
//            '?' -> not there, but within ${CANDIDATE_MAX_SPAN} frets on the Major root chord: a
//                   candidate to hand-check. Never used until you change it to
//                   a number (the next free position), or to 0 if unplayable.
//                   NOTE: reach is measured on the root chord only; the same
//                   fingering lands on a different chord at every other scale
//                   degree, so check those too.
//
// Rows that come from the chord library (Chords.layouts.ts) rather than from
// ScaleChords.ts are all '?'. That is how voicing types ScaleChords.ts never
// had (Drop 3, Drop 2 of 2, Drop 3 of 2) start out: nothing is shown until
// you approve it. Raise 3/1 of 2 is left out (no string-set level).
//
// In "Low", the numbers for the eight non-base structures are the copies of
// "Mid" that ScaleChords.ts has (strings 1-4), kept as a fallback; the
// fingerings on the real low strings (2-5) are the '?' rows to try instead.
//
// At bootstrap: ${rowCount} fingerings, ${numbered} numbered cells, ${candidates} '?' candidates.
import { chordAtDegree, shapeFromLayout } from '@/lib/harmony';
import type { ShapeFormula } from '@/lib/fretboardMap';
import type { ScaleChordLibrary } from '@/lib/Shapes/ScaleChords';

type Cell = number | '?';
type Row = [rootString: number, notes: string, cells: Cell[]];
type SetNode = { positions: Record<string, Row[]> };

/** Column order (matches the cells in every row). */
export const STRUCTURES = [${structures.map(q).join(', ')}];

export const SCALE_CHORD_LAYOUTS: Record<string, Record<string, SetNode>> = {
${body}
};

/**
 * Shapes in ScaleChords.ts that could NOT be converted (their labels or
 * rootString don't match the chord they belong to), as
 * "voicing > set > structure > inversion#N" (N = 0 for the main shape, else
 * the alternate number). Fix them in ScaleChords.ts or add them here as
 * fingerings; the check script tolerates exactly these.
 */
export const NOT_CONVERTED: string[] = [${notConverted.map(q).join(', ')}];

// ── Rebuild the tree the app reads ─────────────────────────────────────────────
// Same shape as SCALE_CHORD_SHAPES in ScaleChords.ts. Only fingerings with a
// number are used; '?' and 0 are skipped, and a voicing / string set / structure
// with nothing approved is left out entirely.
const MAJOR = ${JSON.stringify(MAJOR)};

function parseNotes(text: string) {
    return text.trim().split(/\\s+/).map(tok => {
        const [string, rest] = tok.split(':');
        const [degree, octave] = rest.split('@');
        return {
            string: Number(string),
            slot: [1, 3, 5, 7].indexOf(Number(degree)),
            octave: octave ? Number(octave) : 0,
        };
    });
}

export function buildScaleChordShapes(): ScaleChordLibrary {
    const library: ScaleChordLibrary = {};
    for (const [voicing, sets] of Object.entries(SCALE_CHORD_LAYOUTS)) {
        for (const [set, node] of Object.entries(sets)) {
            STRUCTURES.forEach((structure, si) => {
                const degrees = structure.startsWith('(Base)')
                    ? [1, 3, 5, 7]
                    : structure.split(' ').map(Number);
                const chord = chordAtDegree(MAJOR, 0, degrees);
                for (const [inversion, rows] of Object.entries(node.positions)) {
                    const shapes = rows
                        .filter(r => typeof r[2][si] === 'number' && r[2][si] > 0)
                        .sort((a, b) => (a[2][si] as number) - (b[2][si] as number))
                        .map(([rootString, notes]) =>
                            shapeFromLayout({ rootString, notes: parseNotes(notes) }, chord),
                        );
                    if (!shapes.length) continue;
                    const [primary, ...alts] = shapes;
                    const template: ShapeFormula = {
                        name: inversion,
                        rootString: primary.rootString,
                        pattern: primary.pattern,
                        ...(alts.length ? { altShapes: alts } : {}),
                    };
                    ((library[voicing] ??= {})[set] ??= {})[structure] ??= {};
                    library[voicing][set][structure][inversion] = template;
                }
            });
        }
    }
    return library;
}
`;

const dest = join(here, '..', 'lib', 'Shapes', 'ScaleChords.layouts.ts');
if (existsSync(dest) && !process.argv.includes('--force')) {
    console.error(
        `Refusing to overwrite ${dest}: it is hand-maintained now (your '?' reviews live there).\n` +
            `Pass --force to discard those edits and regenerate.`,
    );
    process.exit(1);
}
writeFileSync(dest, out);
console.log(
    `wrote ${dest}\n  ${rowCount} fingerings, ${numbered} numbered cells, ${candidates} '?' candidates, ` +
        `${out.split('\n').length} lines\n  not converted (${notConverted.length}): ${notConverted.join('; ') || 'none'}`,
);
