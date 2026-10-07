/**
 * Phase 2 safety net for the chord/scale "harmony engine" (lib/harmony).
 *
 * Proves, against the data that exists today, that:
 *   H1  every shape in the chord library is a (layout x chord quality) pair --
 *       layoutOfShape() -> shapeFromLayout() reproduces it exactly;
 *   H2  the hand-built Scale Chords data (lib/Shapes/ScaleChords.ts, the
 *       "(Base) 1 3 5 7" templates) is reproduced by taking ONE library
 *       layout and placing it on the chord each scale degree gives
 *       (chordAtDegree) -- for every 7-note scale;
 *   H3  the same holds for the other eight degree structures (1 3 4 7, ...).
 * and reports (without failing) how ragged the hand-authored alternates are,
 * plus known data bugs in ScaleChords.ts.
 *
 * Run:  npx tsx scripts/validate-harmony.ts
 * Exits 1 if H1-H3 regress.
 */
import { CHORD_SHAPES } from '../lib/Shapes/Chords.js';
import {
    SCALE_CHORD_SHAPES,
    generateDiatonicVoicings,
} from '../lib/Shapes/ScaleChords.js';
import { SCALE_SHAPES } from '../lib/Shapes/Scales.js';
import { CHORD_QUALITIES, toShellQuality } from '../lib/chordQualities.js';
import type { ChordQuality } from '../lib/chordQualities.js';
import type { ShapeFormula } from '../lib/fretboardMap.js';
import {
    chordAtDegree,
    diatonicChords,
    layoutKey,
    layoutOfShape,
    shapeFromLayout,
    shapeSpan,
} from '../lib/harmony/index.js';
import type { VoicingLayout } from '../lib/harmony/index.js';

type Pattern = ShapeFormula['pattern'];
let failed = false;
const fail = (msg: string) => {
    failed = true;
    console.error(`  FAIL ${msg}`);
};

const full = (p: Pattern) =>
    [...p]
        .sort((a, b) => a.string - b.string)
        .map(n => `${n.string}:${n.fretOffset}:${n.semitones}:${n.degree}`)
        .join(' ');
const frets = (p: Pattern) =>
    [...p]
        .sort((a, b) => a.string - b.string)
        .map(n => `${n.string}:${n.fretOffset}`)
        .join(' ');

// ── Walk the chord library: [label, qualityKey, isShell, shape+alts] ──────────
type Entry = {
    group: string; // voicing type / string set / inversion
    qualityKey: string;
    quality: ChordQuality;
    shapes: ShapeFormula[]; // [primary, ...alts]
};
const cs = CHORD_SHAPES as any;
const entries: Entry[] = [];
function addGroup(label: string, qualities: Record<string, any>, shell: boolean) {
    for (const [qk, qnode] of Object.entries<any>(qualities)) {
        const base = CHORD_QUALITIES[qk];
        const quality = shell ? toShellQuality(base) : base;
        for (const [inv, shape] of Object.entries<any>(qnode.options)) {
            entries.push({
                group: `${label} / ${inv}`,
                qualityKey: qk,
                quality,
                shapes: [shape, ...(shape.altShapes ?? [])],
            });
        }
    }
}
for (const [vt, vn] of Object.entries<any>(cs.Sevenths.options)) {
    const first: any = Object.values(vn.options)[0];
    if (first?.options && 'Root' in first.options) {
        // "Raise 3/1 of 2" has no string-set level (the library's one
        // inconsistently nested voicing type).
        addGroup(vt, vn.options, false);
    } else {
        for (const [ss, sn] of Object.entries<any>(vn.options))
            addGroup(`${vt} / ${ss}`, sn.options, false);
    }
}
for (const [ss, sn] of Object.entries<any>(cs.Triads.options))
    addGroup(`Triads / ${ss}`, sn.options, false);
for (const [ss, sn] of Object.entries<any>(cs.Shells.options))
    addGroup(`Shells / ${ss}`, sn.options, true);

