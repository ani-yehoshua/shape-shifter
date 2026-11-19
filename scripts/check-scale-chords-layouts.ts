/**
 * Keeps lib/Shapes/ScaleChords.layouts.ts in step with lib/Shapes/ScaleChords.ts
 * (the file the apps still read) while both exist.
 *
 * Always required:
 *   - the same keys in the same order at every level (a voicing type, string
 *     set, structure or inversion that exists in only ONE file is a problem,
 *     unless it is entirely unapproved in the layouts file -- those are left
 *     out of the built tree on purpose)
 *   - EVERY shape in ScaleChords.ts is also in the layouts file (same
 *     rootString, notes, semitones and degree labels; the order notes are
 *     listed inside one shape is ignored), except the ones listed in
 *     NOT_CONVERTED and the ones you marked 'x' (deliberately removed on
 *     review; an 'x' on a shape ScaleChords.ts never had is a problem too)
 * Reported, not a failure:
 *   - shapes the layouts file has that ScaleChords.ts doesn't ("ahead") --
 *     fingerprints you approved by turning a '?' into a number
 * While nothing is ahead, alternates must also be in the same order.
 *
 * Run:  npx tsx scripts/check-scale-chords-layouts.ts
 * Exit code 1 if anything from ScaleChords.ts is missing or the tree differs.
 */
import { SCALE_CHORD_SHAPES } from '../lib/Shapes/ScaleChords.js';
import {
    NOT_CONVERTED,
    buildScaleChordShapes,
    removedScaleChordShapes,
} from '../lib/Shapes/ScaleChords.layouts.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const problems: string[] = [];
const bad = (path: string, msg: string) => {
    if (problems.length < 25) problems.push(`${path}: ${msg}`);
    else if (problems.length === 25) problems.push('...');
};
const isShape = (n: any) => Array.isArray(n?.pattern);
const shapeText = (s: any) =>
    `${s.rootString}|` +
    [...s.pattern]
        .sort((a: any, b: any) => a.string - b.string)
        .map((n: any) => `${n.string}:${n.fretOffset}:${n.semitones}:${n.degree}`)
        .join(' ');

let shapes = 0;
let skipped = 0;
let ahead = 0;
const aheadAt: string[] = [];

const removed = removedScaleChordShapes(); // shapes marked 'x', by place in the tree
const removedAt: string[] = [];

function compareShape(a: any, b: any, path: string) {
    const aAll = [a, ...(a.altShapes ?? [])];
    const allText = aAll.map(shapeText);
    // shapes of ScaleChords.ts that were deliberately removed ('x') don't count as missing
    const removedHere = (removed[path] ?? []).map(shapeText);
    for (const t of removedHere)
        if (!allText.includes(t)) bad(path, "a shape marked 'x' is not in ScaleChords.ts at all");
    // ...nor do alternates the table can't express yet (NOT_CONVERTED)
    const aList = aAll.filter((_, i) => {
        const listed = NOT_CONVERTED.includes(`${path}#${i}`);
        if (listed) skipped++;
        return !listed && !removedHere.includes(allText[i]);
    });
    const removedCount = aAll.length - aList.length - NOT_CONVERTED.filter(n => n.startsWith(`${path}#`)).length;
    if (removedCount > 0) removedAt.push(`${path} (-${removedCount})`);
    const bList = [b, ...(b.altShapes ?? [])];
    shapes += aList.length;
    const aText = aList.map(shapeText);
    const bText = bList.map(shapeText);

    const missing = aText.filter(t => !bText.includes(t));
    if (missing.length)
        return bad(path, `${missing.length} shape(s) from ScaleChords.ts are missing from the layouts file`);

    const extra = bText.filter(t => !aText.includes(t));
    if (extra.length) {
        ahead += extra.length;
        aheadAt.push(`${path} (+${extra.length})`);
        return; // the layouts file is ahead here: order is no longer comparable
    }
    if (aText.join('\n') !== bText.join('\n')) bad(path, 'same shapes but a different order');
    if (a.name !== b.name) bad(path, `name ${a.name} vs ${b.name}`);
}

function compare(a: any, b: any, path: string) {
    if (isShape(a) || isShape(b)) {
        if (!(isShape(a) && isShape(b))) return bad(path, 'shape vs non-shape');
        return compareShape(a, b, path);
    }
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    // a level entirely unapproved in the layouts file is simply absent from b
    const extraInB = bk.filter(k => !ak.includes(k));
    if (extraInB.length) {
        // approved-only content the old file lacks (e.g. a whole new voicing type): ahead
        for (const k of extraInB) {
            const count = (n: any): number =>
                isShape(n) ? 1 + (n.altShapes?.length ?? 0) : Object.values<any>(n).reduce((s, c) => s + count(c), 0);
            const c = count(b[k]);
            ahead += c;
            aheadAt.push(`${path ? `${path} > ` : ''}${k} (+${c}, new)`);
        }
    }
    const missingInB = ak.filter(k => !bk.includes(k));
    for (const k of missingInB) bad(`${path} > ${k}`, 'exists in ScaleChords.ts but not in the layouts file');
    const sharedA = ak.filter(k => bk.includes(k));
    const sharedB = bk.filter(k => ak.includes(k));
    if (sharedA.join('|') !== sharedB.join('|')) bad(path, `key order differs [${sharedA}] vs [${sharedB}]`);
    for (const k of sharedA) compare(a[k], b[k], path ? `${path} > ${k}` : k);
}

compare(SCALE_CHORD_SHAPES, buildScaleChordShapes(), '');

if (problems.length) {
    console.error(`check-scale-chords-layouts: PROBLEMS\n  ${problems.join('\n  ')}`);
    process.exit(1);
}
console.log(
    `check-scale-chords-layouts: OK -- all ${shapes} convertible shapes in ScaleChords.ts are in ScaleChords.layouts.ts`,
);
if (skipped)
    console.log(`  ${skipped} shape(s) not converted (listed in NOT_CONVERTED): ${NOT_CONVERTED.join('; ')}`);
if (removedAt.length)
    console.log(`  ${removedAt.length} place(s) with shapes deliberately removed ('x'):\n    ${removedAt.join('\n    ')}`);
if (ahead) {
    console.log(`  ${ahead} approved shape(s) are AHEAD of ScaleChords.ts (not in the apps yet):\n    ${aheadAt.join('\n    ')}`);
} else {
    console.log('  nothing ahead: the two files are identical, alternates in the same order.');
}
