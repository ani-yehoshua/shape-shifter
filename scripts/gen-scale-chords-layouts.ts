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

type Cell = number | '?'; // the generator only produces these two (the file also allows 'x')
type Row = { layout: VoicingLayout; cells: Cell[] };
type SetData = {
    structures: string[];
    positions: Record<string, Row[]>;
};
// "Raise 3/1 of 2" has no string-set level (same as in Chords.layouts.ts), so a
// voicing is either { set -> SetData } or a SetData itself.
type VoicingData = Record<string, SetData> | SetData;

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
// `node` is the chord table's quality node for this voicing (+ string set, when
// it has that level): { qualities, positions }.
function chordRows(node: any, inversion: string): VoicingLayout[] {
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

// Voicing types to cover: the ones in ScaleChords.ts plus every other
// 4-note voicing the chord library has.
const chordSevenths: any = (CHORD_LAYOUTS as any).Sevenths.options;
const voicingTypes = [
    ...Object.keys(library),
    ...Object.keys(chordSevenths).filter(v => !(v in library)),
];

// Builds the table for one voicing type + string set. `set` is null for a
// voicing with no string-set level ("Raise 3/1 of 2").
function buildSetData(voicing: string, set: string | null): SetData {
    {
        const chordNode: any = set === null
            ? chordSevenths[voicing] // the voicing IS the quality node
            : chordSevenths[voicing]?.options?.[`${set} String Set`];
        const positions: Record<string, Row[]> = {};
        const invKeys: string[] = voicing in library
            ? Object.keys(library[voicing][set as string][structures[0]])
            : Object.keys(chordNode.positions);
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
                    const tpl: ShapeFormula = library[voicing][set as string][st][inv];
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
            for (const layout of chordRows(chordNode, inv)) rowFor(layout);
            // 3) candidates: any empty cell within reach on the Major root chord
            for (const r of rows)
                structures.forEach((st, si) => {
                    if (r.cells[si] === 0 && shapeSpan(shapeFromLayout(r.layout, chordOf(st))) <= CANDIDATE_MAX_SPAN)
                        r.cells[si] = '?';
                });
            positions[inv] = rows;
        }
        return { structures, positions };
    }
}

const data: Record<string, VoicingData> = {};
for (const voicing of voicingTypes) {
    if (voicing in library) {
        data[voicing] = Object.fromEntries(
            Object.keys(library[voicing]).map(set => [set, buildSetData(voicing, set)]),
        );
    } else if (chordSevenths[voicing].options) {
        data[voicing] = Object.fromEntries(
            Object.keys(chordSevenths[voicing].options).map(long => {
                const set = long.replace(' String Set', '');
                return [set, buildSetData(voicing, set)];
            }),
        );
    } else {
        data[voicing] = buildSetData(voicing, null); // no string-set level
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

// Indentation: voicing key at 4. With a string-set level the set key is at 8
// and its contents (`ci`) at 12; without one (Raise 3/1 of 2) the contents are
// at 8. Inversion keys sit at ci + 4, rows (and their heading) at ci + 8.
const sp = (n: number) => ' '.repeat(n);

const emitBody = (voicing: string, set: string | null, sd: SetData, ci: number): string => {
    const noteLines =
        set === null
            ? []
            : structures
                  .map(st => ({ st, note: sourceNotes[`${set}|${st}`] }))
                  .filter(x => voicing === 'Drop 2' && x.note)
                  .map(
                      x =>
                          `${sp(ci)}// ${pad(x.st, 16)} ${x.note}${x.note!.includes('WAS VERIFYING') ? '   <-- resume here' : ''}`,
                  );
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
                `${sp(ci + 8)}//` +
                pad(' root  notes', noteW + 8) +
                structures.map((st, i) => padL(shortLabel(st), widths[i])).join('  ');
            const lines = rows.map(r => {
                const cells = r.cells.map((c, i) => padL(c === '?' ? "'?'" : String(c), widths[i])).join(', ');
                return `${sp(ci + 8)}[${r.layout.rootString}, ${pad(q(noteText(r.layout)) + ',', noteW + 4)} [${cells}]],`;
            });
            return `${sp(ci + 4)}${q(inv)}: [\n${head}\n${lines.join('\n')}\n${sp(ci + 4)}],`;
        })
        .join('\n');
    return (
        (noteLines.length ? `${noteLines.join('\n')}\n` : '') +
        `${sp(ci)}positions: {\n${groups}\n${sp(ci)}},`
    );
};

const isSetData = (v: VoicingData): v is SetData => 'positions' in v;

