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

/** A plain shape on the mini fretboard (low string on the left), e.g. a chord saved in a progression. */
export function shapeDiagram(dots: { string: number; fret: number; label: string }[], stringCount: number): DiagramSpec {
    return fretboardDiagram(
        dots.map(d => ({ column: stringCount - 1 - d.string, fret: d.fret, label: d.label, moved: false })),
        stringCount,
    );
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

type Derived = {
    /** steps[0] is the closed stack in the inversion the shape comes from; steps[i + 1] is after move i */
    steps: Voice[][];
    /** how many times the root-position stack was inverted to get steps[0] */
    inversion: number;
    /** the root-position closed stack: the default every picture sequence starts from */
    base: Voice[];
};

/** The first inversion of the closed stack that the moves turn into the shape on screen. */
function deriveSteps(rootPc: number, quality: ChordQuality, moves: Move[], actualGaps: string): Derived | null {
    const base: Voice[] = quality.intervals.map((semi, tone) => ({ pitch: rootPc + semi, tone }));
    let closed = base;
    for (let inversion = 0; inversion < base.length; inversion++) {
        const steps: Voice[][] = [closed];
        for (const move of moves) steps.push(moveVoice(steps[steps.length - 1], move));
        const end = steps[steps.length - 1];
        if (gaps(end.map(v => v.pitch)).join(',') === actualGaps) return { steps, inversion, base };
        const [lowest, ...rest] = [...closed].sort((a, b) => a.pitch - b.pitch);
        closed = [...rest, { ...lowest, pitch: lowest.pitch + 12 }];
    }
    return null;
}

type Placed = { tone: number; string: number; fret: number };

// ── The picture sequence ──────────────────────────────────────────────────
// Every voicing starts from the same place, the "piano voicing" on guitar: the
// chord stacked in thirds, one note per string on the top four strings (Cmaj7 =
// 1st string 7th fret, 2nd 8th, 3rd 9th, 4th 10th). From there:
//   default  that root-position stack
//   invert   turned into the inversion the shape on screen comes from (if not root position)
//   drop     a voice lowered an octave, landing on the string below the lowest in use
//   adjust   (only when another move follows) the shape moved onto adjacent
//            strings so it is a real shape; before a raise it also goes down an octave
//   raise    a voice raised an octave, usually two strings higher
// then the real shape on screen.

type Frame = {
    kind: 'default' | 'invert' | 'drop' | 'adjust' | 'raise';
    tone?: number;
    /** an inversion drawn an octave lower than the default so it fits on the neck */
    lowered?: boolean;
    placed: Placed[];
};

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

/**
 * One try at laying the sequence out. `octave` places the default stack;
 * `lowerInversion` shows an inverted stack an octave lower when it would run off
 * the neck; `choice` picks the nth most compact arrangement for the "adjust"
 * step, so a later move that has nowhere to land can try the next.
 */
function planFrames(
    d: Derived,
    moves: Move[],
    tuningMidi: number[],
    octave: number,
    lowerInversion: boolean,
    minDefaultFret: number,
    choice: number,
): Frame[] | null {
    const base = [...d.base].sort((a, b) => a.pitch - b.pitch);
    if (base.length > tuningMidi.length) return null;
    const pitchOf = new Map(base.map(v => [v.tone, v.pitch + 12 * octave]));
    let current: { tone: number; string: number }[] = base.map((v, i) => ({ tone: v.tone, string: base.length - 1 - i }));
    const snapshot = () => current.map(c => ({ ...c, fret: (pitchOf.get(c.tone) as number) - tuningMidi[c.string] }));
    const frames: Frame[] = [{ kind: 'default', placed: snapshot() }];

    if (d.inversion > 0) {
        const inverted = [...d.steps[0]].sort((a, b) => a.pitch - b.pitch);
        for (const v of inverted) pitchOf.set(v.tone, v.pitch + 12 * octave - (lowerInversion ? 12 : 0));
        current = inverted.map((v, i) => ({ tone: v.tone, string: inverted.length - 1 - i }));
        frames.push({ kind: 'invert', lowered: lowerInversion, placed: snapshot() });
    } else if (lowerInversion) {
        return null; // only inversions get lowered
    }

    const hasRaise = moves.some(m => 'raise' in m);
    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const before = [...d.steps[i]].sort((a, b) => a.pitch - b.pitch);
        const mover = before[before.length - ('drop' in move ? move.drop : move.raise)].tone;
        if ('drop' in move) {
            // the lowered note lands on the string below the lowest one in use
            const landing = Math.max(...current.map(c => c.string)) + 1;
            if (landing >= tuningMidi.length) return null;
            pitchOf.set(mover, (pitchOf.get(mover) as number) - 12);
            current = current.map(c => (c.tone === mover ? { ...c, string: landing } : c));
            frames.push({ kind: 'drop', tone: mover, placed: snapshot() });
            // another move follows: first make the shape a real one on adjacent strings
            if (i === 0 && moves.length > 1) {
                if (hasRaise) for (const [tone, pitch] of pitchOf) pitchOf.set(tone, pitch - 12);
                const compact = compactStrings([...pitchOf].map(([tone, pitch]) => ({ tone, pitch })), tuningMidi)[choice];
                if (!compact) return null;
                current = compact;
                frames.push({ kind: 'adjust', placed: snapshot() });
            }
        } else {
            // a raised note goes up an octave, usually two strings higher
            const old = current.find(c => c.tone === mover) as { tone: number; string: number };
            const pitch = (pitchOf.get(mover) as number) + 12;
            pitchOf.set(mover, pitch);
            const landingString = [-2, -1, 0, -3, -4, -5]
                .map(delta => old.string + delta)
                .find(s => {
                    if (s < 0) return false;
                    const fret = pitch - tuningMidi[s];
                    return fret >= 0 && fret <= 22 && inOrder(current.map(c => (c.tone === mover ? { ...c, string: s } : c)), pitchOf);
                });
            if (landingString === undefined) return null;
            current = current.map(c => (c.tone === mover ? { ...c, string: landingString } : c));
            frames.push({ kind: 'raise', tone: mover, placed: snapshot() });
        }
    }
    const ok = frames.every((f, i) => f.placed.every(p => p.fret >= (i === 0 ? minDefaultFret : 0) && p.fret <= 22));
    return ok ? frames : null;
}

