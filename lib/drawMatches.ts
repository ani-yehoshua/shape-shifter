// Draw Mode's "Find shape": everything in the library that contains the notes
// you drew. One match per chord and one per scale mode, each carrying the path
// to it (tab, category, voicing, string set / scale group and scale). What can
// be varied about a match (a chord's inversion and alternate shape, a scale's
// pattern, variant and box, or the whole scale on the neck) is not part of the
// match: it starts on the first shape that holds the drawn notes and the
// Shapes panel steps through the rest. Shared by the website and the mobile
// app, which both used to carry their own copy of the chord half.
import { generateAllVoicingsForShape, NOTES } from '@/lib/fretboardMap';
import type { NotePosition } from '@/lib/fretboardMap';
import { noteNameToSemitone } from '@/lib/MusicTheory';
import { SCALE_SHAPES } from '@/lib/Shapes/Scales';
import type { ScaleEntry } from '@/lib/Shapes/Scales';

const QUALITY_DISPLAY: Record<string, string> = {
    Maj: 'Major',
    Min: 'Minor',
    Aug: 'Augmented',
    Dim: 'Diminished',
    Maj7: 'Maj7',
    Dom7: 'Dom7',
    Min7: 'Min7',
    mMaj7: 'mMaj7',
    Min7b5: 'Min7b5',
    Dim7: 'Dim7',
};

// open strings of standard tuning, high to low (the order every string index uses)
const STANDARD_OPEN = ['E', 'B', 'G', 'D', 'A', 'E'];
// scale drawings need a few distinct notes to say anything (the same threshold as the
// scale names under the chord label); fewer would match half the library
const MIN_PITCH_CLASSES_FOR_SCALES = 3;
const GROUP_ORDER = ['7-note', '5-note', '6-note', '8-note', '9-note', 'Symmetrical'];

/** The "pattern" option that shows every note of the scale across the whole neck. */
export const WHOLE_NECK = 'Whole neck';

/** Which mode of which scale: `mode` indexes the scale's intervals. */
export type ScaleRef = { group: string; scale: string; mode: number };
/** One shape of a scale: pattern ("3nps", "Std."...), variant of it, box (position) of that variant. */
export type ScaleSelection = { pattern: string; variant: number; box: number };

export type DrawMatch = {
    tab: 'Chords' | 'Scales';
    /** "Maj7", "Dorian": shown after the root */
    displayLabel: string;
    /** the path to it, e.g. "Chords · Sevenths · Drop 2 · High String Set" or "Scales · 7-note · Major" */
    contextLabel: string;
    // chords (empty for scales): the inversion and shape the match starts on
    qualityKey: string;
    finalFormulas: Record<string, any>;
    posKey: string;
    /** 0 = the shape itself, n = its nth alternate */
    altIndex: number;
    // scales: which mode, and the shape it starts on
    scale?: ScaleRef;
    scaleSelection?: ScaleSelection;
};

export type DrawMatchInput = {
    /** distinct pitch classes of the drawn notes, relative to `root` */
    drawnSemis: number[];
    /** string -> lowest drawn fret on it (what chord shapes are matched against) */
    drawnPositions: Map<number, number>;
    /** every drawn note as "string:fret" (what scale shapes are matched against) */
    drawnKeys: Iterable<string>;
    chordShapes: Record<string, any>;
    root: string;
    fretboardMap: string[][];
    /** open-string note names, high to low */
    tuning: string[];
};

/** What's needed to put a match's shape on the fretboard. */
export type ShapeContext = Pick<DrawMatchInput, 'drawnPositions' | 'drawnKeys' | 'root' | 'fretboardMap' | 'tuning'>;

