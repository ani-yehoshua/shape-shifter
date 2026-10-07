/**
 * ONE-TIME BOOTSTRAP for lib/Shapes/Chords.layouts.ts: converts
 * lib/Shapes/Chords.ts into the fingerings ("layouts") x chord qualities
 * table. Reads the real library, so the table starts as your actual data.
 *
 * After the first run, Chords.layouts.ts is HAND-MAINTAINED (that's where the
 * '?' candidates get reviewed), so this refuses to overwrite it. Use --force
 * only to throw those edits away and regenerate from Chords.ts.
 *
 * Run:  npx tsx scripts/gen-chords-layouts.ts [--force]
 * Then: npx tsx scripts/check-chords-layouts.ts   (rebuilds + compares)
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHORD_SHAPES } from '../lib/Shapes/Chords.js';
import { CHORD_QUALITIES, toShellQuality } from '../lib/chordQualities.js';
import type { ChordQuality } from '../lib/chordQualities.js';
import type { ShapeFormula } from '../lib/fretboardMap.js';
import {
    layoutKey,
    layoutOfShape,
    shapeFromLayout,
    shapeSpan,
} from '../lib/harmony/index.js';
import type { VoicingLayout } from '../lib/harmony/index.js';

type Cell = number | '?';
type Row = { layout: VoicingLayout; cells: Cell[] };
type QNode = {
    kind: 'qualities';
    levelName: string;
    shell: boolean;
    qualities: string[];
    degrees: number[];
    positions: Record<string, Row[]>;
};
type PNode = { kind: 'parent'; levelName: string; options: Record<string, Node> };
type CNode = { kind: 'caged'; levelName: string; options: Record<string, ShapeFormula> };
type Node = QNode | PNode | CNode;

const CANDIDATE_MAX_SPAN = 5; // frets; a hint for "worth a look", not proof

/* eslint-disable @typescript-eslint/no-explicit-any */
const isShape = (n: any) => Array.isArray(n?.pattern);
function isQualityNode(n: any): boolean {
    const q0: any = Object.values(n.options ?? {})[0];
    const p0: any = Object.values(q0?.options ?? {})[0];
    return isShape(p0);
}

function buildQualityNode(n: any, shell: boolean): QNode {
    const qualities = Object.keys(n.options);
    const qOf = (k: string): ChordQuality =>
        shell ? toShellQuality(CHORD_QUALITIES[k]) : CHORD_QUALITIES[k];
    const degrees = qOf(qualities[0]).degrees;
    for (const q of qualities)
        if (qOf(q).degrees.join() !== degrees.join())
            throw new Error(`qualities in one group must share degrees (${q})`);

    const invKeys = Object.keys(n.options[qualities[0]].options);
    const positions: Record<string, Row[]> = {};
    for (const inv of invKeys) {
        const rows: Row[] = [];
        const index = new Map<string, number>();
        qualities.forEach((q, qi) => {
            const shape = n.options[q].options[inv] as ShapeFormula | undefined;
            if (!shape) throw new Error(`${q} is missing position "${inv}"`);
            [shape, ...(shape.altShapes ?? [])].forEach((s, i) => {
                const layout = layoutOfShape(s, qOf(q));
                if (!layout) throw new Error(`${q}/${inv} alt${i} isn't a layout`);
                const key = layoutKey(layout);
                let ri = index.get(key);
                if (ri === undefined) {
                    ri = rows.length;
                    index.set(key, ri);
                    rows.push({ layout, cells: qualities.map(() => 0) });
                }
                if (rows[ri].cells[qi] !== 0)
                    throw new Error(`${q}/${inv}: same fingering listed twice`);
                rows[ri].cells[qi] = i + 1; // position in this quality's list (1 = primary)
            });
        });
        // Fingerings a quality doesn't have yet but could reach: unreviewed candidates.
        for (const row of rows)
            qualities.forEach((q, qi) => {
                if (row.cells[qi] === 0 && shapeSpan(shapeFromLayout(row.layout, qOf(q))) <= CANDIDATE_MAX_SPAN)
                    row.cells[qi] = '?';
            });
        positions[inv] = rows;
    }
    return { kind: 'qualities', levelName: n.levelName, shell, qualities, degrees, positions };
}

function build(n: any, shell: boolean): Node {
    const first: any = Object.values(n.options)[0];
    if (isShape(first)) return { kind: 'caged', levelName: n.levelName, options: n.options };
    if (isQualityNode(n)) return buildQualityNode(n, shell);
    return {
        kind: 'parent',
        levelName: n.levelName,
        options: Object.fromEntries(
            Object.entries<any>(n.options).map(([k, v]) => [k, build(v, shell)]),
        ),
    };
}

// ── Emit ──────────────────────────────────────────────────────────────────────
const q = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
const padL = (s: string, w: number) => ' '.repeat(Math.max(0, w - s.length)) + s;

function noteText(layout: VoicingLayout, degrees: number[]): string {
    return layout.notes
        .map(n => `${n.string}:${degrees[n.slot]}${n.octave ? `@${n.octave}` : ''}`)
        .join('  ');
}

function emitShape(s: ShapeFormula, ind: string): string {
    const notes = s.pattern
        .map(
            p =>
                `${ind}        { string: ${p.string}, fretOffset: ${p.fretOffset}, semitones: ${p.semitones}, degree: ${p.degree} },`,
        )
        .join('\n');
    return (
        `{\n${ind}    name: ${q(s.name ?? '')},\n${ind}    rootString: ${s.rootString},\n` +
        `${ind}    pattern: [\n${notes}\n${ind}    ],\n${ind}}`
    );
}