// ── H1: layout round trip ─────────────────────────────────────────────────────
// Hand-authoring errors this check has found in lib/Shapes/Chords.ts that
// haven't been fixed yet, keyed "<group> <quality> alt<N>" (alt0 = primary).
// Listing one lets the check pass on today's data while still catching NEW
// inconsistencies; remove the entry once the data is fixed (the check tells
// you when a listed defect starts passing).
//
// History: the first run found two -- "Drop 3 / Low String Set / 2nd Inv.
// Min7 alt2" (rootString was 1, root note is on string 2) and "Drop 2 of 2 /
// Low String Set / 2nd Inv. Maj7#5 alt1" (5th labelled 7 semitones, not 8).
// Both are fixed, so the list is empty.
const KNOWN_LIBRARY_DEFECTS: Record<string, string> = {};

console.log('H1  library shapes are (layout x quality)');
let shapeCount = 0;
const knownSeen = new Set<string>();
for (const e of entries) {
    e.shapes.forEach((s, ai) => {
        shapeCount++;
        const id = `${e.group} ${e.qualityKey} alt${ai}`;
        const layout = layoutOfShape(s, e.quality);
        const back = layout && shapeFromLayout(layout, e.quality);
        const ok =
            !!back &&
            full(back.pattern) === full(s.pattern) &&
            back.rootString === s.rootString;
        if (ok) return;
        if (id in KNOWN_LIBRARY_DEFECTS) {
            knownSeen.add(id);
            return;
        }
        fail(`${id}: ${layout ? 'round trip differs' : 'not expressible as a layout'}`);
    });
}
console.log(`  ${shapeCount} shapes checked`);
for (const [id, why] of Object.entries(KNOWN_LIBRARY_DEFECTS)) {
    if (knownSeen.has(id)) console.log(`  KNOWN DEFECT in Chords.ts: ${id} -- ${why}`);
    else fail(`${id} is listed as a known defect but now passes -- remove it from KNOWN_LIBRARY_DEFECTS`);
}

// ── H2 / H3: Scale Chords from one library layout ─────────────────────────────
const SET: Record<string, string> = {
    High: 'High String Set',
    Mid: 'Mid String Set',
    Low: 'Low String Set',
};
const maj7Drop2 = (set: string, inv: string): ShapeFormula =>
    cs.Sevenths.options['Drop 2'].options[SET[set]].options['Maj7'].options[inv];

const sevenNoteScales = Object.values<any>(SCALE_SHAPES)
    .flatMap(g => Object.values<any>(g))
    .filter(s => s.intervals.length === 7);

function engineVsTemplates(
    scales: any[],
    structureKey: string,
    sets: string[],
): { total: number; same: number } {
    let total = 0;
    let same = 0;
    const degs =
        structureKey === '(Base) 1 3 5 7'
            ? [1, 3, 5, 7]
            : structureKey.split(' ').map(Number);
    for (const scale of scales) {
        for (const set of sets) {
            const templates = (SCALE_CHORD_SHAPES as any)['Drop 2'][set][structureKey];
            for (const inv of Object.keys(templates)) {
                const perDegree = generateDiatonicVoicings(templates[inv], scale.intervals);
                const layout = layoutOfShape(maj7Drop2(set, inv), CHORD_QUALITIES.Maj7)!;
                perDegree.forEach((pattern, d) => {
                    total++;
                    const placed = shapeFromLayout(
                        layout,
                        chordAtDegree(scale.intervals, d, degs),
                    );
                    if (frets(placed.pattern) === frets(pattern)) same++;
                });
            }
        }
    }
    return { total, same };
}

console.log('H2  "(Base) 1 3 5 7" Scale Chords == one layout placed on each degree');
for (const scale of sevenNoteScales) {
    const r = engineVsTemplates([scale], '(Base) 1 3 5 7', ['High', 'Mid', 'Low']);
    const named = diatonicChords(scale.intervals).map(c => c.qualityKey ?? '?').join(' | ');
    console.log(`  ${scale.name.padEnd(16)} ${r.same}/${r.total}  (${named})`);
    if (r.same !== r.total) fail(`${scale.name}: engine differs from ScaleChords.ts base templates`);
}