/** Each drawn note's pitch class relative to `root`, plus the lowest drawn fret per string. */
export function summarizeDrawn(keys: Iterable<string>, fretboardMap: string[][], root: string) {
    const positions = new Map<number, number>();
    const rootSemi = noteNameToSemitone(root);
    const semis = new Set<number>();
    for (const key of keys) {
        const [s, f] = key.split(':').map(Number);
        if (!positions.has(s) || f < (positions.get(s) as number)) positions.set(s, f);
        const cell = (fretboardMap[s]?.[f] || '').split('/')[0];
        if (cell) semis.add((((noteNameToSemitone(cell) - rootSemi) % 12) + 12) % 12);
    }
    return { positions, semis: [...semis].sort((a, b) => a - b) };
}

const sortShape = (shape: NotePosition[]) =>
    shape.slice().sort((a, b) => a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0));

// ── chords ────────────────────────────────────────────────────────────────

function chordMatches({ drawnSemis, drawnPositions, chordShapes, root, fretboardMap }: DrawMatchInput): DrawMatch[] {
    const results: DrawMatch[] = [];

    const semisMatch = (formula: any) =>
        Array.isArray(formula?.pattern) &&
        drawnSemis.every(s => new Set<number>(formula.pattern.map((n: any) => n.semitones as number)).has(s));

    const coversDrawn = (formula: any) => {
        const raw = generateAllVoicingsForShape(root, formula, fretboardMap) || [];
        const voicings: NotePosition[][] = Array.isArray(raw[0]) ? (raw as any) : [raw as any];
        return voicings.some(v =>
            [...drawnPositions.entries()].every(([s, f]) => v.some((n: NotePosition) => n.string === s && n.fret === f)),
        );
    };

    const isPosBag = (options: Record<string, any>) => {
        const v = Object.values(options)[0] as any;
        return !!v && typeof v === 'object' && ('pattern' in v || 'altShapes' in v);
    };

    function walk(node: any, path: string[], qualityKey: string | null) {
        if (!node || typeof node !== 'object') return;
        if (node.options && isPosBag(node.options)) {
            if (!qualityKey) return;
            // one row per chord, on the first inversion/shape that holds the drawn notes
            for (const [posKey, formula] of Object.entries<any>(node.options)) {
                const variants = [formula, ...(Array.isArray(formula?.altShapes) ? formula.altShapes : [])];
                const altIndex = variants.findIndex(variant => semisMatch(variant) && coversDrawn(variant));
                if (altIndex < 0) continue;
                results.push({
                    tab: 'Chords',
                    displayLabel: QUALITY_DISPLAY[qualityKey] ?? qualityKey,
                    // path = [category, voicing, string set, quality]: the quality is already the title
                    contextLabel: ['Chords', ...path.slice(0, -1)].join(' · '),
                    qualityKey,
                    finalFormulas: node.options,
                    posKey,
                    altIndex,
                });
                break;
            }
            return;
        }
        if (node.options) {
            const isQualityLevel = node.levelName === 'Chord Qualities';
            for (const [key, child] of Object.entries(node.options)) {
                walk(child, [...path, key], isQualityLevel ? key : qualityKey);
            }
        }
    }

    for (const [category, node] of Object.entries(chordShapes)) walk(node, [category], null);
    return results;
}

// ── scales ────────────────────────────────────────────────────────────────

const NATURAL_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/**
 * A mode's name says how its added notes are spelled: "Major (add ♭5)" means the
 * added note is a ♭5 (G♭ over C), not a ♯4. The scale data only labels notes
 * against the parent scale's tonic, which makes the same note a ♯4 here, so
 * read the spelling off the name: semitone -> degree number.
 */
function addedNoteDegrees(modeName: string | undefined): Map<number, number> {
    const out = new Map<number, number>();
    const adds = modeName?.match(/\(add ([^)]*)\)/)?.[1] ?? '';
    for (const m of adds.matchAll(/([♭♯♮])(\d)/g)) {
        const degree = Number(m[2]);
        const shift = m[1] === '♭' ? -1 : m[1] === '♯' ? 1 : 0;
        if (degree >= 1 && degree <= 7) out.set((((NATURAL_SEMITONES[degree - 1] + shift) % 12) + 12) % 12, degree);
    }
    return out;
}

