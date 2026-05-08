"use client";

import * as React from "react";
import FretboardHorizontal from "@/components/FretboardHorizontal";
import FretboardVertical from "@/components/FretboardVertical";
import NotesIntervalsToggle from "@/components/NotesIntervalsToggle";
import { noteNameToSemitone } from "@/lib/MusicTheory";
import {
    useDrawModeIndex,
    keyFromSelection,
} from "@/lib/hooks/useDrawModeIndex";
import {
    allChordShapes,
    useCycleList,
    getFinalFormulasFromMatch,
} from "@/lib/API";
import { generateAllVoicingsForShape } from "@/lib/fretboardMap";
import type { NotePosition } from "@/lib/fretboardMap";

const STANDARD_TUNING = ["E", "B", "G", "D", "A", "E"];
const NUM_FRETS = 24;
const NOTES = [
    "C",
    "C#",
    "Db",
    "D",
    "D#",
    "Eb",
    "E",
    "F",
    "F#",
    "Gb",
    "G",
    "G#",
    "Ab",
    "A",
    "A#",
    "Bb",
    "B",
];

const DEGREE_INDEX_BY_SEMITONES: Record<number, number> = {
    0: 0,
    1: 1,
    2: 1,
    3: 2,
    4: 2,
    5: 3,
    6: 4,
    7: 4,
    8: 5,
    9: 5,
    10: 6,
    11: 6,
};

function semitonesToDegreeNumber(semi: number): number {
    const idx = DEGREE_INDEX_BY_SEMITONES[semi];
    return idx === 0 ? 1 : idx + 1;
}

const wrap12 = (n: number) => ((n % 12) + 12) % 12;

function intervalSemitones(rootName: string, targetName: string): number {
    return wrap12(
        noteNameToSemitone(targetName) - noteNameToSemitone(rootName),
    );
}

function firstEnharmonic(cell: string): string {
    return (cell || "").split("/")[0];
}

/* ── Reusable cycle button strip ── */
function CycleControl({
    label,
    display,
    onPrev,
    onNext,
    vertical = false,
}: {
    label: string;
    display: string;
    onPrev: () => void;
    onNext: () => void;
    vertical?: boolean;
}) {
    const btnClass =
        "w-9 h-9 flex items-center justify-center bg-sand-2 border border-ink rounded text-ink text-xl font-bold hover:bg-sand-3 transition-colors select-none";

    if (vertical) {
        return (
            <div className='flex flex-col items-center gap-0.5'>
                <p className='text-[10px] font-bold text-center leading-tight'>
                    {label}
                </p>
                <button
                    className={btnClass}
                    onClick={onPrev}>
                    −
                </button>
                <span className='text-[10px] font-bold text-center leading-tight min-w-[2.5rem] text-center'>
                    {display}
                </span>
                <button
                    className={btnClass}
                    onClick={onNext}>
                    +
                </button>
            </div>
        );
    }
    return (
        <div className='flex items-center gap-2'>
            <button
                className={btnClass}
                onClick={onPrev}>
                ‹
            </button>
            <span className='text-sm font-bold min-w-[5rem] text-center'>
                {display}
            </span>
            <button
                className={btnClass}
                onClick={onNext}>
                ›
            </button>
        </div>
    );
}