console.log('H3  the eight other degree structures (Major)');
const major = sevenNoteScales.find(s => s.name === 'Major');
const structures = Object.keys((SCALE_CHORD_SHAPES as any)['Drop 2']['High']).filter(
    k => !k.startsWith('(Base)'),
);
let hm = { total: 0, same: 0 };
let low = { total: 0, same: 0 };
for (const st of structures) {
    const a = engineVsTemplates([major], st, ['High', 'Mid']);
    const b = engineVsTemplates([major], st, ['Low']);
    hm = { total: hm.total + a.total, same: hm.same + a.same };
    low = { total: low.total + b.total, same: low.same + b.same };
}
console.log(`  High + Mid string sets: ${hm.same}/${hm.total}`);
if (hm.same !== hm.total) fail('High/Mid non-base structures differ from ScaleChords.ts');

// Report, don't fail: the "Low" non-base templates in ScaleChords.ts are
// copies of "Mid" (kept as a fallback until real Low shapes are hand-checked).
{
    const D = (SCALE_CHORD_SHAPES as any)['Drop 2'];
    let dup = 0;
    let n = 0;
    for (const st of structures)
        for (const inv of Object.keys(D.Mid[st])) {
            n++;
            if (JSON.stringify(D.Mid[st][inv].pattern) === JSON.stringify(D.Low[st][inv].pattern)) dup++;
        }
    console.log(
        `  Low string set: ${low.same}/${low.total} match the engine -- NOTE: ` +
            `${dup}/${n} "Low" non-base templates in ScaleChords.ts are exact copies of "Mid" ` +
            `(strings 1-4, not 2-5), so they differ from true Low-string shapes.`,
    );
}

// ── Report: how ragged are the hand-authored alternates? ──────────────────────
console.log('Report  layouts in the chord library');
// A "group" is one voicing type / string set / inversion; every quality in a
// group should (ideally) offer the same set of layouts.
const qualityOfGroup = new Map<string, Map<string, ChordQuality>>(); // group -> qualityKey -> quality
const layoutQualities = new Map<
    string,
    { group: string; layout: VoicingLayout; qualities: Set<string> }
>();
for (const e of entries) {
    const qs = qualityOfGroup.get(e.group) ?? new Map<string, ChordQuality>();
    qs.set(e.qualityKey, e.quality);
    qualityOfGroup.set(e.group, qs);
    for (const s of e.shapes) {
        const layout = layoutOfShape(s, e.quality);
        if (!layout) continue; // one of the known defects above
        const key = `${e.group}#${layoutKey(layout)}`;
        const slot = layoutQualities.get(key) ?? { group: e.group, layout, qualities: new Set<string>() };
        slot.qualities.add(e.qualityKey);
        layoutQualities.set(key, slot);
    }
}
let inAll = 0;
let inSome = 0;
let missing = 0;
let missingPlayable = 0;
for (const { group, layout, qualities } of layoutQualities.values()) {
    const all = qualityOfGroup.get(group)!;
    if (qualities.size === all.size) {
        inAll++;
        continue;
    }
    inSome++;
    for (const [qk, quality] of all) {
        if (qualities.has(qk)) continue;
        missing++;
        // would this layout be playable (<= 5 frets) for the quality that lacks it?
        if (shapeSpan(shapeFromLayout(layout, quality)) <= 5) missingPlayable++;
    }
}
console.log(
    `  ${shapeCount} hand-authored shapes = ${layoutQualities.size} distinct layouts ` +
        `(${inAll} used by every quality, ${inSome} by only some)`,
);
console.log(
    `  ${missing} (layout, quality) combinations are absent from the library; ` +
        `${missingPlayable} of them would be playable (span <= 5 frets).`,
);

if (failed) {
    console.error('\nvalidate-harmony: FAILED');
    process.exit(1);
}
console.log('\nvalidate-harmony: OK');
