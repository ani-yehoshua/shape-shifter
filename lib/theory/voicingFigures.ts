// Pictures for the "About <voicing>" section of the info panel, all on a mini
// fretboard: (1) the chord stacked as close together as possible, one note per
// string on the top four strings (the "piano voicing", a diagonal staircase,
// e.g. Cmaj7 = 4th string 10th fret, 3rd 9th, 2nd 8th, 1st 7th), (2) each
// "drop" move, where the lowered note lands on the next lower string, and
// (3) the real shape that's on screen. They are returned as plain drawing
// primitives (rects, circles, lines, text) so the website and the app only
// need a thin SVG renderer and can't disagree about what the picture is.
//
// The derivation (closed stack -> drop moves) is checked against the shape
// that is actually on screen; if it doesn't reproduce it exactly, only the
// real shape is drawn, so a picture never claims a derivation the app's own
// shape doesn't follow.
import type { ChordQuality } from '@/lib/chordQualities';
import { noteNameToSemitone, spellNote } from '@/lib/MusicTheory';
import type { ShapeNote } from './chordInfo';
import { ordinal } from './intervals';

/** Colour roles; each renderer maps these to its own palette. */
export type Paint = 'paper' | 'key' | 'accent' | 'moved' | 'onAccent' | 'text' | 'line' | 'faint';

export type Prim =
    | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: Paint; stroke?: Paint; dash?: boolean }
    | { t: 'circle'; cx: number; cy: number; r: number; fill?: Paint; stroke?: Paint; dash?: boolean }
    | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: Paint; w?: number }
    | { t: 'path'; d: string; stroke?: Paint; fill?: Paint; w?: number }
    | { t: 'text'; x: number; y: number; s: string; size: number; fill: Paint; anchor?: 'start' | 'middle' | 'end'; bold?: boolean };

export type DiagramSpec = { width: number; height: number; prims: Prim[] };
export type Figure = { caption: string; diagram: DiagramSpec };

// Each entry is the list of "drop the Nth voice from the top" moves, in order.
const MOVES: Record<string, number[]> = {
    'Drop 2': [2],
    'Drop 3': [3],
    'Drop 2 of 2': [2, 2],
    'Drop 3 of 2': [2, 3],
};

type Voice = { pitch: number; tone: number };
const mod12 = (n: number) => ((n % 12) + 12) % 12;

// ── Mini fretboard ────────────────────────────────────────────────────────

const STRING_GAP = 26;
const FRET_GAP = 26;
const LEFT = 30;
const TOP = 24;

type Dot = { column: number; fret: number; label: string; moved: boolean };
type Spot = { column: number; fret: number };
type FretWindow = { start: number; span: number };

/** The frets to draw: from the nut if the shape is low, otherwise from its lowest fret. */
function fretWindow(frets: number[]): FretWindow {
    const fretted = frets.filter(f => f > 0);
    const minFret = fretted.length ? Math.min(...fretted) : 1;
    const maxFret = fretted.length ? Math.max(...fretted) : 1;
    const start = minFret <= 2 || frets.includes(0) ? 1 : minFret;
    return { start, span: Math.max(4, maxFret - start + 1) };
}

