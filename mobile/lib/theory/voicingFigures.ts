// GENERATED FILE -- do not edit. Source: lib/theory/voicingFigures.ts (the website's lib is the single source).
// Edit that file, then run `npm run sync:mobile` from the repo root.
// Pictures for the "About <voicing>" section of the info panel: the chord
// stacked close together on a piano strip, each "drop" move applied, and the
// real shape on a mini fretboard. They are returned as plain drawing
// primitives (rects, circles, lines, text) so the website and the app only
// need a thin SVG renderer and can't disagree about what the picture is.
//
// The derivation (closed stack -> drop moves) is checked against the shape
// that is actually on screen; if it doesn't reproduce it exactly, only the
// piano strip of the real voicing and the fretboard are shown, so a picture
// never claims a derivation the app's own shape doesn't follow.
import type { ChordQuality } from '../chordQualities';
import { noteNameToSemitone, spellNote } from '../MusicTheory';
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
type PianoNote = { pitch: number; label: string; paint: 'accent' | 'moved' };

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const mod12 = (n: number) => ((n % 12) + 12) % 12;
const isWhite = (pitch: number) => WHITE_PCS.includes(mod12(pitch));

// ── Piano strip ───────────────────────────────────────────────────────────

const KEY_W = 20;
const KEY_H = 58;
const BLACK_W = 12;
const BLACK_H = 36;
const ARROW_H = 22;

function pianoRange(pitches: number[]) {
    let lo = Math.min(...pitches);
    let hi = Math.max(...pitches);
    while (!isWhite(lo)) lo--;
    while (!isWhite(hi)) hi++;
    return { lo, hi };
}

function pianoDiagram(range: { lo: number; hi: number }, notes: PianoNote[], move?: { from: number; to: number }): DiagramSpec {
    const whites: number[] = [];
    for (let p = range.lo; p <= range.hi; p++) if (isWhite(p)) whites.push(p);
    const whiteX = (pitch: number) => whites.indexOf(pitch) * KEY_W;
    // black keys sit on the line between the white keys either side of them
    const centerX = (pitch: number) => (isWhite(pitch) ? whiteX(pitch) + KEY_W / 2 : whiteX(pitch - 1) + KEY_W);
    const byPitch = new Map(notes.map(n => [n.pitch, n]));

    const prims: Prim[] = [];
    const top = move ? ARROW_H : 2;

    for (const p of whites) {
        const n = byPitch.get(p);
        prims.push({ t: 'rect', x: whiteX(p), y: top, w: KEY_W, h: KEY_H, r: 2, fill: n ? n.paint : 'paper', stroke: 'faint' });
        if (n) prims.push({ t: 'text', x: whiteX(p) + KEY_W / 2, y: top + KEY_H - 7, s: n.label, size: 9, fill: 'onAccent', anchor: 'middle', bold: true });
    }
    for (let p = range.lo; p <= range.hi; p++) {
        if (isWhite(p)) continue;
        const n = byPitch.get(p);
        const x = centerX(p) - BLACK_W / 2;
        prims.push({ t: 'rect', x, y: top, w: BLACK_W, h: BLACK_H, r: 2, fill: n ? n.paint : 'key', stroke: n ? undefined : 'key' });
        if (n) prims.push({ t: 'text', x: x + BLACK_W / 2, y: top + BLACK_H - 6, s: n.label, size: 8, fill: 'onAccent', anchor: 'middle', bold: true });
    }

    if (move) {
        // dashed outline where the note was, and an arrow to where it landed
        const fromX = centerX(move.from);
        const toX = centerX(move.to);
        const keyBlack = !isWhite(move.from);
        prims.push({
            t: 'rect',
            x: fromX - (keyBlack ? BLACK_W : KEY_W) / 2,
            y: top,
            w: keyBlack ? BLACK_W : KEY_W,
            h: keyBlack ? BLACK_H : KEY_H,
            r: 2,
            stroke: 'moved',
            dash: true,
        });
        const midX = (fromX + toX) / 2;
        prims.push({ t: 'path', d: `M ${fromX} ${top - 3} Q ${midX} ${-6} ${toX} ${top - 3}`, stroke: 'moved', w: 1.6 });
        prims.push({ t: 'path', d: `M ${toX - 4} ${top - 9} L ${toX} ${top - 2} L ${toX + 4} ${top - 9} Z`, fill: 'moved' });
    }

    return { width: whites.length * KEY_W, height: top + KEY_H + 2, prims };
}

