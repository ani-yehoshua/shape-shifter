// GENERATED FILE -- do not edit. Source: lib/theory/chordInfo.ts (the website's lib is the single source).
// Edit that file, then run `npm run sync:mobile` from the repo root.
// "What am I looking at?" for a chord on the fretboard: turns the selection and
// the dots on screen into a short, accurate explanation. Nothing here is
// video or free-form copy: everything except the glossary is computed from the
// app's own theory data, so it can't drift from what the app shows.
import { CHORD_QUALITIES } from '../chordQualities';
import type { ChordQuality } from '../chordQualities';
import { diatonicChords, STACKED_THIRDS_3, STACKED_THIRDS_7 } from '../harmony';
import { MAJOR_SCALE_OFFSETS, noteNameToSemitone, spellNote } from '../MusicTheory';
import { SCALE_SHAPES } from '../Shapes/Scales';
import { CATEGORY_BLURB, INVERSION_BLURB, QUALITY_INFO, VOICING_BLURB } from './glossary';
import { intervalName, keyName, ordinal, stringName } from './intervals';
import { voicingFigures } from './voicingFigures';
import type { Figure } from './voicingFigures';

export type InfoSection =
    | { kind: 'text'; title: string; paragraphs: string[]; figures?: Figure[] }
    | { kind: 'list'; title: string; intro?: string; items: { label: string; value: string }[] };

export type InfoContent = { title: string; subtitle?: string; sections: InfoSection[] };

export type ShapeNote = {
    string: number;
    fret: number | null;
    semitones: number | null;
    degree: number | null;
};