const body = Object.entries(data)
    .map(([voicing, v]) =>
        isSetData(v)
            ? `${sp(4)}${q(voicing)}: {\n${emitBody(voicing, null, v, 8)}\n${sp(4)}},`
            : `${sp(4)}${q(voicing)}: {\n${Object.entries(v)
                  .map(([set, sd]) => `${sp(8)}${q(set)}: {\n${emitBody(voicing, set, sd, 12)}\n${sp(8)}},`)
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
//            'x' -> WAS in ScaleChords.ts for that structure, and was
//                   deliberately removed on review. Never used.
//                   scripts/check-scale-chords-layouts.ts accepts a missing
//                   shape only where it is marked 'x'.
//
// Rows that come from the chord library (Chords.layouts.ts) rather than from
// ScaleChords.ts are all '?'. That is how voicing types ScaleChords.ts never
// had (Drop 3, Drop 2 of 2, Drop 3 of 2, Raise 3/1 of 2) start out: nothing
// is shown until you approve it. Raise 3/1 of 2 has no string-set level, the
// same as in Chords.layouts.ts, so its fingerings sit directly under the
// voicing.
//
// In "Low", the numbers for the eight non-base structures are the copies of
// "Mid" that ScaleChords.ts has (strings 1-4), kept as a fallback; the
// fingerings on the real low strings (2-5) are the '?' rows to try instead.
//
// At bootstrap: ${rowCount} fingerings, ${numbered} numbered cells, ${candidates} '?' candidates.
import { chordAtDegree, shapeFromLayout } from '@/lib/harmony';
import type { ShapeFormula } from '@/lib/fretboardMap';

type Cell = number | '?' | 'x';
type Row = [rootString: number, notes: string, cells: Cell[]];
type SetNode = { positions: Record<string, Row[]> };

/** Column order (matches the cells in every row). */
export const STRUCTURES = [${structures.map(q).join(', ')}];

/**
 * voicing type -> string set -> fingerings, except a voicing with no string-set
 * level (Raise 3/1 of 2, as in Chords.layouts.ts), which holds its fingerings
 * directly.
 */
export const SCALE_CHORD_LAYOUTS: Record<string, Record<string, SetNode> | SetNode> = {
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

/** The chord a structure makes on the Major root chord (what templates are placed on). */
const chordOf = (structure: string) =>
    chordAtDegree(MAJOR, 0, structure.startsWith('(Base)') ? [1, 3, 5, 7] : structure.split(' ').map(Number));

type Level3 = Record<string, Record<string, ShapeFormula>>; // structure -> inversion -> template
type Level4 = Record<string, Level3>; // string set -> ...
/**
 * Same shape as SCALE_CHORD_SHAPES in ScaleChords.ts (voicing -> string set ->
 * structure -> inversion -> template), except a voicing with no string-set
 * level holds its structures directly.
 */
export type BuiltScaleChords = Record<string, Level4 | Level3>;

const isSetNode = (n: SetNode | Record<string, SetNode>): n is SetNode => 'positions' in n;

function buildStructures(node: SetNode): Level3 {
    const out: Level3 = {};
    STRUCTURES.forEach((structure, si) => {
        const chord = chordOf(structure);
        for (const [inversion, rows] of Object.entries(node.positions)) {
            const shapes = rows
                .filter(r => typeof r[2][si] === 'number' && r[2][si] > 0)
                .sort((a, b) => (a[2][si] as number) - (b[2][si] as number))
                .map(([rootString, notes]) => shapeFromLayout({ rootString, notes: parseNotes(notes) }, chord));
            if (!shapes.length) continue;
            const [primary, ...alts] = shapes;
            (out[structure] ??= {})[inversion] = {
                name: inversion,
                rootString: primary.rootString,
                pattern: primary.pattern,
                ...(alts.length ? { altShapes: alts } : {}),
            };
        }
    });
    return out;
}

export function buildScaleChordShapes(): BuiltScaleChords {
    const library: BuiltScaleChords = {};
    for (const [voicing, node] of Object.entries(SCALE_CHORD_LAYOUTS)) {
        if (isSetNode(node)) {
            const structures = buildStructures(node);
            if (Object.keys(structures).length) library[voicing] = structures;
        } else {
            for (const [set, setNode] of Object.entries(node)) {
                const structures = buildStructures(setNode);
                if (Object.keys(structures).length) ((library[voicing] ??= {}) as Level4)[set] = structures;
            }
        }
    }
    return library;
}

/**
 * The shapes marked 'x' (in ScaleChords.ts, deliberately removed on review),
 * keyed by their place in the tree: "Drop 2 > Mid > 1 3 4 7 > Root". Used by
 * scripts/check-scale-chords-layouts.ts to tell a deliberate removal from a
 * shape that went missing by accident.
 */
export function removedScaleChordShapes(): Record<string, ShapeFormula[]> {
    const out: Record<string, ShapeFormula[]> = {};
    const walk = (node: SetNode, path: string[]) => {
        STRUCTURES.forEach((structure, si) => {
            const chord = chordOf(structure);
            for (const [inversion, rows] of Object.entries(node.positions)) {
                const removed = rows
                    .filter(r => r[2][si] === 'x')
                    .map(([rootString, notes]) => shapeFromLayout({ rootString, notes: parseNotes(notes) }, chord));
                if (removed.length) out[[...path, structure, inversion].join(' > ')] = removed;
            }
        });
    };
    for (const [voicing, node] of Object.entries(SCALE_CHORD_LAYOUTS)) {
        if (isSetNode(node)) walk(node, [voicing]);
        else for (const [set, setNode] of Object.entries(node)) walk(setNode, [voicing, set]);
    }
    return out;
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