// ── Mini fretboard ────────────────────────────────────────────────────────

const STRING_GAP = 26;
const FRET_GAP = 26;
const LEFT = 30;
const TOP = 24;

function fretboardDiagram(
    played: { column: number; fret: number; label: string; moved: boolean }[],
    stringCount: number,
): DiagramSpec {
    const fretted = played.map(n => n.fret).filter(f => f > 0);
    const minFret = fretted.length ? Math.min(...fretted) : 1;
    const maxFret = fretted.length ? Math.max(...fretted) : 1;
    const start = minFret <= 2 ? 1 : minFret;
    const span = Math.max(4, maxFret - start + 1);
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
    for (const n of played) {
        if (n.fret === 0) {
            prims.push({ t: 'circle', cx: x(n.column), cy: TOP - 10, r: 5, stroke: 'text' });
            continue;
        }
        const cy = TOP + (n.fret - start + 0.5) * FRET_GAP;
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

    const figures: Figure[] = [];
    const movedTones = new Set<number>();
    const pianoNotes = (voices: Voice[], moved: Set<number>): PianoNote[] =>
        voices.map(v => ({ pitch: v.pitch, label: name(v.tone), paint: moved.has(v.tone) ? 'moved' : 'accent' }));
    const lowToHigh = (voices: Voice[]) => [...voices].sort((a, b) => a.pitch - b.pitch).map(v => name(v.tone)).join(' – ');

    if (derived && moves) {
        const range = pianoRange(derived.flat().map(v => v.pitch));
        const closed = derived[0];
        const firstMover = [...closed].sort((a, b) => a.pitch - b.pitch)[closed.length - moves[0]];
        movedTones.add(firstMover.tone);
        figures.push({
            caption: `Stack the chord as close together as you can, the way you'd play it on a piano: ${lowToHigh(closed)}. The ${ordinal(moves[0])} note from the top (${name(firstMover.tone)}) is the one that moves (blue).`,
            diagram: pianoDiagram(range, pianoNotes(closed, movedTones)),
        });
        moves.forEach((fromTop, i) => {
            const before = [...derived[i]].sort((a, b) => a.pitch - b.pitch);
            const mover = before[before.length - fromTop];
            const after = derived[i + 1];
            movedTones.add(mover.tone);
            const landed = after.find(v => v.tone === mover.tone && v.pitch === mover.pitch - 12);
            const next = moves[i + 1];
            const nextMover = next ? [...after].sort((a, b) => a.pitch - b.pitch)[after.length - next] : null;
            figures.push({
                caption:
                    `Drop ${name(mover.tone)} down an octave. Low to high the notes are now ${lowToHigh(after)}.` +
                    (nextMover ? ` Next, the ${ordinal(next)} note from the top (${name(nextMover.tone)}) drops too.` : ''),
                diagram: pianoDiagram(range, pianoNotes(after, movedTones), landed ? { from: mover.pitch, to: landed.pitch } : undefined),
            });
        });
    } else {
        // anchor the lowest note to its real pitch class (root + its interval), keep the real gaps
        const shift = actual[0].pitch - (rootPc + quality.intervals[actual[0].tone]);
        const voices = actual.map(v => ({ pitch: v.pitch - shift, tone: v.tone }));
        figures.push({
            caption: `This shape's notes, low to high, drawn as piano keys: ${lowToHigh(voices)}.`,
            diagram: pianoDiagram(pianoRange(voices.map(v => v.pitch)), pianoNotes(voices, movedTones)),
        });
    }

    const stringCount = tuningMidi.length;
    figures.push({
        caption: derived
            ? 'Spread out like that, the notes fit four adjacent strings. Put them on the strings you chose and this is the shape on your fretboard (low string on the left, blue = the dropped note).'
            : 'The same notes on the fretboard (low string on the left).',
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