/**
 * The name of mode `d` of a scale (d = index into its intervals). The per-
 * interval patterns have one position per interval with the added notes left
 * unnamed, so read the name from there; the default pattern's list is one name
 * per base mode and doesn't line up with interval indices.
 */
export function scaleModeName(entry: { positions: { modeName?: string }[]; altPatterns: Record<string, { modeName?: string }[][]> }, d: number): string | undefined {
    const perInterval = Object.entries(entry.altPatterns).find(([key]) => key.endsWith('nps'));
    return (perInterval ? perInterval[1][0]?.[d]?.modeName : undefined) ?? entry.positions[d]?.modeName;
}

const scaleEntryFor = (ref: ScaleRef): ScaleEntry | undefined =>
    (SCALE_SHAPES as Record<string, Record<string, ScaleEntry>>)[ref.group]?.[ref.scale];

/** The patterns a scale offers ("2nps", "3nps", "Std."...), then the whole-neck view. */
export function scalePatterns(ref: ScaleRef): string[] {
    const entry = scaleEntryFor(ref);
    return [...(entry ? Object.keys(entry.altPatterns) : []), WHOLE_NECK];
}

export function scaleVariantCount(ref: ScaleRef, pattern: string): number {
    if (pattern === WHOLE_NECK) return 1;
    return scaleEntryFor(ref)?.altPatterns[pattern]?.length ?? 1;
}

export function scaleBoxCount(ref: ScaleRef, pattern: string, variant: number): number {
    if (pattern === WHOLE_NECK) return 1;
    return scaleEntryFor(ref)?.altPatterns[pattern]?.[variant]?.length ?? 1;
}

/** "3nps · Variant 1/3 · Box 2/7", or "Whole neck". */
export function describeScaleSelection(ref: ScaleRef, sel: ScaleSelection): string {
    if (sel.pattern === WHOLE_NECK) return WHOLE_NECK;
    const variants = scaleVariantCount(ref, sel.pattern);
    const boxes = scaleBoxCount(ref, sel.pattern, sel.variant);
    return [sel.pattern, variants > 1 ? `Variant ${sel.variant + 1}/${variants}` : '', `Box ${sel.box + 1}/${boxes}`]
        .filter(Boolean)
        .join(' · ');
}

/** How far each string is tuned from standard (signed, so Drop D is -2 on the low string). */
const tuningDelta = (tuning: string[]) =>
    tuning.map((open, i) => {
        const d = (((noteNameToSemitone(open) - noteNameToSemitone(STANDARD_OPEN[i])) % 12) + 12) % 12;
        return d > 6 ? d - 12 : d;
    });

/**
 * The octave shift (0, -12 or +12) at which a box sits on the 24 frets AND holds
 * every drawn note, if there is one. The app shows a box as is or an octave
 * lower; a drawing can just as well sit an octave higher.
 */
function holdingShift(notes: { string: number }[], base: number[], drawn: string[]): number | undefined {
    return [0, -12, 12].find(s => {
        if (Math.min(...base) + s < 0 || Math.max(...base) + s > 24) return false;
        const have = new Set(notes.map((n, i) => `${n.string}:${base[i] + s}`));
        return drawn.every(key => have.has(key));
    });
}

/** The box's frets for a mode: the parent scale is the root minus the mode's interval. */
function boxFrets(entry: ScaleEntry, d: number, notes: { string: number; fretOffset: number }[], ctx: ShapeContext) {
    const rootIdx = NOTES.findIndex(pair => pair.includes(ctx.root));
    const rootFret = (((rootIdx - entry.intervals[d] - 7) % 12) + 12) % 12;
    const delta = tuningDelta(ctx.tuning);
    return notes.map(n => n.fretOffset + rootFret - (delta[n.string] ?? 0));
}

/**
 * The first shape of `pattern` (of just `variant`, if given) whose box holds
 * every drawn note; if none does, the first box. So changing the pattern or
 * variant keeps the drawing in view whenever it can.
 */
