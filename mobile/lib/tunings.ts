export type Tuning = {
    name: string;
    notes: string[];     // high to low: string 0 = high e
    semitones: number[]; // MIDI note numbers, high to low
    freqs: number[];     // open-string Hz, high to low
};

function midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function t(name: string, notes: string[], midis: number[]): Tuning {
    return { name, notes, semitones: midis, freqs: midis.map(midiToFreq) };
}

export const TUNINGS: Tuning[] = [
    t("Standard",    ["E",  "B",  "G",  "D",  "A",  "E"],  [64,59,55,50,45,40]),
    t("Drop D",      ["E",  "B",  "G",  "D",  "A",  "D"],  [64,59,55,50,45,38]),
    t("Open G",      ["D",  "B",  "G",  "D",  "G",  "D"],  [62,59,55,50,47,38]),
    t("Open D",      ["D",  "A",  "F#", "D",  "A",  "D"],  [62,57,54,50,45,38]),
    t("Open E",      ["E",  "B",  "G#", "E",  "B",  "E"],  [64,59,56,52,47,40]),
    t("DADGAD",      ["D",  "A",  "G",  "D",  "A",  "D"],  [62,57,55,50,45,38]),
    t("Eb Standard", ["Eb", "Bb", "Gb", "Db", "Ab", "Eb"], [63,58,54,49,44,39]),
    t("D Standard",  ["D",  "A",  "F",  "C",  "G",  "D"],  [62,57,53,48,43,38]),
    t("Drop C",      ["D",  "A",  "F",  "C",  "G",  "C"],  [62,57,53,48,43,36]),
];

export const STANDARD_TUNING = TUNINGS[0];
