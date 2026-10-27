/**
 * Checks the info-sheet text (lib/theory) against real shapes from the library:
 * the facts it states (note names, intervals, which key/degree a chord belongs
 * to, what changes between qualities) must be right, and it prints the text for
 * a few shapes so it can be read.
 *
 * Run:  npx tsx scripts/validate-theory.ts [--print]
 * Exits 1 if a fact is wrong.
 */
import { CHORD_SHAPES } from '../lib/Shapes/Chords.js';
import { SCALE_SHAPES } from '../lib/Shapes/Scales.js';
import { generateAllVoicingsForShape, generateFretboardMap } from '../lib/fretboardMap.js';
import type { NotePosition } from '../lib/fretboardMap.js';
import { explainChord, explainScale } from '../lib/theory/index.js';
import type { InfoContent } from '../lib/theory/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const print = process.argv.includes('--print');
const NOTES = ['E', 'B', 'G', 'D', 'A', 'E'];
const MIDI = [64, 59, 55, 50, 45, 40];
const map = generateFretboardMap(NOTES, 24);
let failed = false;
const check = (ok: boolean, msg: string) => {
    if (!ok) {
        failed = true;
        console.error(`  FAIL ${msg}`);
    }
};

const flat = (c: InfoContent) =>
    c.sections.flatMap(s => (s.kind === 'text' ? s.paragraphs : [s.intro ?? '', ...s.items.map(i => `${i.label} | ${i.value}`)])).join('\n');
const section = (c: InfoContent, title: string) => c.sections.find(s => s.title === title);

function lowestVoicing(root: string, formula: any): NotePosition[] {
    const all = generateAllVoicingsForShape(root, formula, map, MIDI);
    return all.sort((a, b) => Math.min(...a.map(n => n.fret)) - Math.min(...b.map(n => n.fret)))[0];
}

function show(c: InfoContent) {
    if (!print) return;
    console.log(`\n=== ${c.title}${c.subtitle ? `  (${c.subtitle})` : ''}`);
    for (const s of c.sections) {
        console.log(`-- ${s.title}`);
        if (s.kind === 'text') s.paragraphs.forEach(p => console.log(`   ${p}`));
        else {
            if (s.intro) console.log(`   ${s.intro}`);
            s.items.forEach(i => console.log(`   • ${i.label}  —  ${i.value}`));
        }
    }
}

const cs: any = CHORD_SHAPES;
const shape = (formula: any, root: string) => lowestVoicing(root, formula) as any[];

// ── Cmaj7, Drop 2, high strings, root position ────────────────────────────────
{
    const f = cs.Sevenths.options['Drop 2'].options['High String Set'].options['Maj7'].options['Root'];
    const c = explainChord({
        rootNote: 'C', qualityKey: 'Maj7', category: 'Sevenths', voicingType: 'Drop 2', position: 'Root',
        shape: shape(f, 'C'), tuningMidi: MIDI, tuningNotes: NOTES, altCount: 1,
    });
    show(c);
    const text = flat(c);
    const chord = section(c, 'The chord') as any;
    check(chord.items.map((i: any) => i.label).join(' ') === 'C E G B', `Cmaj7 notes: ${chord.items.map((i: any) => i.label)}`);
    check(/root/.test(chord.items[0].value) && /major 3rd/.test(chord.items[1].value) && /perfect 5th/.test(chord.items[2].value) && /major 7th/.test(chord.items[3].value), 'Cmaj7 interval names');
    check(/Imaj7 in C/.test(text) && /IVmaj7 in G/.test(text), 'Cmaj7 should be Imaj7 in C and IVmaj7 in G');
    check(/lower the 7th a half step/.test(text), 'Maj7 -> Dom7 should lower the 7th a half step');
    check(/root position/.test(text), 'root-position shape should say root position');
}

// ── G7 (Dom7): V7 in C ────────────────────────────────────────────────────────
{
    const f = cs.Sevenths.options['Drop 2'].options['High String Set'].options['Dom7'].options['1st Inv.'];
    const c = explainChord({
        rootNote: 'G', qualityKey: 'Dom7', category: 'Sevenths', voicingType: 'Drop 2', position: '1st Inv.',
        shape: shape(f, 'G'), tuningMidi: MIDI, tuningNotes: NOTES,
    });
    show(c);
    const text = flat(c);
    const chord = section(c, 'The chord') as any;
    check(chord.items.map((i: any) => i.label).join(' ') === 'G B D F', `G7 notes: ${chord.items.map((i: any) => i.label)}`);
    check(/V7 in C/.test(text), 'G7 should be V7 in C');
    check(/first inversion/.test(text), 'a 1st Inv. shape should say first inversion');
}

