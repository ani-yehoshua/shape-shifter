// Core constants
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_BASE: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
};

// Natural major-scale semitone offsets by degree
export const MAJOR_SCALE_OFFSETS: Record<number, number> = {
    1: 0,
    2: 2,
    3: 4,
    4: 5,
    5: 7,
    6: 9,
    7: 11,
};

// Fallback semitone → degree index (0 = unison, 1 = second, …)
const DEGREE_INDEX: Record<number, number> = {
    0: 0,
    1: 1,
    2: 1,
    3: 2,
    4: 2,
    5: 3,
    6: 4,
    7: 4,
    8: 4,
    9: 5,
    10: 6,
    11: 6,
};

// Helpers
const wrap12 = (n: number) => ((n % 12) + 12) % 12;
const normDiff = (d: number) => {
    d = wrap12(d);
    return d > 6 ? d - 12 : d;
};
const accidentalFromDiff = (d: number): string =>
    d === 0
        ? ''
        : d === 1
          ? '#'
          : d === -1
            ? 'b'
            : d === 2
              ? '##'
              : d === -2
                ? 'bb'
                : d > 0
                  ? '#'.repeat(d)
                  : 'b'.repeat(-d);

function accidentalOffset(acc: string): number {
    let n = 0;
    for (const ch of acc) {
        if (ch === '#' || ch === '♯') n += 1;
        else if (ch === 'b' || ch === '♭') n -= 1;
    }
    return n;
}

/** Parse a note name like "C#", "Eb", or "F" into a 0–11 semitone. */
export function noteNameToSemitone(name: string): number {
    const letter = name[0].toUpperCase();
    const acc = name.slice(1) || '';
    const base = LETTER_BASE[letter] ?? 0;
    const offset = accidentalOffset(acc);
    return wrap12(base + offset);
}

/**
 * Spell an interval number relative to a given root.
 * Returns e.g. "R", "b3", "#5", "bb7"
 */
export function spellInterval(
    rootName: string,
    semitones: number,
    degree: number,
): string {
    if (MAJOR_SCALE_OFFSETS[degree] === wrap12(semitones)) {
        return degree === 1 ? 'R' : String(degree);
    }
    const rootSem = noteNameToSemitone(rootName);
    const naturalAbs = wrap12(rootSem + MAJOR_SCALE_OFFSETS[degree]);
    const actualAbs = wrap12(rootSem + semitones);
    const diff = normDiff(actualAbs - naturalAbs);
    return accidentalFromDiff(diff) + String(degree);
}

/**
 * Spell a note name relative to a given root.
 * Returns e.g. "C", "D#", "Eb", "G"
 */
export function spellNote(
    rootName: string,
    semitones: number,
    degreeHint?: number,
): string {
    const rootLetter = rootName[0].toUpperCase();
    const rootIdx = LETTERS.indexOf(rootLetter);
    const s = wrap12(semitones);

    if (s === 0 && (degreeHint == null || degreeHint === 1)) {
        return rootName[0].toUpperCase() + rootName.slice(1);
    }

    const degree =
        degreeHint != null && degreeHint >= 1 && degreeHint <= 7
            ? degreeHint
            : (DEGREE_INDEX[s] ?? 0) + 1;

    const letter = LETTERS[(rootIdx + (degree - 1)) % 7];
    const rootSem = noteNameToSemitone(rootName);
    const baseL = LETTER_BASE[letter];
    const target = wrap12(rootSem + s);
    const diff = normDiff(target - baseL);

    return letter + accidentalFromDiff(diff);
}
