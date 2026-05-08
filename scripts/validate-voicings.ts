/**
 * Validation script: checks that every hand-coded pattern in Beginner.ts and
 * Intermediate.ts is reproduced by generateVoicings().
 *
 * Run:  npx tsx scripts/validate-voicings.ts
 */

import { generateVoicings } from '../lib/voicingAlgorithms.js';
import {
    CHORD_QUALITIES,
    toShellQuality,
    STANDARD_TUNING_SEMITONES,
} from '../lib/chordQualities.js';
import { INTERMEDIATE_CHORD_SHAPES } from '../lib/ChordShapes/Intermediate.js';
import { BEGINNER_CHORD_SHAPES } from '../lib/ChordShapes/Beginner.js';

const MAX_SPAN = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

interface PatternEntry {
    string: number;
    fretOffset: number;
    semitones: number;
    degree: number;
}

function extractStrings(pattern: PatternEntry[]): number[] {
    return pattern.map(n => n.string).sort((a, b) => a - b);
}

function patternsMatch(a: PatternEntry[], b: PatternEntry[]): boolean {
    if (a.length !== b.length) return false;
    const sa = [...a].sort((x, y) => x.string - y.string);
    const sb = [...b].sort((x, y) => x.string - y.string);
    return sa.every(
        (n, i) => n.string === sb[i].string && n.fretOffset === sb[i].fretOffset,
    );
}

interface CheckResult {
    context: string;
    found: boolean;
    span: number;
    note?: string;
}

function checkPattern(
    context: string,
    pattern: PatternEntry[],
    qualityKey: string,
    isShell: boolean,
): CheckResult {
    const baseQuality = CHORD_QUALITIES[qualityKey];
    if (!baseQuality) {
        return { context, found: false, span: -1, note: `unknown quality "${qualityKey}"` };
    }

    const quality = isShell ? toShellQuality(baseQuality) : baseQuality;
    const strings = extractStrings(pattern);

    if (strings.length !== quality.intervals.length) {
        return {
            context,
            found: false,
            span: -1,
            note: `${strings.length} notes vs ${quality.intervals.length} intervals`,
        };
    }

    const offsets = pattern.map(n => n.fretOffset);
    const span = Math.max(...offsets) - Math.min(...offsets);

    const generated = generateVoicings(quality, strings, STANDARD_TUNING_SEMITONES, MAX_SPAN);
    const found = generated.some(g => patternsMatch(g.pattern as PatternEntry[], pattern));

    return { context, found, span };
}

// ── Collect patterns ──────────────────────────────────────────────────────────

interface ToCheck {
    context: string;
    pattern: PatternEntry[];
    qualityKey: string;
    isShell: boolean;
}

const toCheck: ToCheck[] = [];

function addPosition(
    ctx: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pos: any,
    qualityKey: string,
    isShell: boolean,
) {
    toCheck.push({ context: ctx, pattern: pos.pattern, qualityKey, isShell });
    for (const [ai, alt] of ((pos.altShapes ?? []) as PatternEntry[][]).entries()) {
        toCheck.push({
            context: `${ctx} [alt ${ai + 1}]`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pattern: (alt as any).pattern,
            qualityKey,
            isShell,
        });
    }
}

// Beginner — Triads (skip CAGED: those are multi-string forms, not string-set voicings)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const triads = (BEGINNER_CHORD_SHAPES as any).Triads.options;
for (const [ssKey, ssVal] of Object.entries(triads) as [string, any][]) {
    for (const [qualKey, qualVal] of Object.entries(ssVal.options) as [string, any][]) {
        for (const [posKey, posVal] of Object.entries(qualVal.options) as [string, any][]) {
            addPosition(
                `Beginner > Triads > ${ssKey} > ${qualKey} > ${posKey}`,
                posVal,
                qualKey,
                false,
            );
        }
    }
}

// Intermediate — Sevenths
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sevenths = (INTERMEDIATE_CHORD_SHAPES as any).Sevenths.options;
for (const [vtKey, vtVal] of Object.entries(sevenths) as [string, any][]) {
    if (vtVal.levelName === 'String Sets') {
        for (const [ssKey, ssVal] of Object.entries(vtVal.options) as [string, any][]) {
            for (const [qualKey, qualVal] of Object.entries(ssVal.options) as [string, any][]) {
                for (const [posKey, posVal] of Object.entries(qualVal.options) as [string, any][]) {
                    addPosition(
                        `Intermediate > Sevenths > ${vtKey} > ${ssKey} > ${qualKey} > ${posKey}`,
                        posVal,
                        qualKey,
                        false,
                    );
                }
            }
        }
    } else if (vtVal.levelName === 'Chord Qualities') {
        // e.g. Raise 3/1 of 2 — no string set level
        for (const [qualKey, qualVal] of Object.entries(vtVal.options) as [string, any][]) {
            for (const [posKey, posVal] of Object.entries(qualVal.options) as [string, any][]) {
                addPosition(
                    `Intermediate > Sevenths > ${vtKey} > ${qualKey} > ${posKey}`,
                    posVal,
                    qualKey,
                    false,
                );
            }
        }
    }
}

// Intermediate — Shells
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shells = (INTERMEDIATE_CHORD_SHAPES as any).Shells.options;
for (const [ssKey, ssVal] of Object.entries(shells) as [string, any][]) {
    for (const [qualKey, qualVal] of Object.entries(ssVal.options) as [string, any][]) {
        for (const [posKey, posVal] of Object.entries(qualVal.options) as [string, any][]) {
            addPosition(
                `Intermediate > Shells > ${ssKey} > ${qualKey} > ${posKey}`,
                posVal,
                qualKey,
                true,
            );
        }
    }
}

// ── Run checks ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];
const wideShapes: string[] = [];

console.log(`Checking ${toCheck.length} patterns (maxSpan=${MAX_SPAN})…\n`);

for (const item of toCheck) {
    const result = checkPattern(item.context, item.pattern, item.qualityKey, item.isShell);
    if (result.found) {
        passed++;
    } else {
        failed++;
        const note = result.note ? ` (${result.note})` : '';
        failures.push(`MISS  [span=${result.span}]  ${result.context}${note}`);
    }
    if (result.span > 8) {
        wideShapes.push(`WIDE  [span=${result.span}]  ${item.context}`);
    }
}

console.log(`=== Results ===`);
console.log(`Checked : ${toCheck.length}`);
console.log(`Passed  : ${passed}`);
console.log(`Failed  : ${failed}`);

if (wideShapes.length > 0) {
    console.log(`\n--- Shapes with span > 8 (wider than standard 5-fret window) ---`);
    wideShapes.forEach(w => console.log(w));
}

if (failures.length > 0) {
    console.log(`\n--- Misses (not found in generated output) ---`);
    failures.forEach(f => console.log(f));
    process.exit(1);
} else {
    console.log('\nAll hand-coded shapes are reproduced by the generator.');
}
