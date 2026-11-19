// GENERATED FILE -- do not edit. Source: lib/drawMatches.ts (the website's lib is the single source).
// Edit that file, then run `npm run sync:mobile` from the repo root.
// Draw Mode's "Find chord": everything in the library that contains the notes
// you drew. Chords match once per inversion and alternate shape; scales match
// once per mode, pattern and variant. Each match carries a full label (which
// tab it lives on and the whole path to it) so someone who only remembers part
// of a shape can read the rest off the result. Shared by the website and the
// mobile app, which both used to carry their own copy of the chord half.
import { generateAllVoicingsForShape, NOTES } from './fretboardMap';
import type { NotePosition } from './fretboardMap';
import { noteNameToSemitone } from './MusicTheory';
import { SCALE_SHAPES } from './Shapes/Scales';

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

export type DrawMatch = {
    tab: 'Chords' | 'Scales';
    /** "Maj7", "Dorian": shown after the root */
    displayLabel: string;
    /** the whole path, e.g. "Chords · Sevenths · Drop 2 · High String Set · 1st Inv. · Shape 2/3" */
    contextLabel: string;
    // chords (empty for scales)
    qualityKey: string;
    finalFormulas: Record<string, any>;
    posKey: string;
    /** 0 = the shape itself, n = its nth alternate */
    altIndex: number;
    // scales: the notes to show for this mode/pattern/variant
    scaleNotes?: NotePosition[];
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
            for (const [posKey, formula] of Object.entries<any>(node.options)) {
                const variants = [formula, ...(Array.isArray(formula?.altShapes) ? formula.altShapes : [])];
                variants.forEach((variant, altIndex) => {
                    if (!semisMatch(variant) || !coversDrawn(variant)) return;
                    results.push({
                        tab: 'Chords',
                        displayLabel: QUALITY_DISPLAY[qualityKey] ?? qualityKey,
                        // path = [category, voicing, string set, quality]: the quality is already the title
                        contextLabel: [
                            'Chords',
                            ...path.slice(0, -1),
                            formula?.name || posKey,
                            variants.length > 1 ? `Shape ${altIndex + 1}/${variants.length}` : '',
                        ]
                            .filter(Boolean)
                            .join(' · '),
                        qualityKey,
                        finalFormulas: node.options,
                        posKey,
                        altIndex,
                    });
                });
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

/**
 * Every place the drawn notes sit inside a scale. The drawn root is a mode's
 * tonic (so its parent scale is the root minus that mode's interval), and the
 * notes can lie in ANY box of the parent scale, not only the one that starts on
 * the tonic: C major drawn at frets 3-5 is in the box that starts on G. One row
 * per mode, pattern and variant (the first box that holds the notes), so every
 * mode that fits by pitch is listed whenever some box also holds the shape.
 */
function scaleMatches({ drawnSemis, drawnKeys, root, tuning, fretboardMap }: DrawMatchInput): DrawMatch[] {
    const drawn = [...drawnKeys];
    if (drawnSemis.length < MIN_PITCH_CLASSES_FOR_SCALES) return [];
    const rootIdx = NOTES.findIndex(pair => pair.includes(root));
    if (rootIdx < 0) return [];
    // how far each string is tuned from standard (signed, so Drop D is -2 on the low string)
    const delta = tuning.map((open, i) => {
        const d = (((noteNameToSemitone(open) - noteNameToSemitone(STANDARD_OPEN[i])) % 12) + 12) % 12;
        return d > 6 ? d - 12 : d;
    });
    const results: DrawMatch[] = [];

    // the everyday scales first, the exotic groups last
    const rank = (group: string) => (GROUP_ORDER.includes(group) ? GROUP_ORDER.indexOf(group) : GROUP_ORDER.length);
    for (const [group, scales] of Object.entries(SCALE_SHAPES).sort((a, b) => rank(a[0]) - rank(b[0]))) {
        for (const entry of Object.values(scales)) {
            const parentDegrees = entry.degrees.map(d => parseInt(d.match(/\d+/)?.[0] ?? '1'));
            for (let d = 0; d < entry.intervals.length; d++) {
                const tonicSemi = entry.intervals[d];
                // every drawn pitch class must be a note of this mode
                const modeSemis = new Set(entry.intervals.map(i => (i - tonicSemi + 12) % 12));
                if (!drawnSemis.every(s => modeSemis.has(s))) continue;

                // the parent scale is the root minus this mode's interval; its box offsets are relative to its root fret
                const rootFret = (((rootIdx - tonicSemi - 7) % 12) + 12) % 12;
                const modeName = scaleModeName(entry, d);
                const addedDegrees = addedNoteDegrees(modeName);
                const rowsBefore = results.length;

                for (const [patternKey, variants] of Object.entries(entry.altPatterns)) {
                    variants.forEach((positions, variantIdx) => {
                        for (let positionIdx = 0; positionIdx < positions.length; positionIdx++) {
                            const position = positions[positionIdx];
                            if (!position.notes.length) continue;
                            const base = position.notes.map(n => n.fretOffset + rootFret - (delta[n.string] ?? 0));
                            // the same box also sits an octave lower or higher when that stays on the 24 frets
                            const shift = [0, -12, 12].find(s => {
                                const frets = base.map(f => f + s);
                                if (Math.min(...frets) < 0 || Math.max(...frets) > 24) return false;
                                const have = new Set(position.notes.map((n, i) => `${n.string}:${frets[i]}`));
                                return drawn.every(key => have.has(key));
                            });
                            if (shift === undefined) continue;
                            results.push({
                                tab: 'Scales',
                                displayLabel: modeName ?? `${entry.name} Pos. ${d + 1}`,
                                contextLabel: [
                                    'Scales',
                                    group,
                                    entry.name,
                                    patternKey,
                                    variants.length > 1 ? `Variant ${variantIdx + 1}/${variants.length}` : '',
                                    `Box ${positionIdx + 1}/${positions.length}`,
                                ]
                                    .filter(Boolean)
                                    .join(' · '),
                                qualityKey: '',
                                finalFormulas: {},
                                posKey: '',
                                altIndex: 0,
                                scaleNotes: position.notes.map((n, i) => {
                                    const semitones = (n.semitones - tonicSemi + 12) % 12;
                                    return {
                                        string: n.string,
                                        fret: base[i] + shift,
                                        semitones,
                                        degree:
                                            addedDegrees.get(semitones) ??
                                            ((parentDegrees[n.degree] - parentDegrees[d] + 7) % 7) + 1,
                                        isTonic: n.semitones === tonicSemi,
                                    };
                                }),
                            });
                            break; // the first box that holds the notes is this pattern's answer
                        }
                    });
                }

                // The notes belong to this mode but no single box holds them all (an open
                // chord spread over two boxes, say): still list it, as the whole scale on the neck.
                if (results.length === rowsBefore) {
                    const rootSemi = noteNameToSemitone(root);
                    const degreeBySemi = new Map<number, number>();
                    entry.intervals.forEach((iv, i) => {
                        const s = (iv - tonicSemi + 12) % 12;
                        degreeBySemi.set(s, addedDegrees.get(s) ?? ((parentDegrees[i] - parentDegrees[d] + 7) % 7) + 1);
                    });
                    const neck: NotePosition[] = [];
                    fretboardMap.forEach((row, string) =>
                        row.forEach((cell, fret) => {
                            const name = (cell || '').split('/')[0];
                            if (!name) return;
                            const semitones = (((noteNameToSemitone(name) - rootSemi) % 12) + 12) % 12;
                            const degree = degreeBySemi.get(semitones);
                            if (degree !== undefined) neck.push({ string, fret, semitones, degree, isTonic: semitones === 0 });
                        }),
                    );
                    results.push({
                        tab: 'Scales',
                        displayLabel: modeName ?? `${entry.name} Pos. ${d + 1}`,
                        contextLabel: ['Scales', group, entry.name, 'Whole neck'].join(' · '),
                        qualityKey: '',
                        finalFormulas: {},
                        posKey: '',
                        altIndex: 0,
                        scaleNotes: neck,
                    });
                }
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
 * The notes to put on the fretboard for a match: the scale's box, or the chord
 * voicing that contains the drawn notes (this match's own shape first).
 */
export function shapeForMatch(
    match: DrawMatch,
    drawnPositions: Map<number, number>,
    root: string,
    fretboardMap: string[][],
): NotePosition[] | null {
    if (match.tab === 'Scales') return match.scaleNotes ? sortShape(match.scaleNotes) : null;
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
