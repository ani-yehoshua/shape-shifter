// GENERATED FILE -- do not edit. Source: lib/theory/glossary.ts (the website's lib is the single source).
// Edit that file, then run `npm run sync:mobile` from the repo root.
// The only hand-written teaching text in the info sheet: short, factual
// descriptions of the chord qualities and voicing ideas the app uses.
// Everything else the sheet says is worked out from what's on screen
// (see chordInfo.ts / scaleInfo.ts).

export type QualityInfo = {
    /** how the quality is written in the app */
    short: string;
    /** full name */
    name: string;
    /** one or two sentences: what it is and what it sounds like / does */
    blurb: string;
};

export const QUALITY_INFO: Record<string, QualityInfo> = {
    Maj: {
        short: 'Major',
        name: 'Major triad',
        blurb: 'The root, a major 3rd and a perfect 5th. The bright, stable sound most songs are built on.',
    },
    Min: {
        short: 'Minor',
        name: 'Minor triad',
        blurb: 'The root, a minor 3rd and a perfect 5th. It is a major triad with the 3rd lowered a half step, and that one note flips the mood.',
    },
    Aug: {
        short: 'Augmented',
        name: 'Augmented triad',
        blurb: 'The root, a major 3rd and a raised (augmented) 5th. Two major thirds stacked, so it sounds tense and unresolved.',
    },
    Dim: {
        short: 'Diminished',
        name: 'Diminished triad',
        blurb: 'The root, a minor 3rd and a lowered (diminished) 5th. Two minor thirds stacked; unstable, and it tends to resolve.',
    },
    Maj7: {
        short: 'Maj7',
        name: 'Major 7th',
        blurb: 'A major triad with a major 7th on top. Smooth and open with a little jazz in it; it is the I and IV chord of a major key.',
    },
    Min7: {
        short: 'Min7',
        name: 'Minor 7th',
        blurb: 'A minor triad with a minor (flat) 7th on top. Mellow and relaxed; it is the ii, iii and vi chord of a major key.',
    },
    Dom7: {
        short: 'Dom7',
        name: 'Dominant 7th',
        blurb: 'A major triad with a minor (flat) 7th. The 3rd and the flat 7th form a tritone, which creates the pull to resolve; it is the V chord of a major key.',
    },
    Min7b5: {
        short: 'Min7♭5',
        name: 'Half-diminished 7th',
        blurb: 'A diminished triad with a minor 7th (also called half-diminished). Dark and leaning; it is the vii chord of a major key and the ii chord of a minor key.',
    },
    'Maj7#5': {
        short: 'Maj7♯5',
        name: 'Major 7th with a raised 5th',
        blurb: 'A major 7th chord whose 5th is raised a half step. Dreamy and unresolved; it appears on the 3rd degree of the harmonic minor scale.',
    },
    mMaj7: {
        short: 'mMaj7',
        name: 'Minor-major 7th',
        blurb: 'A minor triad with a major 7th. Dark but with an unresolved shimmer; it is the I chord of the melodic and harmonic minor scales.',
    },
    Dim7: {
        short: 'Dim7',
        name: 'Diminished 7th',
        blurb: 'A diminished triad plus a diminished 7th, so it is built entirely from minor 3rds. It is symmetrical: any of its notes can act as the root.',
    },
};

export const CATEGORY_BLURB: Record<string, string> = {
    CAGED:
        'Five movable chord shapes named for the open chords they come from (C, A, G, E, D). Slide each one up the neck with a barre and together they cover the whole fretboard for any major chord.',
    Triads: 'Three-note chords played on three strings. A small, clear view of the chord: just the root, 3rd and 5th.',
    Sevenths: 'Four-note chords: a triad plus a 7th. Spreading the notes across four strings is what the voicing names below describe.',
    Shells: 'Just the root, 3rd and 7th. The 5th is left out because the 3rd and 7th are the notes that define what kind of chord it is.',
};

export const VOICING_BLURB: Record<string, string> = {
    'Drop 2':
        'Start with the chord stacked as close together as possible, then drop the second-highest note down an octave. This spreads the notes out so they fit comfortably on four adjacent strings.',
    'Drop 3':
        'The same idea, but drop the third-highest note down an octave. It leaves a bigger gap above the bass note, which suits the lower strings.',
    'Drop 2 of 2': 'Apply the Drop 2 move twice, for an even wider spread than a single Drop 2.',
    'Drop 3 of 2': 'Do a Drop 2, then drop the third-highest note of the result another octave.',
    'Raise 3/1 of 2': 'Take a voicing and raise its first and third voices from the top by an octave, for a wide, open sound.',
};

export const INVERSION_BLURB = [
    'root position: the root is the lowest note',
    'first inversion: the 3rd is the lowest note',
    'second inversion: the 5th is the lowest note',
    'third inversion: the 7th is the lowest note',
];

export const NPS_BLURB: Record<string, string> = {
    '2nps': 'Two notes per string. Fewer notes per string means bigger position shifts up the neck; it is the usual way to play pentatonic scales.',
    '3nps': 'Three notes per string. The same hand shape repeats from string to string, which makes long runs smooth and the scale easy to see across the neck.',
    '4nps': 'Four notes per string. Wider stretches, but fewer string changes.',
    'Std.': 'The standard fingering box for this scale.',
};