function fretboardDiagram(
    played: Dot[],
    stringCount: number,
    opts: { window?: FretWindow; moves?: { from: Spot; to: Spot }[] } = {},
): DiagramSpec {
    const { start, span } = opts.window ?? fretWindow(played.map(n => n.fret));
    const width = LEFT + (stringCount - 1) * STRING_GAP + 16;
    const height = TOP + span * FRET_GAP + 8;
    const x = (column: number) => LEFT + column * STRING_GAP;
    const prims: Prim[] = [];

    for (let f = 0; f <= span; f++) {
        const isNut = f === 0 && start === 1;
        prims.push({
            t: 'line',
            x1: x(0),
            y1: TOP + f * FRET_GAP,
            x2: x(stringCount - 1),
            y2: TOP + f * FRET_GAP,
            stroke: 'line',
            w: isNut ? 3.5 : 1,
        });
    }
    for (let c = 0; c < stringCount; c++) {
        prims.push({ t: 'line', x1: x(c), y1: TOP, x2: x(c), y2: TOP + span * FRET_GAP, stroke: 'line', w: 1 });
    }
    if (start > 1) {
        prims.push({ t: 'text', x: 2, y: TOP + FRET_GAP / 2 + 4, s: `${start}fr`, size: 11, fill: 'text', anchor: 'start', bold: true });
    }

    const playedColumns = new Set(played.map(n => n.column));
    for (let c = 0; c < stringCount; c++) {
        if (!playedColumns.has(c)) prims.push({ t: 'text', x: x(c), y: TOP - 9, s: '×', size: 12, fill: 'faint', anchor: 'middle' });
    }
    const rowY = (fret: number) => TOP + (fret - start + 0.5) * FRET_GAP;

    // where a dropped note used to be (dashed) and an arrow to where it landed
    for (const { from, to } of opts.moves ?? []) {
        const [x1, y1, x2, y2] = [x(from.column), rowY(from.fret), x(to.column), rowY(to.fret)];
        prims.push({ t: 'circle', cx: x1, cy: y1, r: 10, stroke: 'moved', dash: true });
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 30) continue;
        const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
        const [sx, sy, ex, ey] = [x1 + ux * 13, y1 + uy * 13, x2 - ux * 13, y2 - uy * 13];
        prims.push({ t: 'line', x1: sx, y1: sy, x2: ex, y2: ey, stroke: 'moved', w: 1.6 });
        prims.push({
            t: 'path',
            d: `M ${ex} ${ey} L ${ex - ux * 7 - uy * 4} ${ey - uy * 7 + ux * 4} L ${ex - ux * 7 + uy * 4} ${ey - uy * 7 - ux * 4} Z`,
            fill: 'moved',
        });
    }
    for (const n of played) {
        if (n.fret === 0) {
            // open string: a lettered dot above the nut
            prims.push({ t: 'circle', cx: x(n.column), cy: TOP - 12, r: 9, fill: n.moved ? 'moved' : 'accent' });
            prims.push({ t: 'text', x: x(n.column), y: TOP - 8.5, s: n.label, size: 10, fill: 'onAccent', anchor: 'middle', bold: true });
            continue;
        }
        const cy = rowY(n.fret);
        prims.push({ t: 'circle', cx: x(n.column), cy, r: 10, fill: n.moved ? 'moved' : 'accent' });
        prims.push({ t: 'text', x: x(n.column), y: cy + 3.5, s: n.label, size: 10, fill: 'onAccent', anchor: 'middle', bold: true });
    }
    return { width, height, prims };
}

// ── Derivation ────────────────────────────────────────────────────────────

/** Gaps between consecutive pitches, so two voicings can be compared regardless of octave. */
function gaps(pitches: number[]) {
    return pitches.slice(1).map((p, i) => p - pitches[i]);
}

function dropVoice(voices: Voice[], fromTop: number): Voice[] {
    const sorted = [...voices].sort((a, b) => a.pitch - b.pitch);
    const idx = sorted.length - fromTop;
    sorted[idx] = { ...sorted[idx], pitch: sorted[idx].pitch - 12 };
    return sorted.sort((a, b) => a.pitch - b.pitch);
}

/** Closed-position stacks of the chord (root position and each inversion) with the drop moves applied. */
function deriveSteps(rootPc: number, quality: ChordQuality, moves: number[], actualGaps: string): Voice[][] | null {
    const base: Voice[] = quality.intervals.map((semi, tone) => ({ pitch: rootPc + semi, tone }));
    let closed = base;
    for (let inversion = 0; inversion < base.length; inversion++) {
        const steps: Voice[][] = [closed];
        for (const fromTop of moves) steps.push(dropVoice(steps[steps.length - 1], fromTop));
        const end = steps[steps.length - 1];
        if (gaps(end.map(v => v.pitch)).join(',') === actualGaps) return steps;
        const [lowest, ...rest] = [...closed].sort((a, b) => a.pitch - b.pitch);
        closed = [...rest, { ...lowest, pitch: lowest.pitch + 12 }];
    }
    return null;
}

type Placed = { tone: number; string: number; fret: number };

/**
 * Puts the closed stack on the top strings (lowest note on the lowest of them,
 * the staircase), then each dropped note on the next string below the lowest in
 * use. Tries octaves from the bottom up and takes the first where every fret
 * in every step is playable.
 */
function placeOnGuitar(steps: Voice[][], moves: number[], tuningMidi: number[]): Placed[][] | null {
    const closed = [...steps[0]].sort((a, b) => a.pitch - b.pitch);
    for (let octave = 0; octave <= 8; octave++) {
        const pitchOf = new Map(closed.map(v => [v.tone, v.pitch + 12 * octave]));
        let current = closed.map((v, i) => ({ tone: v.tone, string: closed.length - 1 - i }));
        const snapshot = () => current.map(c => ({ ...c, fret: (pitchOf.get(c.tone) as number) - tuningMidi[c.string] }));
        const out: Placed[][] = [];
        if (closed.length > tuningMidi.length) return null;
        out.push(snapshot());
        let ok = true;
        for (let i = 0; i < moves.length && ok; i++) {
            const before = [...steps[i]].sort((a, b) => a.pitch - b.pitch);
            const mover = before[before.length - moves[i]];
            const landing = Math.max(...current.map(c => c.string)) + 1;
            if (landing >= tuningMidi.length) {
                ok = false;
                break;
            }
            pitchOf.set(mover.tone, (pitchOf.get(mover.tone) as number) - 12);
            current = current.map(c => (c.tone === mover.tone ? { ...c, string: landing } : c));
            out.push(snapshot());
        }
        if (ok && out.every(step => step.every(p => p.fret >= 0 && p.fret <= 20))) return out;
    }
    return null;
}