// ── Bm7b5: viiø7 in C ─────────────────────────────────────────────────────────
{
    const f = cs.Sevenths.options['Drop 2'].options['High String Set'].options['Min7b5'].options['Root'];
    const c = explainChord({
        rootNote: 'B', qualityKey: 'Min7b5', category: 'Sevenths', voicingType: 'Drop 2', position: 'Root',
        shape: shape(f, 'B'), tuningMidi: MIDI, tuningNotes: NOTES,
    });
    show(c);
    const chord = section(c, 'The chord') as any;
    check(chord.items.map((i: any) => i.label).join(' ') === 'B D F A', `Bm7b5 notes: ${chord.items.map((i: any) => i.label)}`);
    check(/viiø7 in C/.test(flat(c)), 'Bm7b5 should be viiø7 in C');
}

// ── Triad and shell and CAGED ─────────────────────────────────────────────────
{
    const f = cs.Triads.options['2nd String Set'].options['Min'].options['Root'];
    const c = explainChord({ rootNote: 'A', qualityKey: 'Min', category: 'Triads', position: 'Root', shape: shape(f, 'A'), tuningMidi: MIDI, tuningNotes: NOTES });
    show(c);
    const chord = section(c, 'The chord') as any;
    check(chord.items.map((i: any) => i.label).join(' ') === 'A C E', `Am notes: ${chord.items.map((i: any) => i.label)}`);
    check(/vi in C/.test(flat(c)) && /ii in G/.test(flat(c)), 'Am should be vi in C and ii in G');
}
{
    const f = cs.Shells.options['2nd String Set'].options['Dom7'].options['Root'];
    const c = explainChord({ rootNote: 'D', qualityKey: 'Dom7', category: 'Shells', position: 'Root', shape: shape(f, 'D'), tuningMidi: MIDI, tuningNotes: NOTES });
    show(c);
    check(/not in this shape/.test(flat(c)), 'a shell should say the 5th is not in the shape');
}
{
    const f = cs.CAGED.options['E'];
    const c = explainChord({ rootNote: 'G', qualityKey: 'Min7', category: 'CAGED', position: 'E', shape: shape(f, 'G'), tuningMidi: MIDI, tuningNotes: NOTES });
    show(c);
    check(c.title === 'G Major', `CAGED title should be G Major, got ${c.title}`);
}
{
    // "All positions" view: no dots to describe
    const c = explainChord({ rootNote: 'C', qualityKey: 'Maj7', category: 'Sevenths', voicingType: 'Drop 2', position: 'All', shape: [], tuningMidi: MIDI, tuningNotes: NOTES });
    check(!c.sections.some(s => s.title.startsWith('In this shape')), 'no shape -> no "In this shape" section');
}

// ── Scales ────────────────────────────────────────────────────────────────────
{
    const major = SCALE_SHAPES['7-note']['Major'];
    const c = explainScale({ rootNote: 'C', scaleName: 'Major', intervals: major.intervals, degrees: major.degrees, pattern: '3nps', positionNumber: 1 });
    show(c);
    const scale = section(c, 'The scale') as any;
    check(scale.items.map((i: any) => i.label).join(' ') === 'C D E F G A B', `C major notes: ${scale.items.map((i: any) => i.label)}`);
    check(/W – W – H – W – W – W – H/.test(scale.intro), `C major steps: ${scale.intro}`);
    const minor = SCALE_SHAPES['7-note']['Harmonic Minor'];
    const h = explainScale({ rootNote: 'A', scaleName: 'Harmonic Minor', intervals: minor.intervals, degrees: minor.degrees });
    check((section(h, 'The scale') as any).items.map((i: any) => i.label).join(' ') === 'A B C D E F G#', 'A harmonic minor notes');
    check(/W – H – W – W – H – W\+H – H/.test((section(h, 'The scale') as any).intro), `A harmonic minor steps: ${(section(h, 'The scale') as any).intro}`);
}

if (failed) {
    console.error('\nvalidate-theory: FAILED');
    process.exit(1);
}
console.log('validate-theory: OK');
