import { spellInterval, spellNote } from "@/lib/MusicTheory";
import * as React from "react";
import type { NotePosition } from "@/lib/fretboardMap";

type Props = {
    chordShape: NotePosition[];
    rootNote: string;
    showIntervals?: boolean;
    numFrets?: number;
    numStrings?: number;
    interactive?: boolean;
    onTogglePosition?: (pos: { string: number; fret: number }) => void;
    handedness?: "left" | "right";
};

const FretboardVertical = ({
    chordShape,
    rootNote,
    showIntervals = false,
    numFrets = 24,
    numStrings = 6,
    interactive = false,
    onTogglePosition,
    handedness = "right",
}: Props) => {
    const padX = 30;
    const padY = 40;
    const fretHeight = 70;
    const stringSpacing = 45;
    const diagramWidth = stringSpacing * (numStrings - 1) + padX * 2;
    const diagramHeight = fretHeight * numFrets + padY + 15;

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
            container.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        const minFret = Math.min(...frets);
        const maxFret = Math.max(...frets);

        const centerY =
            ((minFret + maxFret) / 2 - 1) * fretHeight + padY + fretHeight / 2;
        container.scrollTo({
            top: Math.max(0, centerY - container.clientHeight / 2),
            behavior: "smooth",
        });
    }, [chordShape, fretHeight, padY]);

    const xForString = React.useCallback(
        (s: number) =>
            (handedness === "right" ? numStrings - 1 - s : s) * stringSpacing +
            padX,
        [handedness, numStrings],
    );
    const yForFretLine = (i: number) => i * fretHeight + padY;
    const yForFretMark = (f: number) =>
        (f - 1) * fretHeight + padY + fretHeight / 2;
    const openY = padY - 18;

    return (
        <div
            ref={containerRef}
            className='h-[calc(100%-1rem)] w-full my-2 overflow-y-auto no-scrollbar'>
            <svg
                style={{
                    display: "block",
                    height: diagramHeight,
                    shapeRendering: "crispEdges",
                    WebkitTapHighlightColor: "transparent",
                    width: "100%",
                }}
                viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}>
                {/* Frets */}
                {[...Array(numFrets + 1)].map((_, i) => (
                    <line
                        key={`fret-${i}`}
                        x1={padX}
                        y1={yForFretLine(i)}
                        x2={diagramWidth - padX}
                        y2={yForFretLine(i)}
                        stroke='#1f2d3d'
                        strokeWidth={i === 0 ? 5 : 1.5}
                    />
                ))}

                {/* Strings */}
                {[...Array(numStrings)].map((_, i) => (
                    <line
                        key={`string-${i}`}
                        x1={xForString(i)}
                        y1={padY}
                        x2={xForString(i)}
                        y2={diagramHeight - 15}
                        stroke='#1f2d3d'
                        strokeWidth={1.5}
                    />
                ))}

                {/* Single fret markers */}
                {singleDotFrets.map(
                    fret =>
                        fret <= numFrets && (
                            <circle
                                key={`marker-${fret}`}
                                cx={diagramWidth / 2}
                                cy={yForFretMark(fret)}
                                r={8}
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
                                    cx={diagramWidth / 3.03 + 4}
                                    cy={yForFretMark(fret)}
                                    r={8}
                                    fill='#d1d1cc'
                                />
                                <circle
                                    cx={(diagramWidth * 1.97) / 3}
                                    cy={yForFretMark(fret)}
                                    r={8}
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
                                x={
                                    handedness === "right"
                                        ? 12
                                        : diagramWidth - 12
                                }
                                y={yForFretMark(fret)}
                                textAnchor='middle'
                                dominantBaseline='central'
                                fontSize={12}
                                fontWeight='bold'
                                fill='#1f2d3d'>
                                {fret}
                            </text>
                        ),
                )}

                {/* Notes */}
                {chordShape.map((pos, index) => {
                    const { string, fret, semitones, degree, isTonic } = pos;
                    if (
                        fret === null ||
                        fret === undefined ||
                        fret < 0 ||
                        fret > numFrets
                    )
                        return null;
                    const isRoot = semitones === 0;
                    const isHollowTonic = isTonic && !isRoot;
                    const label = showIntervals
                        ? spellInterval(rootNote, semitones!, degree!)
                        : spellNote(rootNote, semitones!, degree!);
                    const x = xForString(string);
                    const y = yForFretMark(fret);
                    const fontSize =
                        label.includes("bb") || label.includes("##") ? 13 : 16;

                    if (fret === 0) {
                        return (
                            <g key={`note-${index}`}>
                                <circle
                                    cx={x}
                                    cy={openY}
                                    r={14}
                                    fill='transparent'
                                    stroke={isRoot ? "#dc2626" : "#1f2d3d"}
                                    strokeWidth='2'
                                />
                                <text
                                    x={x}
                                    y={openY}
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
                        <g key={`note-${index}`}>
                            <circle
                                cx={x}
                                cy={y}
                                r={16}
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
                                    isRoot || isHollowTonic
                                        ? isRoot
                                            ? "#f7f7f5"
                                            : "#1f2d3d"
                                        : "#f7f7f5"
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
                                const x = xForString(s);
                                const y = f === 0 ? openY : yForFretMark(f);
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
                                        r={18}
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
    );
};

export default FretboardVertical;