export function scaleSelectionFor(ref: ScaleRef, ctx: ShapeContext, pattern: string, variant?: number): ScaleSelection {
    const entry = scaleEntryFor(ref);
    const variants = entry?.altPatterns[pattern];
    if (pattern === WHOLE_NECK || !entry || !variants) return { pattern: WHOLE_NECK, variant: 0, box: 0 };
    const drawn = [...ctx.drawnKeys];
    for (let v = 0; v < variants.length; v++) {
        if (variant !== undefined && v !== variant) continue;
        for (let box = 0; box < variants[v].length; box++) {
            const { notes } = variants[v][box];
            if (!notes.length) continue;
            if (holdingShift(notes, boxFrets(entry, ref.mode, notes, ctx), drawn) !== undefined) {
                return { pattern, variant: v, box };
            }
        }
    }
    return { pattern, variant: variant ?? 0, box: 0 };
}

/** The first pattern/variant/box that holds every drawn note, or the whole neck if none does. */
export function initialScaleSelection(ref: ScaleRef, ctx: ShapeContext): ScaleSelection {
    for (const pattern of scalePatterns(ref)) {
        if (pattern === WHOLE_NECK) break;
        const sel = scaleSelectionFor(ref, ctx, pattern);
        const notes = scaleEntryFor(ref)?.altPatterns[pattern]?.[sel.variant]?.[sel.box]?.notes;
        if (notes?.length && holdingShift(notes, boxFrets(scaleEntryFor(ref) as ScaleEntry, ref.mode, notes, ctx), [...ctx.drawnKeys]) !== undefined) {
            return sel;
        }
    }
    return { pattern: WHOLE_NECK, variant: 0, box: 0 };
}

/** The notes of one shape of a scale, spelled against the mode's tonic (the drawn root). */
export function scaleShape(ref: ScaleRef, sel: ScaleSelection, ctx: ShapeContext): NotePosition[] {
    const entry = scaleEntryFor(ref);
    if (!entry) return [];
    const d = ref.mode;
    const tonicSemi = entry.intervals[d];
    const parentDegrees = entry.degrees.map(deg => parseInt(deg.match(/\d+/)?.[0] ?? '1'));
    const added = addedNoteDegrees(scaleModeName(entry, d));
    // a note's degree against the mode's tonic; added notes are spelled as the mode's name says
    const degreeFor = (parentIndex: number, semitones: number) =>
        added.get(semitones) ?? ((parentDegrees[parentIndex] - parentDegrees[d] + 7) % 7) + 1;

    if (sel.pattern === WHOLE_NECK) {
        const rootSemi = noteNameToSemitone(ctx.root);
        const degreeBySemi = new Map<number, number>();
        entry.intervals.forEach((iv, i) => {
            const s = (iv - tonicSemi + 12) % 12;
            degreeBySemi.set(s, degreeFor(i, s));
        });
        const neck: NotePosition[] = [];
        ctx.fretboardMap.forEach((row, string) =>
            row.forEach((cell, fret) => {
                const name = (cell || '').split('/')[0];
                if (!name) return;
                const semitones = (((noteNameToSemitone(name) - rootSemi) % 12) + 12) % 12;
                const degree = degreeBySemi.get(semitones);
                if (degree !== undefined) neck.push({ string, fret, semitones, degree, isTonic: semitones === 0 });
            }),
        );
        return neck;
    }

    const box = entry.altPatterns[sel.pattern]?.[sel.variant]?.[sel.box];
    if (!box?.notes.length) return [];
    const base = boxFrets(entry, d, box.notes, ctx);
    const drawn = [...ctx.drawnKeys];
    let shift = holdingShift(box.notes, base, drawn);
    if (shift === undefined) {
        // this box doesn't hold the drawing: show the copy of it nearest to the drawn notes
        const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
        const fits = [0, -12, 12].filter(s => Math.min(...base) + s >= 0 && Math.max(...base) + s <= 24);
        const target = drawn.length ? mean(drawn.map(k => Number(k.split(':')[1]))) : mean(base);
        shift = fits.sort((a, b) => Math.abs(mean(base) + a - target) - Math.abs(mean(base) + b - target))[0] ?? 0;
    }
    return box.notes.map((n, i) => {
        const semitones = (n.semitones - tonicSemi + 12) % 12;
        return {
            string: n.string,
            fret: base[i] + (shift as number),
            semitones,
            degree: degreeFor(n.degree, semitones),
            isTonic: n.semitones === tonicSemi,
        };
    });
}