export type VoicingFigureInput = {
    rootNote: string;
    quality: ChordQuality;
    voicingType: string;
    /** only the notes that are actually played (fret not null) */
    shape: (ShapeNote & { semitones: number })[];
    /** open-string MIDI notes, high to low */
    tuningMidi: number[];
};

export function voicingFigures(input: VoicingFigureInput): Figure[] {
    const { rootNote, quality, voicingType, shape, tuningMidi } = input;
    if (shape.length < 3 || shape.some(n => n.fret == null)) return [];
    const moves = MOVES[voicingType];
    const rootPc = mod12(noteNameToSemitone(rootNote));

    const toneOf = (semitones: number) => quality.intervals.findIndex(i => mod12(i) === mod12(semitones));
    const name = (tone: number) => spellNote(rootNote, quality.intervals[tone], quality.degrees[tone]);

    const actual = shape
        .map(n => ({ pitch: tuningMidi[n.string] + (n.fret ?? 0), tone: toneOf(n.semitones), n }))
        .filter(v => v.tone >= 0)
        .sort((a, b) => a.pitch - b.pitch);
    if (actual.length !== shape.length) return [];

    const actualGaps = gaps(actual.map(v => v.pitch)).join(',');
    const derived = moves && quality.intervals.length === actual.length ? deriveSteps(rootPc, quality, moves, actualGaps) : null;

    const stringCount = tuningMidi.length;
    const figures: Figure[] = [];
    const movedTones = new Set<number>();
    const lowToHigh = (voices: Voice[]) => [...voices].sort((a, b) => a.pitch - b.pitch).map(v => name(v.tone)).join(' – ');
    const dots = (placed: Placed[]): Dot[] =>
        placed.map(p => ({ column: stringCount - 1 - p.string, fret: p.fret, label: name(p.tone), moved: movedTones.has(p.tone) }));
    const spot = (p: Placed): Spot => ({ column: stringCount - 1 - p.string, fret: p.fret });

    const placed = derived && moves ? placeOnGuitar(derived, moves, tuningMidi) : null;
    if (derived && moves && placed) {
        const window = fretWindow(placed.flat().map(p => p.fret));
        const closed = derived[0];
        const firstMover = [...closed].sort((a, b) => a.pitch - b.pitch)[closed.length - moves[0]];
        movedTones.add(firstMover.tone);
        figures.push({
            caption: `Start with the chord stacked as close together as possible, one note per string on the top ${closed.length} strings (what a piano player would play): ${lowToHigh(closed)}. The ${ordinal(moves[0])} note from the top (${name(firstMover.tone)}) is the one that drops (blue).`,
            diagram: fretboardDiagram(dots(placed[0]), stringCount, { window }),
        });
        moves.forEach((fromTop, i) => {
            const before = [...derived[i]].sort((a, b) => a.pitch - b.pitch);
            const mover = before[before.length - fromTop];
            movedTones.add(mover.tone);
            const from = placed[i].find(p => p.tone === mover.tone)!;
            const to = placed[i + 1].find(p => p.tone === mover.tone)!;
            const next = moves[i + 1];
            const after = derived[i + 1];
            const nextMover = next ? [...after].sort((a, b) => a.pitch - b.pitch)[after.length - next] : null;
            figures.push({
                caption:
                    `Drop ${name(mover.tone)} down an octave. It lands on string ${to.string + 1}, below the others. Low to high the notes are now ${lowToHigh(after)}.` +
                    (nextMover ? ` Next, the ${ordinal(next)} note from the top (${name(nextMover.tone)}) drops too.` : ''),
                diagram: fretboardDiagram(dots(placed[i + 1]), stringCount, { window, moves: [{ from: spot(from), to: spot(to) }] }),
            });
        });
    }

    const realStrings = actual.map(v => v.n.string + 1);
    figures.push({
        caption: placed
            ? `Slide those notes onto the strings you chose and you get the shape on your fretboard: the same notes, now on strings ${Math.min(...realStrings)}–${Math.max(...realStrings)} (low string on the left, blue = the dropped note).`
            : 'This shape on the fretboard (low string on the left).',
        diagram: fretboardDiagram(
            actual.map(v => ({
                column: stringCount - 1 - v.n.string,
                fret: v.n.fret ?? 0,
                label: name(v.tone),
                moved: movedTones.has(v.tone),
            })),
            stringCount,
        ),
    });
    return figures;
}