/**
 * The default stack sits as low on the neck as it can with every note fretted
 * (Cmaj7 = 10-9-8-7); failing that an open string is allowed, and an inversion
 * that would run off the neck is shown an octave lower.
 */
function placeFrames(d: Derived, moves: Move[], tuningMidi: number[]): Frame[] | null {
    const tries = moves.length > 1 ? 600 : 1;
    for (const minDefaultFret of [1, 0]) {
        for (const lowerInversion of [false, true]) {
            for (let octave = 0; octave <= 8; octave++) {
                for (let choice = 0; choice < tries; choice++) {
                    const frames = planFrames(d, moves, tuningMidi, octave, lowerInversion, minDefaultFret, choice);
                    if (frames) return frames;
                }
            }
        }
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
    const moves: Move[] | undefined =
        voicingType === RAISE_NAME ? RAISE_RECIPE : MOVES[voicingType]?.map(drop => ({ drop }));
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
    const frames = derived && moves ? placeFrames(derived, moves, tuningMidi) : null;

    const stringCount = tuningMidi.length;
    const col = (string: number) => stringCount - 1 - string;
    const moved = new Set<number>();
    const dots = (placed: Placed[]): Dot[] => placed.map(p => ({ column: col(p.string), fret: p.fret, label: name(p.tone), moved: moved.has(p.tone) }));
    const spot = (p: Placed): Spot => ({ column: col(p.string), fret: p.fret });
    const realDots = (): Dot[] => actual.map(v => ({ column: col(v.n.string), fret: v.n.fret ?? 0, label: name(v.tone), moved: moved.has(v.tone) }));
    const figures: Figure[] = [];

    if (derived && moves && frames) {
        const lowToHigh = (placed: Placed[]) => [...placed].sort((a, b) => b.string - a.string).map(p => name(p.tone)).join(' – ');
        const stringsOf = (placed: Placed[]) => `${Math.min(...placed.map(p => p.string)) + 1}–${Math.max(...placed.map(p => p.string)) + 1}`;
        const of = (frame: Frame, tone: number) => frame.placed.find(p => p.tone === tone) as Placed;
        const moveSize = (m: Move) => ('drop' in m ? m.drop : m.raise);
        // "1st/2nd/3rd note from the top" ("ordinal" would call the 1st the root)
        const nth = (n: number) => ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;
        const moverAt = (step: number) => {
            const sorted = [...derived.steps[step]].sort((a, b) => a.pitch - b.pitch);
            return sorted[sorted.length - moveSize(moves[step])].tone;
        };
        const last = frames[frames.length - 1];
        const adjustAt = frames.findIndex(f => f.kind === 'adjust');
        const sameRealShape = last.placed.every(p => {
            const real = actual.find(v => v.tone === p.tone);
            return real !== undefined && real.pitch === tuningMidi[p.string] + p.fret;
        });
        const slid = sameRealShape ? actual.filter(v => of(last, v.tone).string !== v.n.string) : [];
        // frames share a fret window so the notes that don't move stay put; an adjust starts a new one
        const windowA = fretWindow(frames.slice(0, adjustAt < 0 ? frames.length : adjustAt).flatMap(f => f.placed.map(p => p.fret)));
        const windowB =
            adjustAt < 0
                ? windowA
                : fretWindow([...frames.slice(adjustAt).flatMap(f => f.placed.map(p => p.fret)), ...(sameRealShape ? actual.map(v => v.n.fret ?? 0) : [])]);

        frames.forEach((frame, i) => {
            const prev = frames[i - 1];
            const window = adjustAt >= 0 && i >= adjustAt ? windowB : windowA;
            if (frame.kind === 'default') {
                const first = moverAt(0);
                moved.add(first);
                const verb = 'drop' in moves[0] ? 'drops' : 'goes up an octave';
                figures.push({
                    caption:
                        `Start with the chord stacked as close together as possible, one note per string on the top ${frame.placed.length} strings, the way a piano player would play it: ${lowToHigh(frame.placed)}.` +
                        (derived.inversion === 0 ? ` The ${nth(moveSize(moves[0]))} note from the top (${name(first)}) is the one that ${verb} (blue).` : ''),
                    diagram: fretboardDiagram(dots(frame.placed), stringCount, { window }),
                });
            } else if (frame.kind === 'invert') {
                const sorted = [...derived.base].sort((a, b) => a.pitch - b.pitch);
                const jumped = sorted.slice(0, derived.inversion).map(v => name(v.tone));
                const invName = ['', '1st inversion', '2nd inversion', '3rd inversion'][derived.inversion] ?? `inversion ${derived.inversion}`;
                figures.push({
                    caption:
                        `Turn it into the ${invName}: ${jumped.join(' and ')} ${jumped.length === 1 ? 'jumps' : 'jump'} up an octave. Low to high: ${lowToHigh(frame.placed)}.` +
                        ` The ${nth(moveSize(moves[0]))} note from the top (${name(moverAt(0))}) is the one that ${'drop' in moves[0] ? 'drops' : 'goes up'} (blue).` +
                        (frame.lowered ? ' It is drawn an octave lower so it fits on the neck.' : ''),
                    diagram: fretboardDiagram(dots(frame.placed), stringCount, { window }),
                });
            } else if (frame.kind === 'drop') {
                const tone = frame.tone as number;
                moved.add(tone);
                figures.push({
                    caption: `Drop ${name(tone)} down an octave. It lands on string ${of(frame, tone).string + 1}, below the others. Low to high the notes are now ${lowToHigh(frame.placed)}.`,
                    diagram: fretboardDiagram(dots(frame.placed), stringCount, {
                        window,
                        moves: [{ from: spot(of(prev, tone)), to: spot(of(frame, tone)) }],
                    }),
                });
            } else if (frame.kind === 'adjust') {
                const hasRaise = moves.some(m => 'raise' in m);
                const nextMove = moves[1];
                const next = nextMove && 'drop' in nextMove ? moverAt(1) : null;
                figures.push({
                    caption:
                        (hasRaise
                            ? `Adjust it to a real shape: take the whole thing down an octave and sit it on adjacent strings, ${stringsOf(frame.placed)}.`
                            : `Adjust it to a real shape: move it onto adjacent strings, ${stringsOf(frame.placed)}.`) +
                        (next !== null && nextMove ? ` Next, the ${nth(moveSize(nextMove))} note from the top (${name(next)}) drops too.` : ''),
                    diagram: fretboardDiagram(dots(frame.placed), stringCount, { window }),
                });
            } else {
                const tone = frame.tone as number;
                moved.add(tone);
                const size = moveSize(moves[moves.findIndex((_, k) => moverAt(k) === tone)] ?? moves[0]);
                figures.push({
                    caption: `Raise the ${nth(size)} note from the top (${name(tone)}) up an octave. It lands on string ${of(frame, tone).string + 1}.`,
                    diagram: fretboardDiagram(dots(frame.placed), stringCount, {
                        window,
                        moves: [{ from: spot(of(prev, tone)), to: spot(of(frame, tone)) }],
                    }),
                });
            }
        });

        if (slid.length) {
            figures.push({
                caption: `Finally, slide any note that is outside your shape to the same note on another string (${slid.map(v => `${name(v.tone)} to string ${v.n.string + 1}`).join(', ')}) and you have the whole shape on your fretboard (low string on the left, blue = the notes that moved).`,
                diagram: fretboardDiagram(realDots(), stringCount, {
                    window: adjustAt >= 0 ? windowB : fretWindow([...frames.flatMap(f => f.placed.map(p => p.fret)), ...actual.map(v => v.n.fret ?? 0)]),
                    moves: slid.map(v => ({ from: spot(of(last, v.tone)), to: { column: col(v.n.string), fret: v.n.fret ?? 0 } })),
                }),
            });
            return figures;
        }
        if (sameRealShape) {
            figures[figures.length - 1].caption += ' That is the shape on your fretboard.';
            return figures;
        }
        const realStrings = actual.map(v => v.n.string + 1);
        figures.push({
            caption: `Move those notes onto the strings you chose and you get the shape on your fretboard: the same notes, now on strings ${Math.min(...realStrings)}–${Math.max(...realStrings)} (low string on the left, blue = the notes that moved).`,
            diagram: fretboardDiagram(realDots(), stringCount),
        });
        return figures;
    }

    figures.push({
        caption: 'This shape on the fretboard (low string on the left).',
        diagram: fretboardDiagram(realDots(), stringCount),
    });
    return figures;
}
