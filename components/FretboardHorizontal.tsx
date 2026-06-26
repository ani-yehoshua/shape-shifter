import { spellInterval, spellNote } from "@/lib/MusicTheory";
import * as React from "react";
import type { NotePosition } from "@/lib/fretboardMap";
import { playNote } from "@/lib/guitarAudio";

type Props = {
    chordShape: NotePosition[];
    rootNote: string;
    showIntervals?: boolean;
    numFrets?: number;
    numStrings?: number;
    interactive?: boolean;
    onTogglePosition?: (pos: { string: number; fret: number }) => void;
    handedness?: "left" | "right";
    showConnector?: boolean;
    chordGroups?: NotePosition[][];
    interactivePositions?: Set<string>;
    playOnClick?: boolean;
    capo?: number;
    tuningFreqs?: number[];
};

const FretboardHorizontal = ({
    chordShape,
    rootNote,
    showIntervals = false,
    numFrets = 24,
    numStrings = 6,
    interactive = false,
    onTogglePosition,
    handedness = "right",
    showConnector = false,
    chordGroups,
    interactivePositions,
    playOnClick = false,
    capo = 0,
    tuningFreqs,
}: Props) => {
    const padX = 25;
    const padY = 25;
    const fretWidth = 50;
    const stringSpacing = 30;
    const diagramWidth = fretWidth * numFrets + padX * 2;
    const diagramHeight = stringSpacing * (numStrings - 1) + padY * 2;

    const singleDotFrets = [3, 5, 7, 9, 15, 17, 19, 21];
    const doubleDotFrets = [12, 24];
    const labelFrets = [1, 3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const frets = chordShape
            .map(p => p.fret)
            .filter((f): f is number => typeof f === "number" && f >= 0);
        const container = containerRef.current;
        if (!container) return;
        if (frets.length === 0) {
            container.scrollTo({ left: 0, behavior: "smooth" });
            return;
        }

        const minFret = Math.min(...frets);
        const maxFret = Math.max(...frets);

        const centerXRight =
            ((minFret + maxFret) / 2 - 1) * fretWidth + padX + fretWidth / 2;
        const centerX =
            handedness === "right" ? centerXRight : diagramWidth - centerXRight;
        container.scrollTo({
            left: Math.max(0, centerX - container.clientWidth / 2),
            behavior: "smooth",
        });
    }, [chordShape, fretWidth, padX, handedness, diagramWidth]);

    const yForString = React.useCallback(
        (s: number) => s * stringSpacing + padY,
        [],
    );
    const xForFretLine = React.useCallback(
        (i: number) =>
            handedness === "right"
                ? i * fretWidth + padX
                : diagramWidth - i * fretWidth - padX,
        [handedness, diagramWidth, fretWidth, padX],
    );
    const xForFretMark = React.useCallback(
        (f: number) =>
            handedness === "right"
                ? (f - 1) * fretWidth + padX + fretWidth / 2
                : diagramWidth - (f - 1) * fretWidth - padX - fretWidth / 2,
        [handedness, diagramWidth, fretWidth, padX],
    );
    const openX = handedness === "right" ? padX - 13 : diagramWidth - padX + 13;

    return (
        <div
            ref={containerRef}
            className='w-full overflow-x-auto no-scrollbar'>
            <div style={{ width: "fit-content", margin: "0 auto" }}>
                <svg
                    style={{
                        display: "block",
                        height: diagramHeight,
                        WebkitTapHighlightColor: "transparent",
                        width: diagramWidth,
                    }}
                    viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}>
                    {/* Frets */}
                    {[...Array(numFrets + 1)].map((_, i) => (
                        <line
                            key={`fret-${i}`}
                            x1={xForFretLine(i)}
                            y1={padY}
                            x2={xForFretLine(i)}
                            y2={diagramHeight - padY}
                            stroke='#1f2d3d'
                            strokeWidth={i === 0 ? 5 : 1.5}
                        />
                    ))}

                    {/* Strings */}
                    {[...Array(numStrings)].map((_, i) => (
                        <line
                            key={`string-${i}`}
                            x1={padX}
                            y1={yForString(i)}
                            x2={diagramWidth - padX}
                            y2={yForString(i)}
                            stroke='#1f2d3d'
                            strokeWidth={1.5}
                        />
                    ))}

                    {/* Capo shading and bar */}
                    {capo > 0 && (
                        <>
                            <rect
                                x={xForFretLine(0)}
                                y={padY}
                                width={
                                    xForFretMark(capo) -
                                    xForFretLine(0) +
                                    xForFretLine(1) -
                                    xForFretLine(0)
                                }
                                height={diagramHeight - padY * 2}
                                fill='#1f2d3d'
                                opacity={0.06}
                            />
                            <rect
                                x={xForFretLine(capo) - 5}
                                y={padY - 4}
                                width={10}
                                height={diagramHeight - padY * 2 + 8}
                                rx={5}
                                fill='#1f2d3d'
                                opacity={0.5}
                            />
                        </>
                    )}

                    {/* Single fret markers */}
                    {singleDotFrets.map(
                        fret =>
                            fret <= numFrets && (
                                <circle
                                    key={`marker-${fret}`}
                                    cx={xForFretMark(fret)}
                                    cy={diagramHeight / 1.99}
                                    r={6}
                                    fill='#d1d1cc'
                                />
                            ),
                    )}

                    {/* Double fret markers */}
                    {doubleDotFrets.map(
                        fret =>
                            fret <= numFrets && (
                                <g key={`marker-double-${fret}`}>
                                    <circle
                                        cx={xForFretMark(fret)}
                                        cy={diagramHeight / 3 + 4}
                                        r={6}
                                        fill='#d1d1cc'
                                    />
                                    <circle
                                        cx={xForFretMark(fret)}
                                        cy={(diagramHeight * 1.96) / 3}
                                        r={6}
                                        fill='#d1d1cc'
                                    />
                                </g>
                            ),
                    )}

                    {/* Fret number labels */}
                    {labelFrets.map(
                        fret =>
                            fret <= numFrets && (
                                <text
                                    key={`label-${fret}`}
                                    x={xForFretMark(fret)}
                                    y={diagramHeight - 6}
                                    textAnchor='middle'
                                    dominantBaseline='auto'
                                    fontSize={11}
                                    fontWeight='bold'
                                    fill='#1f2d3d'>
                                    {fret}
                                </text>
                            ),
                    )}

                    {/* Connector line(s) */}
                    {showConnector &&
                        (chordGroups && chordGroups.length > 0
                            ? chordGroups
                            : [chordShape]
                        ).map((group, gi) => {
                            const sorted = group
                                .filter(
                                    p =>
                                        p.fret != null &&
                                        p.fret >= 0 &&
                                        p.fret <= numFrets,
                                )
                                .sort((a, b) => a.string - b.string);
                            if (sorted.length < 2) return null;
                            const center = (p: NotePosition) => ({
                                x: p.fret === 0 ? openX : xForFretMark(p.fret!),
                                y: yForString(p.string),
                                r: p.fret === 0 ? 10 : 12,
                            });
                            return sorted.slice(0, -1).map((p, i) => {
                                const a = center(p);
                                const b = center(sorted[i + 1]);
                                const dx = b.x - a.x;
                                const dy = b.y - a.y;
                                const len = Math.sqrt(dx * dx + dy * dy);
                                if (len === 0) return null;
                                const ux = dx / len;
                                const uy = dy / len;
                                return (
                                    <line
                                        key={`connector-${gi}-${i}`}
                                        x1={a.x + ux * a.r}
                                        y1={a.y + uy * a.r}
                                        x2={b.x - ux * b.r}
                                        y2={b.y - uy * b.r}
                                        stroke='#1f2d3d'
                                        strokeWidth={2.5}
                                        strokeLinecap='round'
                                    />
                                );
                            });
                        })}

                    {/* Notes */}
                    {chordShape.map((pos, index) => {
                        const { string, fret, semitones, degree } = pos;
                        if (
                            fret === null ||
                            fret === undefined ||
                            fret < 0 ||
                            fret > numFrets
                        )
                            return null;
                        const isRoot = semitones === 0;
                        const isHollowTonic = pos.isTonic && !isRoot;
                        const label = showIntervals
                            ? spellInterval(rootNote, semitones!, degree!)
                            : spellNote(rootNote, semitones!, degree!);
                        const x = xForFretMark(fret);
                        const y = yForString(string);
                        const fontSize =
                            label.includes("bb") || label.includes("##")
                                ? 10
                                : 12;

                        const handleNoteClick = playOnClick
                            ? () => playNote(string, fret, tuningFreqs)
                            : undefined;

                        if (fret === 0) {
                            return (
                                <g
                                    key={`note-${index}`}
                                    onClick={handleNoteClick}
                                    style={
                                        playOnClick
                                            ? { cursor: "pointer" }
                                            : undefined
                                    }>
                                    <circle
                                        cx={openX}
                                        cy={y}
                                        r={10}
                                        fill='transparent'
                                        stroke={isRoot ? "#dc2626" : "#1f2d3d"}
                                        strokeWidth='2'
                                    />
                                    <text
                                        x={openX}
                                        y={y}
                                        textAnchor='middle'
                                        dominantBaseline='central'
                                        fontSize={fontSize}
                                        fontWeight={600}
                                        fill={isRoot ? "#dc2626" : "#1f2d3d"}>
                                        {label}
                                    </text>
                                </g>
                            );
                        }
                        return (
                            <g
                                key={`note-${index}`}
                                onClick={handleNoteClick}
                                style={
                                    playOnClick
                                        ? { cursor: "pointer" }
                                        : undefined
                                }>
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={12}
                                    fill={
                                        isRoot
                                            ? "#dc2626"
                                            : isHollowTonic
                                              ? "transparent"
                                              : "#1f2d3d"
                                    }
                                    stroke={isHollowTonic ? "#1f2d3d" : "none"}
                                    strokeWidth={isHollowTonic ? 2 : 0}
                                />
                                <text
                                    x={x}
                                    y={y}
                                    textAnchor='middle'
                                    dominantBaseline='central'
                                    fontSize={fontSize}
                                    fontWeight={600}
                                    fill={
                                        isHollowTonic ? "#1f2d3d" : "#f7f7f5"
                                    }>
                                    {label}
                                </text>
                            </g>
                        );
                    })}

                    {/* Interactive hit layer */}
                    {interactive && (
                        <g aria-label='note-hit-layer'>
                            {[...Array(numStrings)].map((_, s) =>
                                [...Array(numFrets + 1)].map((_, f) => {
                                    if (
                                        interactivePositions &&
                                        !interactivePositions.has(`${s}:${f}`)
                                    )
                                        return null;
                                    const x = f === 0 ? openX : xForFretMark(f);
                                    const y = yForString(s);
                                    return (
                                        <circle
                                            key={`hit-${s}-${f}`}
                                            cx={x}
                                            cy={y}
                                            fill='transparent'
                                            onClick={() =>
                                                onTogglePosition?.({
                                                    string: s,
                                                    fret: f,
                                                })
                                            }
                                            r={14}
                                            role='button'
                                            style={{ cursor: "pointer" }}
                                        />
                                    );
                                }),
                            )}
                        </g>
                    )}
                </svg>
            </div>
        </div>
    );
};

export default FretboardHorizontal;
