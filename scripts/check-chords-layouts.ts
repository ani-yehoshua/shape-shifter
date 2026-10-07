/**
 * Keeps lib/Shapes/Chords.layouts.ts in step with lib/Shapes/Chords.ts (the
 * file the apps still read) while both exist.
 *
 * Always required:
 *   - the same keys, in the same order, and the same levelNames at every level
 *   - EVERY shape in Chords.ts is also in the layouts file (same rootString
 *     and notes; the order notes are listed inside one shape is ignored)
 * Reported, not a failure:
 *   - shapes the layouts file has that Chords.ts doesn't ("ahead") -- these are
 *     the '?' candidates you reviewed and approved by giving them a number
 * While nothing is ahead, alternates must also be in exactly the same order
 * and carry the same names as Chords.ts.
 *
 * Run:  npx tsx scripts/check-chords-layouts.ts
 * Exit code 1 if anything from Chords.ts is missing or the tree differs.
 */
import { CHORD_SHAPES } from '../lib/Shapes/Chords.js';
import { buildChordShapes } from '../lib/Shapes/Chords.layouts.js';

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
let ahead = 0;
const aheadAt: string[] = [];

function compareShape(a: any, b: any, path: string) {
    const aList = [a, ...(a.altShapes ?? [])];
    const bList = [b, ...(b.altShapes ?? [])];
    shapes += aList.length;
    const aText = aList.map(shapeText);
    const bText = bList.map(shapeText);

    const missing = aText.filter(t => !bText.includes(t));
    if (missing.length) bad(path, `${missing.length} shape(s) from Chords.ts are missing from the layouts file`);

    const extra = bText.filter(t => !aText.includes(t));
    if (extra.length) {
        ahead += extra.length;
        aheadAt.push(`${path} (+${extra.length})`);
        return; // the layouts file is ahead here: order is no longer comparable
    }
    if (aText.join('\n') !== bText.join('\n')) bad(path, 'same shapes but a different order');
    if (a.name !== b.name) bad(path, `name ${a.name} vs ${b.name}`);
    aList.forEach((x, i) => {
        if (i > 0 && x.name !== bList[i].name) bad(`${path} alt${i}`, 'name differs');
    });
}

function compare(a: any, b: any, path: string) {
    if (isShape(a) || isShape(b)) {
        if (!(isShape(a) && isShape(b))) return bad(path, 'shape vs non-shape');
        return compareShape(a, b, path);
    }
    if (a.levelName !== b.levelName) bad(path, `levelName ${a.levelName} vs ${b.levelName}`);
    const ak = Object.keys(a.options ?? a);
    const bk = Object.keys(b.options ?? b);
    if (ak.join('|') !== bk.join('|')) return bad(path, `keys [${ak}] vs [${bk}]`);
    for (const k of ak) compare((a.options ?? a)[k], (b.options ?? b)[k], `${path} > ${k}`);
}

compare({ options: CHORD_SHAPES }, { options: buildChordShapes() }, 'library');

if (problems.length) {
    console.error(`check-chords-layouts: PROBLEMS\n  ${problems.join('\n  ')}`);
    process.exit(1);
}
console.log(
    `check-chords-layouts: OK -- every one of the ${shapes} shapes in Chords.ts is in Chords.layouts.ts`,
);
if (ahead) {
    console.log(
        `  ${ahead} approved shape(s) are AHEAD of Chords.ts (not in the apps yet):\n    ${aheadAt.join('\n    ')}`,
    );
} else {
    console.log('  nothing ahead: the two files are identical, alternates in the same order.');
}
