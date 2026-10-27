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

/** "Drop/raise the Nth voice from the top by an octave". */
type Move = { drop: number } | { raise: number };

// Raise 3/1 of 2 = a Drop 2, then the 1st and 3rd voices from the top go up an octave.
const RAISE_RECIPE: Move[] = [{ drop: 2 }, { raise: 1 }, { raise: 3 }];
const RAISE_NAME = 'Raise 3/1 of 2';

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

function moveVoice(voices: Voice[], move: Move): Voice[] {
    const sorted = [...voices].sort((a, b) => a.pitch - b.pitch);
    const [fromTop, delta] = 'drop' in move ? [move.drop, -12] : [move.raise, 12];
    const idx = sorted.length - fromTop;
    sorted[idx] = { ...sorted[idx], pitch: sorted[idx].pitch + delta };
    return sorted.sort((a, b) => a.pitch - b.pitch);
}

/** Closed-position stacks of the chord (root position and each inversion) with the moves applied. */
function deriveSteps(rootPc: number, quality: ChordQuality, moves: Move[], actualGaps: string): Voice[][] | null {
    const base: Voice[] = quality.intervals.map((semi, tone) => ({ pitch: rootPc + semi, tone }));
    let closed = base;
    for (let inversion = 0; inversion < base.length; inversion++) {
        const steps: Voice[][] = [closed];
        for (const move of moves) steps.push(moveVoice(steps[steps.length - 1], move));
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

// ── Raise 3/1 of 2 ────────────────────────────────────────────────────────
// closed stack -> Drop 2 -> whole shape down an octave -> raise the 1st and 3rd
// voices from the top an octave -> slide any note that is outside the shape to
// the same note on the next string.

type Frame = { kind: 'closed' | 'drop' | 'shift' | 'raise'; tone?: number; placed: Placed[] };

/** A placement is playable when higher notes sit on higher strings (lower index). */
function inOrder(placed: { tone: number; string: number }[], pitchOf: Map<number, number>) {
    const asc = [...placed].sort((a, b) => (pitchOf.get(a.tone) as number) - (pitchOf.get(b.tone) as number));
    return asc.every((p, i) => i === 0 || p.string < asc[i - 1].string);
}

/** Every way to put these voices on strings, most compact first: smallest fret span, then fewest empty strings between them. */
function compactStrings(voices: Voice[], tuningMidi: number[]): { tone: number; string: number }[][] {
    const asc = [...voices].sort((a, b) => a.pitch - b.pitch);
    const found: { cost: number; strings: number[] }[] = [];
    const pick = (i: number, chosen: number[]) => {
        if (i === asc.length) {
            const fretted = chosen.map((s, k) => asc[k].pitch - tuningMidi[s]).filter(f => f > 0);
            const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
            const emptyBetween = chosen[0] - chosen[chosen.length - 1] + 1 - chosen.length;
            const open = chosen.filter((s, k) => asc[k].pitch === tuningMidi[s]).length;
            found.push({ cost: span * 10 + emptyBetween * 3 + open * 12, strings: [...chosen] });
            return;
        }
        for (let s = 0; s < tuningMidi.length; s++) {
            const fret = asc[i].pitch - tuningMidi[s];
            if (fret < 0 || fret > 15) continue;
            if (i > 0 && s >= chosen[i - 1]) continue;
            pick(i + 1, [...chosen, s]);
        }
    };
    pick(0, []);
    return found.sort((a, b) => a.cost - b.cost).map(f => asc.map((v, i) => ({ tone: v.tone, string: f.strings[i] })));
}

/** `choice` picks the nth most compact arrangement for the "down an octave" step, so a later raise that has nowhere to land can try the next. */
function placeRaise(steps: Voice[][], tuningMidi: number[], octave: number, choice: number): Frame[] | null {
    const closed = [...steps[0]].sort((a, b) => a.pitch - b.pitch);
    if (closed.length > tuningMidi.length) return null;
    const pitchOf = new Map(closed.map(v => [v.tone, v.pitch + 12 * octave]));
    let current: { tone: number; string: number }[] = closed.map((v, i) => ({ tone: v.tone, string: closed.length - 1 - i }));
    const snapshot = () => current.map(c => ({ ...c, fret: (pitchOf.get(c.tone) as number) - tuningMidi[c.string] }));
    const moverOf = (i: number) => {
        const before = [...steps[i]].sort((a, b) => a.pitch - b.pitch);
        const m = RAISE_RECIPE[i];
        return before[before.length - ('drop' in m ? m.drop : m.raise)].tone;
    };
    const frames: Frame[] = [{ kind: 'closed', placed: snapshot() }];

    // the drop: the lowered note lands on the string below the lowest one in use
    const dropTone = moverOf(0);
    const landing = Math.max(...current.map(c => c.string)) + 1;
    if (landing >= tuningMidi.length) return null;
    pitchOf.set(dropTone, (pitchOf.get(dropTone) as number) - 12);
    current = current.map(c => (c.tone === dropTone ? { ...c, string: landing } : c));
    frames.push({ kind: 'drop', tone: dropTone, placed: snapshot() });

    // the whole shape down an octave, sitting on the most compact strings
    for (const [tone, pitch] of pitchOf) pitchOf.set(tone, pitch - 12);
    const compact = compactStrings([...pitchOf].map(([tone, pitch]) => ({ tone, pitch })), tuningMidi)[choice];
    if (!compact) return null;
    current = compact;
    frames.push({ kind: 'shift', placed: snapshot() });

    // each raised note goes up an octave, usually two strings higher
    for (let i = 1; i < RAISE_RECIPE.length; i++) {
        const tone = moverOf(i);
        const old = current.find(c => c.tone === tone) as { tone: number; string: number };
        const pitch = (pitchOf.get(tone) as number) + 12;
        pitchOf.set(tone, pitch);
        const landingString = [-2, -1, 0, -3, -4, -5]
            .map(d => old.string + d)
            .find(s => {
                if (s < 0) return false;
                const fret = pitch - tuningMidi[s];
                return fret >= 0 && fret <= 22 && inOrder(current.map(c => (c.tone === tone ? { ...c, string: s } : c)), pitchOf);
            });
        if (landingString === undefined) return null;
        current = current.map(c => (c.tone === tone ? { ...c, string: landingString } : c));
        frames.push({ kind: 'raise', tone, placed: snapshot() });
    }
    return frames.every(f => f.placed.every(p => p.fret >= 0 && p.fret <= 22)) ? frames : null;
}

type RaiseInput = {
    quality: ChordQuality;
    tuningMidi: number[];
    actual: { pitch: number; tone: number; n: ShapeNote & { semitones: number } }[];
    name: (tone: number) => string;
    rootPc: number;
    actualGaps: string;
};

function raiseFigures({ quality, tuningMidi, actual, name, rootPc, actualGaps }: RaiseInput): Figure[] {
    const stringCount = tuningMidi.length;
    const derived = quality.intervals.length === actual.length ? deriveSteps(rootPc, quality, RAISE_RECIPE, actualGaps) : null;

    // Prefer the octave that puts the result exactly where the real shape is, so the last step is a true slide.
    let frames: Frame[] | null = null;
    if (derived) {
        const end = [...derived[derived.length - 1]].sort((a, b) => a.pitch - b.pitch);
        const aligned = (actual[0].pitch - end[0].pitch) / 12 + 1;
        for (const octave of [aligned, 0, 1, 2, 3, 4, 5, 6, 7, 8]) {
            if (!Number.isInteger(octave)) continue;
            for (let choice = 0; choice < 600 && !frames; choice++) frames = placeRaise(derived, tuningMidi, octave, choice);
            if (frames) break;
        }
    }

    const moved = new Set<number>();
    const col = (string: number) => stringCount - 1 - string;
    const dots = (placed: Placed[]): Dot[] => placed.map(p => ({ column: col(p.string), fret: p.fret, label: name(p.tone), moved: moved.has(p.tone) }));
    const spot = (p: Placed): Spot => ({ column: col(p.string), fret: p.fret });
    const realDots = (): Dot[] => actual.map(v => ({ column: col(v.n.string), fret: v.n.fret ?? 0, label: name(v.tone), moved: moved.has(v.tone) }));
    const figures: Figure[] = [];

    if (derived && frames) {
        const [closed, dropped, shifted, raiseA, raiseB] = frames;
        const last = frames[frames.length - 1];
        const lowToHigh = (placed: Placed[]) => [...placed].sort((a, b) => b.string - a.string).map(p => name(p.tone)).join(' – ');
        const stringsOf = (placed: Placed[]) => `${Math.min(...placed.map(p => p.string)) + 1}–${Math.max(...placed.map(p => p.string)) + 1}`;
        const of = (frame: Frame, tone: number) => frame.placed.find(p => p.tone === tone) as Placed;
        const windowA = fretWindow([...closed.placed, ...dropped.placed].map(p => p.fret));
        const sameRealShape = last.placed.every(p => {
            const real = actual.find(v => v.tone === p.tone);
            return real !== undefined && real.pitch === tuningMidi[p.string] + p.fret;
        });
        const slid = sameRealShape ? actual.filter(v => of(last, v.tone).string !== v.n.string) : [];
        const windowB = fretWindow([...frames.slice(2).flatMap(f => f.placed.map(p => p.fret)), ...(sameRealShape ? actual.map(v => v.n.fret ?? 0) : [])]);

        const dropTone = dropped.tone as number;
        moved.add(dropTone);
        figures.push({
            caption: `Start with the chord stacked as close together as possible, one note per string on the top ${closed.placed.length} strings (what a piano player would play): ${lowToHigh(closed.placed)}. This first becomes a Drop 2: the 2nd note from the top (${name(dropTone)}) drops an octave (blue).`,
            diagram: fretboardDiagram(dots(closed.placed), stringCount, { window: windowA }),
        });
        figures.push({
            caption: `Drop ${name(dropTone)} down an octave. It lands on string ${of(dropped, dropTone).string + 1}, below the others. Low to high the notes are now ${lowToHigh(dropped.placed)}.`,
            diagram: fretboardDiagram(dots(dropped.placed), stringCount, {
                window: windowA,
                moves: [{ from: spot(of(closed, dropTone)), to: spot(of(dropped, dropTone)) }],
            }),
        });
        figures.push({
            caption: `Take that whole shape down an octave: the same notes, now sitting together on strings ${stringsOf(shifted.placed)}.`,
            diagram: fretboardDiagram(dots(shifted.placed), stringCount, { window: windowB }),
        });
        [raiseA, raiseB].forEach((frame, i) => {
            const before = i === 0 ? shifted : raiseA;
            const tone = frame.tone as number;
            moved.add(tone);
            const fromTop = i === 0 ? '1st' : '3rd';
            figures.push({
                caption: `Raise the ${fromTop} note from the top (${name(tone)}) up an octave. It lands on string ${of(frame, tone).string + 1}.`,
                diagram: fretboardDiagram(dots(frame.placed), stringCount, {
                    window: windowB,
                    moves: [{ from: spot(of(before, tone)), to: spot(of(frame, tone)) }],
                }),
            });
        });
        if (slid.length) {
            figures.push({
                caption: `Finally, a note that sits outside the shape slides to the same note on the next string (${slid.map(v => `${name(v.tone)} to string ${v.n.string + 1}`).join(', ')}) and you have the whole shape on your fretboard (low string on the left, blue = the notes that moved).`,
                diagram: fretboardDiagram(realDots(), stringCount, {
                    window: windowB,
                    moves: slid.map(v => ({ from: spot(of(last, v.tone)), to: { column: col(v.n.string), fret: v.n.fret ?? 0 } })),
                }),
            });
            return figures;
        }
        if (sameRealShape) {
            figures[figures.length - 1].caption += ' That is the shape on your fretboard.';
            return figures;
        }
    }

    figures.push({
        caption: 'This shape on the fretboard (low string on the left).',
        diagram: fretboardDiagram(realDots(), stringCount),
    });
    return figures;
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
    if (voicingType === RAISE_NAME) return raiseFigures({ quality, tuningMidi, actual, name, rootPc, actualGaps });
    const derived =
        moves && quality.intervals.length === actual.length
            ? deriveSteps(rootPc, quality, moves.map(drop => ({ drop })), actualGaps)
            : null;

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