export default function DrawMode() {
    const [root, setRoot] = React.useState("C");
    const [showIntervals, setShowIntervals] = React.useState(true);
    const [rootMenuOpen, setRootMenuOpen] = React.useState(false);
    const [isRight, setIsRight] = React.useState(true);
    const [selected, setSelected] = React.useState(new Map<number, number>());
    const [matchInfo, setMatchInfo] = React.useState<any>(null);
    const [selectedPosition, setSelectedPosition] = React.useState("");
    const [selectedAltShape, setSelectedAltShape] = React.useState(0);
    const [browsedVoicing, setBrowsedVoicing] = React.useState<
        NotePosition[] | null
    >(null);

    const handedness = isRight ? "right" : "left";

    const { index, fretboardMap } = useDrawModeIndex({
        allChordShapes,
        tuning: STANDARD_TUNING,
        numFrets: NUM_FRETS,
        rootNote: root,
    });

    const { finalFormulas, posKey, altIdx } = React.useMemo(
        () => getFinalFormulasFromMatch(allChordShapes, matchInfo),
        [matchInfo],
    );

    const toggle = React.useCallback((string: number, fret: number) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(string) && next.get(string) === fret)
                next.delete(string);
            else next.set(string, fret);
            return next;
        });
    }, []);

    const clearAll = () => {
        setSelected(new Map());
    };

    const pickVoicingFor = React.useCallback(
        (posKeyToUse: string, altIdxToUse: number): NotePosition[] | null => {
            if (!finalFormulas || !finalFormulas[posKeyToUse]) return null;
            const posData = finalFormulas[posKeyToUse] as any;
            const formula =
                (Number.isInteger(altIdxToUse) &&
                    posData.altShapes?.[altIdxToUse]) ||
                posData;
            if (!formula) return null;
            const raw =
                generateAllVoicingsForShape(root, formula, fretboardMap) || [];
            const voicings = Array.isArray(raw[0]) ? raw : [raw];
            const targetSize = selected.size;
            const drawStrings = new Set(Array.from(selected.keys()));
            const best =
                voicings.find(
                    v =>
                        Array.isArray(v) &&
                        v.length === targetSize &&
                        v.every((n: any) => drawStrings.has(n.string)),
                ) || voicings[0];
            if (!best) return null;
            return (best as NotePosition[])
                .slice()
                .sort(
                    (a, b) =>
                        a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0),
                );
        },
        [finalFormulas, root, fretboardMap, selected],
    );

    const chordShape: NotePosition[] = React.useMemo(() => {
        if (browsedVoicing?.length) return browsedVoicing;
        const shape: NotePosition[] = [];
        for (const [string, fret] of selected.entries()) {
            const cell = fretboardMap[string]?.[fret];
            if (!cell) continue;
            const name = firstEnharmonic(cell);
            const semis = intervalSemitones(root, name);
            shape.push({
                string,
                fret,
                semitones: semis,
                degree: semitonesToDegreeNumber(semis),
            });
        }
        return shape.sort(
            (a, b) => a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0),
        );
    }, [selected, fretboardMap, root, browsedVoicing]);

    // Match drawn shape against library
    React.useEffect(() => {
        if (!selected?.size) {
            setMatchInfo(null);
            return;
        }
        const hit = index.get(`${root}::${keyFromSelection(selected)}`) || null;
        setMatchInfo(hit);
    }, [selected, index, root]);

    const positions = React.useMemo(
        () => (finalFormulas ? Object.keys(finalFormulas) : []),
        [finalFormulas],
    );

    React.useEffect(() => {
        if (!matchInfo || !finalFormulas) {
            setSelectedPosition("");
            setSelectedAltShape(0);
            return;
        }
        const keys = Object.keys(finalFormulas);
        if (!selectedPosition || !finalFormulas[selectedPosition]) {
            setSelectedPosition(
                posKey && finalFormulas[posKey] ? posKey : keys[0] || "",
            );
        }
        const posData = finalFormulas[
            selectedPosition || posKey || keys[0]
        ] as any;
        const altCount = 1 + (posData?.altShapes?.length || 0);
        if (selectedAltShape >= altCount) setSelectedAltShape(0);
    }, [matchInfo, finalFormulas, posKey, selectedPosition, selectedAltShape]);

    const lastFamilyRef = React.useRef("");
    const familyKey = matchInfo
        ? `${matchInfo.difficulty}|${matchInfo.category}|${(matchInfo.trail || []).join(">")}`
        : "";

    React.useEffect(() => {
        if (!matchInfo || !finalFormulas) {
            setSelectedPosition("");
            setSelectedAltShape(0);
            lastFamilyRef.current = "";
            return;
        }
        if (familyKey !== lastFamilyRef.current) {
            lastFamilyRef.current = familyKey;
            const keys = Object.keys(finalFormulas);
            const nextPos =
                matchInfo.posKey && finalFormulas[matchInfo.posKey]
                    ? matchInfo.posKey
                    : keys[0] || "";
            setSelectedPosition(nextPos);
            const altCount =
                1 + ((finalFormulas[nextPos] as any)?.altShapes?.length || 0);
            setSelectedAltShape(Math.min(matchInfo.altIdx ?? 0, altCount - 1));
        }
    }, [familyKey, matchInfo, finalFormulas, root]);

    React.useEffect(() => {
        setBrowsedVoicing(null);
    }, [selected]);
    React.useEffect(() => {
        setBrowsedVoicing(null);
    }, [familyKey]);

    const availableAltsForUI = React.useMemo(() => {
        if (
            !finalFormulas ||
            !selectedPosition ||
            !finalFormulas[selectedPosition]
        )
            return [];
        const base = finalFormulas[selectedPosition] as any;
        return [base, ...(Array.isArray(base.altShapes) ? base.altShapes : [])];
    }, [finalFormulas, selectedPosition]);

    const safeCurrent = positions.includes(selectedPosition)
        ? selectedPosition
        : positions[0] || "";
    const { prev: goPrevPos, next: goNextPos } = useCycleList(
        positions,
        safeCurrent,
        p => {
            setSelectedPosition(p);
            setBrowsedVoicing(pickVoicingFor(p, selectedAltShape));
        },
    );
    const { prev: goPrevAlt, next: goNextAlt } = useCycleList(
        availableAltsForUI,
        selectedAltShape,
        idx => {
            setSelectedAltShape(idx as unknown as number);
            setBrowsedVoicing(
                pickVoicingFor(selectedPosition, idx as unknown as number),
            );
        },
    );

    const getQuality = (info: any) =>
        Array.isArray(info?.trail) && info.trail.length
            ? info.trail[info.trail.length - 1]
            : "";

    const chordLabel = matchInfo ? `${root} ${getQuality(matchInfo)}` : "";

    return (
        <div className='flex flex-col items-center w-full text-ink'>
            {/* ── Mobile layout ── */}
            <div className='sm:hidden w-full flex gap-1 mt-2 px-1'>
                {/* Left column */}
                <div className='flex flex-col items-center gap-3 pt-14 w-14 shrink-0'>
                    {/* Root selector */}
                    <div className='flex flex-col items-center gap-1'>
                        <span className='text-[10px] font-bold'>Root</span>
                        <button
                            onClick={() => setRootMenuOpen(true)}
                            className='w-10 h-10 bg-sand-4 border border-ink rounded text-sand-1 text-sm font-bold'>
                            {root}
                        </button>
                        {rootMenuOpen && (
                            <div
                                className='fixed inset-0 z-50 flex items-start justify-start bg-black/30 pt-24 pl-3'
                                onClick={() => setRootMenuOpen(false)}>
                                <div
                                    className='bg-sand-2 rounded-xl shadow-xl p-2 max-h-56 overflow-y-auto grid grid-cols-3 gap-1'
                                    onClick={e => e.stopPropagation()}>
                                    {NOTES.map(n => (
                                        <button
                                            key={n}
                                            onClick={() => {
                                                setRoot(n);
                                                setRootMenuOpen(false);
                                            }}
                                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${n === root ? "bg-sand-4 text-sand-1" : "bg-sand-1 text-ink hover:bg-sand-3"}`}>
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Clear */}
                    <button
                        onClick={clearAll}
                        className='w-10 text-[10px] font-bold text-red-600 border border-red-600 rounded px-1 py-1 hover:bg-red-50 transition-colors'>
                        Clear
                    </button>

                    {/* Position cycle */}
                    {positions.length > 0 && (
                        <CycleControl
                            label='Pos.'
                            display={
                                (finalFormulas as any)?.[selectedPosition]
                                    ?.name ||
                                selectedPosition ||
                                "–"
                            }
                            onPrev={goPrevPos}
                            onNext={goNextPos}
                            vertical
                        />
                    )}

                    {/* Alt shape cycle */}
                    {availableAltsForUI.length > 1 && (
                        <CycleControl
                            label='Alt.'
                            display={`${selectedAltShape + 1}/${availableAltsForUI.length}`}
                            onPrev={goPrevAlt}
                            onNext={goNextAlt}
                            vertical
                        />
                    )}
                </div>

                {/* Center */}
                <div className='flex flex-col items-center flex-1 min-w-0'>
                    {/* Chord label */}
                    <div className='bg-sand-4 border border-ink rounded-xl w-3/4 text-center py-2 my-3'>
                        <span className='text-lg font-semibold'>
                            {chordLabel}
                        </span>
                    </div>
                    <FretboardVertical
                        chordShape={chordShape}
                        handedness={handedness}
                        interactive
                        onTogglePosition={({ string, fret }) =>
                            toggle(string, fret)
                        }
                        rootNote={root}
                        showIntervals={showIntervals}
                    />
                </div>

                {/* Right column */}
                <div className='flex flex-col items-center gap-3 pt-14 w-14 shrink-0'>
                    <div className='flex flex-col items-center gap-1'>
                        <span className='text-[10px] font-bold'>Hand</span>
                        <button
                            onClick={() => setIsRight(h => !h)}
                            className='w-10 h-10 bg-sand-4 border border-ink rounded text-sand-1 text-[10px] font-bold'>
                            {isRight ? "R" : "L"}
                        </button>
                    </div>
                    <NotesIntervalsToggle
                        showIntervals={showIntervals}
                        onToggle={setShowIntervals}
                    />
                </div>
            </div>

            {/* ── Desktop layout ── */}
            <div className='hidden sm:flex flex-col items-center w-full gap-4 py-4'>
                {/* Fretboard */}
                <div className='w-full px-4'>
                    <FretboardHorizontal
                        chordShape={chordShape}
                        handedness={handedness}
                        interactive
                        onTogglePosition={({ string, fret }) =>
                            toggle(string, fret)
                        }
                        rootNote={root}
                        showIntervals={showIntervals}
                    />
                </div>

                {/* Root note grid */}
                <div className='flex flex-col items-center gap-2'>
                    <span className='text-sm font-semibold'>Root:</span>
                    <div className='grid grid-cols-9 gap-1 max-w-2xl'>
                        {NOTES.map(n => (
                            <button
                                key={n}
                                onClick={() => setRoot(n)}
                                className={`px-3 py-1.5 text-sm font-semibold rounded border transition-colors ${
                                    n === root
                                        ? "bg-sand-4 text-sand-1 border-ink"
                                        : "bg-sand-1 text-ink border-ink/40 hover:border-ink"
                                }`}>
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={clearAll}
                    className='px-4 py-1.5 text-sm font-semibold text-red-600 border border-red-600 rounded-full hover:bg-red-50 transition-colors'>
                    Clear
                </button>

                {/* Position buttons */}
                {positions.length > 0 && (
                    <div className='flex flex-wrap gap-2 justify-center'>
                        {positions.map(pos => (
                            <button
                                key={pos}
                                onClick={() => {
                                    setSelectedPosition(pos);
                                    setBrowsedVoicing(
                                        pickVoicingFor(pos, selectedAltShape),
                                    );
                                }}
                                className={`px-4 py-1.5 text-sm rounded border transition-colors ${
                                    selectedPosition === pos
                                        ? "bg-sand-4 text-sand-1 border-ink font-semibold"
                                        : "bg-sand-1 text-ink border-ink/40 hover:border-ink"
                                }`}>
                                {(finalFormulas as any)?.[pos]?.name || pos}
                            </button>
                        ))}
                    </div>
                )}

                {/* Alt shape buttons */}
                {availableAltsForUI.length > 1 && (
                    <div className='flex flex-col items-center gap-1'>
                        <span className='text-xs font-semibold text-ink/60'>
                            Alternate Positions
                        </span>
                        <div className='flex gap-2'>
                            {availableAltsForUI.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setSelectedAltShape(idx);
                                        setBrowsedVoicing(
                                            pickVoicingFor(
                                                selectedPosition,
                                                idx,
                                            ),
                                        );
                                    }}
                                    className={`w-9 h-9 text-sm rounded border transition-colors ${
                                        selectedAltShape === idx
                                            ? "bg-sand-4 text-sand-1 border-ink font-semibold"
                                            : "bg-sand-1 text-ink border-ink/40 hover:border-ink"
                                    }`}>
                                    {idx + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Chord info card */}
                <div className='bg-sand-4 rounded-xl px-12 py-4 text-center'>
                    <span className='text-3xl font-semibold'>
                        {chordLabel || root}
                    </span>
                </div>

                {/* Controls row */}
                <div className='flex items-center gap-6 flex-wrap justify-center'>
                    <div className='flex items-center gap-2'>
                        <span className='text-sm font-semibold'>Hand:</span>
                        <button
                            onClick={() => setIsRight(h => !h)}
                            className={`px-3 py-1 text-sm font-semibold rounded border border-ink transition-colors ${isRight ? "bg-ink text-sand-1" : "bg-sand-1 text-ink"}`}>
                            {isRight ? "Right" : "Left"}
                        </button>
                    </div>
                    <NotesIntervalsToggle
                        showIntervals={showIntervals}
                        onToggle={setShowIntervals}
                    />
                </div>
            </div>
        </div>
    );
}