export type ChordInfoInput = {
    /** the chord's sounding root, e.g. "C", "Eb" */
    rootNote: string;
    /** a CHORD_QUALITIES key, e.g. "Maj7" (ignored for CAGED, which is always major) */
    qualityKey: string;
    /** "CAGED" | "Triads" | "Sevenths" | "Shells" */
    category: string;
    voicingType?: string;
    /** the CAGED shape name or inversion, e.g. "Root", "1st Inv.", "E" */
    position?: string;
    /** the dots currently on the fretboard; empty when several positions are shown at once ("All") */
    shape: ShapeNote[];
    /** open-string MIDI notes, high to low */
    tuningMidi: number[];
    /** open-string names, high to low */
    tuningNotes: string[];
    /** how many alternate shapes this chord has (including the first) */
    altCount?: number;
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const NUMERAL_SUFFIX: Record<string, string> = {
    Maj: '',
    Min: '',
    Aug: '+',
    Dim: '°',
    Maj7: 'maj7',
    Min7: '7',
    Dom7: '7',
    Min7b5: 'ø7',
    'Maj7#5': 'maj7♯5',
    mMaj7: 'm(maj7)',
    Dim7: '°7',
};
// qualities whose 3rd is minor or diminished are written with a lowercase numeral
const LOWERCASE_NUMERAL = new Set(['Min', 'Dim', 'Min7', 'Min7b5', 'mMaj7', 'Dim7']);
const FAMILIES: string[][] = [
    ['Maj', 'Min', 'Aug', 'Dim'],
    ['Maj7', 'Dom7', 'Min7', 'Min7b5', 'mMaj7', 'Maj7#5', 'Dim7'],
];
const KEY_SCALES = ['Major', 'Harmonic Minor', 'Melodic Minor', 'Harmonic Major'];

function qualityTitle(qualityKey: string): string {
    return QUALITY_INFO[qualityKey]?.short ?? qualityKey;
}

function numeral(degreeIdx: number, scaleIntervals: number[], qualityKey: string): string {
    const diff = scaleIntervals[degreeIdx] - MAJOR_SCALE_OFFSETS[degreeIdx + 1];
    const accidental = diff < 0 ? '♭'.repeat(-diff) : diff > 0 ? '♯'.repeat(diff) : '';
    const base = LOWERCASE_NUMERAL.has(qualityKey) ? ROMAN[degreeIdx].toLowerCase() : ROMAN[degreeIdx];
    return `${accidental}${base}${NUMERAL_SUFFIX[qualityKey] ?? ''}`;
}

/** Where a chord of this root and quality turns up when you stack thirds on a scale. */
function whereItLives(rootNote: string, qualityKey: string, quality: ChordQuality) {
    const structure = quality.intervals.length === 3 ? STACKED_THIRDS_3 : STACKED_THIRDS_7;
    const rootSemi = noteNameToSemitone(rootNote);
    const items: { label: string; value: string }[] = [];
    const sevenNote = SCALE_SHAPES['7-note'];
    for (const scaleName of KEY_SCALES) {
        const scale = sevenNote[scaleName];
        if (!scale) continue;
        const hits: string[] = [];
        diatonicChords(scale.intervals, structure).forEach((c, d) => {
            if (c.qualityKey !== qualityKey) return;
            const tonic = rootSemi - scale.intervals[d];
            hits.push(`${numeral(d, scale.intervals, qualityKey)} in ${keyName(tonic)}`);
        });
        if (hits.length) items.push({ label: scaleName, value: hits.join('\n') });
    }
    return items;
}

/** "lower the 7th a half step" style description of what changes going from one quality to another. */
function describeChange(from: ChordQuality, to: ChordQuality): { text: string; count: number } | null {
    if (from.intervals.length !== to.intervals.length) return null;
    const parts: string[] = [];
    from.intervals.forEach((semi, i) => {
        const delta = to.intervals[i] - semi;
        if (delta === 0) return;
        const size = Math.abs(delta) === 1 ? 'a half step' : Math.abs(delta) === 2 ? 'a whole step' : `${Math.abs(delta)} half steps`;
        parts.push(`${delta < 0 ? 'lower' : 'raise'} the ${ordinal(from.degrees[i])} ${size}`);
    });
    return parts.length ? { text: parts.join(' and '), count: parts.length } : null;
}

export function explainChord(input: ChordInfoInput): InfoContent {
    const { rootNote, category, voicingType, position, shape, tuningMidi, tuningNotes, altCount = 1 } = input;
    const isCaged = category === 'CAGED';
    const qualityKey = isCaged ? 'Maj' : input.qualityKey;
    const quality = CHORD_QUALITIES[qualityKey];
    const info = QUALITY_INFO[qualityKey];
    const sections: InfoSection[] = [];

    if (!quality) {
        return { title: `${rootNote} ${qualityKey}`, sections: [{ kind: 'text', title: 'About', paragraphs: ['No notes are available for this chord yet.'] }] };
    }

    // ── 1. What the chord is ──────────────────────────────────────────────
    const toneItems = quality.intervals.map((semi, i) => ({
        label: spellNote(rootNote, semi, quality.degrees[i]),
        value: intervalName(quality.degrees[i], semi),
    }));
    // a shape that leaves a tone out (shells have no 5th, some voicings drop one)
    const played = shape.filter((n): n is ShapeNote & { semitones: number } => n.fret != null && n.semitones != null);
    const playedSemis = new Set(played.map(n => ((n.semitones % 12) + 12) % 12));
    const items = toneItems.map((it, i) =>
        played.length && !playedSemis.has(((quality.intervals[i] % 12) + 12) % 12)
            ? { ...it, value: `${it.value} — not in this shape` }
            : it,
    );
    sections.push({
        kind: 'list',
        title: 'The chord',
        intro: info?.blurb,
        items,
    });

    // ── 2. This shape: which note is on which string ──────────────────────
    if (played.length) {
        const byPitch = [...played].sort(
            (a, b) => tuningMidi[b.string] + (b.fret ?? 0) - (tuningMidi[a.string] + (a.fret ?? 0)),
        );
        const low = byPitch[byPitch.length - 1]; // lowest-sounding note is the last of "high to low"
        const lowToHigh = [...byPitch].reverse();
        sections.push({
            kind: 'list',
            title: 'In this shape (low to high)',
            items: lowToHigh.map(n => ({
                label: `${spellNote(rootNote, n.semitones, n.degree ?? undefined)} · ${intervalName(n.degree ?? 1, n.semitones)}`,
                value: `${stringName(n.string, tuningNotes)}, fret ${n.fret}`,
            })),
        });

        const paragraphs: string[] = [];
        if (isCaged) {
            paragraphs.push(
                position && position !== 'All'
                    ? `This is the ${position}-shape: the fingering of the open ${position} chord, moved up the neck.`
                    : 'Each CAGED shape is the fingering of an open chord, moved up the neck.',
            );
        } else {
            const bassDegree = low.degree ?? 1;
            const inv = [1, 3, 5, 7].indexOf(bassDegree);
            if (inv >= 0) paragraphs.push(`The lowest note is the ${bassDegree === 1 ? 'root' : ordinal(bassDegree)}, so this is ${INVERSION_BLURB[inv].split(':')[0]}.`);
            const strings = played.map(n => n.string + 1);
            paragraphs.push(`It is played on strings ${Math.min(...strings)}–${Math.max(...strings)}.`);
        }
        sections.push({ kind: 'text', title: 'How it is laid out', paragraphs });
    }

    // ── 3. What the voicing/category means ───────────────────────────────
    const howBuilt: string[] = [];
    if (CATEGORY_BLURB[category]) howBuilt.push(CATEGORY_BLURB[category]);
    if (voicingType && VOICING_BLURB[voicingType]) howBuilt.push(`${voicingType}: ${VOICING_BLURB[voicingType]}`);
    const figures =
        category === 'Sevenths' && voicingType && played.length
            ? voicingFigures({ rootNote, quality, voicingType, shape: played, tuningMidi })
            : [];
    if (howBuilt.length)
        sections.push({
            kind: 'text',
            title: `About ${category === 'Sevenths' && voicingType ? voicingType : category}`,
            paragraphs: howBuilt,
            ...(figures.length ? { figures } : {}),
        });

    // ── 4. Where it lives ────────────────────────────────────────────────
    const lives = whereItLives(rootNote, qualityKey, quality);
    sections.push(
        lives.length
            ? {
                  kind: 'list',
                  title: 'Where this chord lives',
                  intro: 'Stack thirds on these scales and this chord shows up here (Roman numerals are the scale degree):',
                  items: lives,
              }
            : {
                  kind: 'text',
                  title: 'Where this chord lives',
                  paragraphs: [`${rootNote} ${qualityTitle(qualityKey)} doesn't come from stacking thirds on the major, harmonic minor or melodic minor scale.`],
              },
    );

    // ── 5. One note away (neighbouring qualities) ─────────────────────────
    const family = FAMILIES.find(f => f.includes(qualityKey)) ?? [];
    const neighbours = family
        .filter(k => k !== qualityKey)
        .map(k => ({ k, change: describeChange(quality, CHORD_QUALITIES[k]) }))
        .filter((x): x is { k: string; change: { text: string; count: number } } => x.change != null)
        .sort((a, b) => a.change.count - b.change.count)
        .slice(0, 3);
    if (neighbours.length) {
        sections.push({
            kind: 'list',
            title: 'One note away',
            intro: 'How this chord turns into its neighbours:',
            items: neighbours.map(n => ({ label: `→ ${qualityTitle(n.k)}`, value: n.change.text })),
        });
    }

    // ── 6. Things to try ─────────────────────────────────────────────────
    const tries: string[] = [];
    const defining = quality.degrees.filter(d => d === 3 || d === 7);
    tries.push(
        defining.length === 2
            ? 'Switch to Intervals and find the 3rd and the 7th. Those two notes decide whether the chord sounds major, minor or dominant.'
            : 'Switch to Intervals and find the 3rd. It decides whether the chord sounds major or minor.',
    );
    // CAGED has no quality picker, so only suggest changing the quality where you can
    if (neighbours[0] && !isCaged) tries.push(`Change the quality to ${qualityTitle(neighbours[0].k)} and see which dots move: ${neighbours[0].change.text}.`);
    if (isCaged) tries.push('Step through the five shapes (C, A, G, E, D) at the same root. They are all the same chord in different places on the neck.');
    if (altCount > 1) tries.push('Step through the alternate shapes. The notes are the same; only the register and fingering change.');
    sections.push({ kind: 'text', title: 'Try this', paragraphs: tries });

    return {
        title: `${rootNote} ${qualityTitle(qualityKey)}`,
        subtitle: [info?.name, isCaged ? 'CAGED' : voicingType ?? category].filter(Boolean).join(' · '),
        sections,
    };
}