/**
 * One match per scale mode whose notes include every drawn note. The drawn root
 * is the mode's tonic. The match starts on the first shape of it that holds the
 * drawing, or the whole neck when the notes span several boxes (an open chord).
 */
function scaleMatches(input: DrawMatchInput): DrawMatch[] {
    const { drawnSemis } = input;
    if (drawnSemis.length < MIN_PITCH_CLASSES_FOR_SCALES) return [];
    const results: DrawMatch[] = [];

    // the everyday scales first, the exotic groups last
    const rank = (group: string) => (GROUP_ORDER.includes(group) ? GROUP_ORDER.indexOf(group) : GROUP_ORDER.length);
    for (const [group, scales] of Object.entries(SCALE_SHAPES).sort((a, b) => rank(a[0]) - rank(b[0]))) {
        for (const [scaleName, entry] of Object.entries(scales)) {
            for (let d = 0; d < entry.intervals.length; d++) {
                // every drawn pitch class must be a note of this mode
                const modeSemis = new Set(entry.intervals.map(i => (i - entry.intervals[d] + 12) % 12));
                if (!drawnSemis.every(s => modeSemis.has(s))) continue;
                const ref: ScaleRef = { group, scale: scaleName, mode: d };
                results.push({
                    tab: 'Scales',
                    displayLabel: scaleModeName(entry, d) ?? `${entry.name} Pos. ${d + 1}`,
                    contextLabel: ['Scales', group, entry.name].join(' · '),
                    qualityKey: '',
                    finalFormulas: {},
                    posKey: '',
                    altIndex: 0,
                    scale: ref,
                    scaleSelection: initialScaleSelection(ref, input),
                });
            }
        }
    }
    return results;
}

/** Chords first, then scales. */
export function findDrawMatches(input: DrawMatchInput): DrawMatch[] {
    if (!input.drawnSemis.length) return [];
    return [...chordMatches(input), ...scaleMatches(input)];
}

/**
 * The notes to put on the fretboard for a match: the scale shape it starts on
 * (or `scaleSelection`, once the user has changed it), or the chord voicing that
 * contains the drawn notes (this match's own shape first).
 */
export function shapeForMatch(match: DrawMatch, ctx: ShapeContext, scaleSelection?: ScaleSelection): NotePosition[] | null {
    const { drawnPositions, root, fretboardMap } = ctx;
    if (match.tab === 'Scales') {
        const sel = scaleSelection ?? match.scaleSelection;
        if (!match.scale || !sel) return null;
        const notes = scaleShape(match.scale, sel, ctx);
        return notes.length ? sortShape(notes) : null;
    }
    const posData = match.finalFormulas[match.posKey] as any;
    if (!posData) return null;
    const variants = [posData, ...(Array.isArray(posData.altShapes) ? posData.altShapes : [])];
    const order = [match.altIndex, ...variants.map((_, i) => i).filter(i => i !== match.altIndex)];
    for (const i of order) {
        const raw = generateAllVoicingsForShape(root, variants[i], fretboardMap) || [];
        const voicings: NotePosition[][] = Array.isArray(raw[0]) ? (raw as any) : [raw as any];
        const hit = voicings.find(v =>
            [...drawnPositions.entries()].every(([s, f]) => v.some((n: NotePosition) => n.string === s && n.fret === f)),
        );
        if (hit) return sortShape(hit);
    }
    return null;
}