function emitNode(node: Node, ind: string): string {
    if (node.kind === 'caged') {
        const items = Object.entries(node.options)
            .map(([k, s]) => `${ind}        ${q(k)}: ${emitShape(s, ind + '        ')},`)
            .join('\n');
        return `{\n${ind}    levelName: ${q(node.levelName)},\n${ind}    options: {\n${items}\n${ind}    },\n${ind}}`;
    }
    if (node.kind === 'parent') {
        const items = Object.entries(node.options)
            .map(([k, v]) => `${ind}        ${q(k)}: ${emitNode(v, ind + '        ')},`)
            .join('\n');
        return `{\n${ind}    levelName: ${q(node.levelName)},\n${ind}    options: {\n${items}\n${ind}    },\n${ind}}`;
    }
    // qualities node: the interesting part
    const widths = node.qualities.map(name => Math.max(name.length, 3));
    const groups = Object.entries(node.positions)
        .map(([inv, rows]) => {
            const noteW = Math.max(...rows.map(r => noteText(r.layout, node.degrees).length));
            // Row text is `[<root>, '<notes>',<pad> [c1, c2, ...]]`: the first cell
            // starts noteW + 10 characters after the row's `[`. The heading
            // starts at the same column (on the "//") and right-aligns each
            // quality name over its cell (cells are joined by ", ", so the
            // names are joined by two spaces).
            const head =
                `${ind}            //` +
                pad(' root  notes', noteW + 8) +
                node.qualities.map((name, i) => padL(name, widths[i])).join('  ');
            const lines = rows.map(r => {
                const cells = r.cells
                    .map((c, i) => padL(c === '?' ? "'?'" : String(c), widths[i]))
                    .join(', ');
                return (
                    `${ind}            [${r.layout.rootString}, ${pad(q(noteText(r.layout, node.degrees)) + ',', noteW + 4)} ` +
                    `[${cells}]],`
                );
            });
            return `${ind}        ${q(inv)}: [\n${head}\n${lines.join('\n')}\n${ind}        ],`;
        })
        .join('\n');
    return (
        `{\n${ind}    levelName: ${q(node.levelName)},\n` +
        (node.shell ? `${ind}    shell: true,\n` : '') +
        `${ind}    qualities: [${node.qualities.map(q).join(', ')}],\n` +
        `${ind}    positions: {\n${groups}\n${ind}    },\n${ind}}`
    );
}

// ── Stats for the header ──────────────────────────────────────────────────────
const tree: Record<string, Node> = {};
for (const [family, node] of Object.entries<any>(CHORD_SHAPES as any))
    tree[family] = build(node, family === 'Shells');

let rowCount = 0;
let confirmed = 0;
let candidates = 0;
function count(n: Node) {
    if (n.kind === 'parent') Object.values(n.options).forEach(count);
    else if (n.kind === 'qualities')
        for (const rows of Object.values(n.positions)) {
            rowCount += rows.length;
            for (const r of rows)
                for (const c of r.cells) {
                    if (typeof c === 'number' && c > 0) confirmed++;
                    else if (c === '?') candidates++;
                }
        }
}
Object.values(tree).forEach(count);

const body = Object.entries(tree)
    .map(([family, node]) => `    ${family}: ${emitNode(node, '    ')},`)
    .join('\n');

const out = `// The chord library stored as FINGERINGS x CHORD QUALITIES, instead of one
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
//          '?' -> not in the library, but within ${CANDIDATE_MAX_SPAN} frets: a candidate to
//                 hand-check. Never used until you change it to a number
//                 (the next free position for that quality), or to 0 if it
//                 isn't playable. Search for '?' to find what's left.
//
// At bootstrap ${rowCount} fingerings stood in for ${confirmed} hand-typed shapes
// (+ the 5 CAGED shapes, kept as-is), with ${candidates} '?' candidates to review.
//
// buildChordShapes() at the bottom rebuilds the CHORD_SHAPES tree in the same
// shape the app reads today from Chords.ts.
import { CHORD_QUALITIES, toShellQuality } from '@/lib/chordQualities';
import type { ChordQuality } from '@/lib/chordQualities';
import type { ShapeFormula } from '@/lib/fretboardMap';
import { shapeFromLayout } from '@/lib/harmony';

type Cell = number | '?';
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
${body}
};

// ── Rebuild the tree the app reads ─────────────────────────────────────────────
// The shape of this result is identical to CHORD_SHAPES in Chords.ts, so
// nothing that consumes the library has to change.
export type BuiltNode = { levelName: string; options: Record<string, BuiltNode | ShapeFormula> };

function parseNotes(text: string, quality: ChordQuality) {
    return text.trim().split(/\\s+/).map(tok => {
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
`;

const dest = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'lib',
    'Shapes',
    'Chords.layouts.ts',
);
if (existsSync(dest) && !process.argv.includes('--force')) {
    console.error(
        `Refusing to overwrite ${dest}: it is hand-maintained now (your '?' reviews live there).\n` +
            `Pass --force to discard those edits and regenerate from Chords.ts.`,
    );
    process.exit(1);
}
writeFileSync(dest, out);
console.log(
    `wrote ${dest}\n  ${rowCount} fingerings for ${confirmed} shapes, ${candidates} '?' candidates, ` +
        `${out.split('\n').length} lines`,
);
