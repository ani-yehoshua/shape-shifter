// Port of ../../components/FretboardVertical.tsx on the website. Same
// layout math and note/label logic; the web version draws to a DOM <svg>
// scaled by CSS, this one draws to a fixed-size react-native-svg canvas
// (viewBox and pixel size are identical, so there's no separate scaling
// step to reason about) inside a ScrollView instead of a scrolling <div>.
// CSS custom properties (var(--color-ink) etc.) become plain color values
// from ../lib/theme, and onClick+cursor:pointer become onPress.
import { useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { spellInterval, spellNote } from '../lib/MusicTheory';
import type { NotePosition } from '../lib/fretboardMap';
import { playNote } from '../lib/guitarAudio';
import { colors, fonts } from '../lib/theme';

type Props = {
    chordShape: NotePosition[];
    rootNote: string;
    showIntervals?: boolean;
    numFrets?: number;
    numStrings?: number;
    interactive?: boolean;
    onTogglePosition?: (pos: { string: number; fret: number }) => void;
    handedness?: 'left' | 'right';
    showConnector?: boolean;
    chordGroups?: NotePosition[][];
    interactivePositions?: Set<string>;
    playOnClick?: boolean;
    capo?: number;
    tuningFreqs?: number[];
};

const FretboardVertical = ({
    chordShape,
    rootNote,
    showIntervals = false,
    numFrets = 24,
    numStrings = 6,
    interactive = false,
    onTogglePosition,
    handedness = 'right',
    showConnector = false,
    chordGroups,
    interactivePositions,
    playOnClick = false,
    capo = 0,
    tuningFreqs,
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

    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        // When multiple positions are overlaid ("All" is on), just show the
        // top of the neck rather than centering on any one position.
        if (chordGroups && chordGroups.length > 0) {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            return;
        }

        const frets = chordShape
            .map((p) => p.fret)
            .filter((f): f is number => typeof f === 'number' && f >= 0);

        if (frets.length === 0) {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            return;
        }

        const minFret = Math.min(...frets);
        const maxFret = Math.max(...frets);

        const centerY =
            ((minFret + maxFret) / 2 - 1) * fretHeight + padY + fretHeight / 2;
        // No container.clientHeight equivalent to hand -- ScrollView centers
        // via contentOffset relative to its own viewport, which onLayout
        // could capture, but scrollTo needs a target we can compute without
        // it: aim the target position at a fixed distance from the top of
        // the visible viewport instead of true centering. 220 approximates
        // half of a typical phone's fretboard viewport height.
        scrollRef.current?.scrollTo({
            y: Math.max(0, centerY - 220),
            animated: true,
        });
    }, [chordShape, chordGroups, fretHeight, padY]);

    const xForString = (s: number) =>
        (handedness === 'right' ? numStrings - 1 - s : s) * stringSpacing + padX;
    const yForFretLine = (i: number) => i * fretHeight + padY;
    const yForFretMark = (f: number) => (f - 1) * fretHeight + padY + fretHeight / 2;
    const openY = padY - 18;

    const connectorGroups =
        showConnector && chordGroups && chordGroups.length > 0 ? chordGroups : [chordShape];

    return (
        <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ alignItems: 'center', paddingVertical: 8 }}
        >
            <Svg width={diagramWidth} height={diagramHeight} viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}>
                {/* Frets */}
                {[...Array(numFrets + 1)].map((_, i) => (
                    <Line
                        key={`fret-${i}`}
                        x1={padX}
                        y1={yForFretLine(i)}
                        x2={diagramWidth - padX}
                        y2={yForFretLine(i)}
                        stroke={colors.ink}
                        strokeWidth={i === 0 ? 5 : 1.5}
                    />
                ))}

                {/* Capo shading and bar */}
                {capo > 0 && (
                    <>
                        <Rect
                            x={padX}
                            y={yForFretLine(0)}
                            width={diagramWidth - padX * 2}
                            height={yForFretLine(capo) - yForFretLine(0)}
                            fill={colors.ink}
                            opacity={0.06}
                        />
                        <Rect
                            x={padX - 4}
                            y={yForFretLine(capo) - 5}
                            width={diagramWidth - padX * 2 + 8}
                            height={10}
                            rx={5}
                            fill={colors.ink}
                            opacity={0.5}
                        />
                    </>
                )}

                {/* Strings */}
                {[...Array(numStrings)].map((_, i) => (
                    <Line
                        key={`string-${i}`}
                        x1={xForString(i)}
                        y1={padY}
                        x2={xForString(i)}
                        y2={diagramHeight - 15}
                        stroke={colors.ink}
                        strokeWidth={1.5}
                    />
                ))}

                {/* Single fret markers */}
                {singleDotFrets.map(
                    (fret) =>
                        fret <= numFrets && (
                            <Circle
                                key={`marker-${fret}`}
                                cx={diagramWidth / 2}
                                cy={yForFretMark(fret)}
                                r={8}
                                fill={colors.sand3}
                            />
                        ),
                )}

                {/* Double fret markers */}
                {doubleDotFrets.map(
                    (fret) =>
                        fret <= numFrets && (
                            <G key={`marker-double-${fret}`}>
                                <Circle
                                    cx={diagramWidth / 3.03 + 4}
                                    cy={yForFretMark(fret)}
                                    r={8}
                                    fill={colors.sand3}
                                />
                                <Circle
                                    cx={(diagramWidth * 1.97) / 3}
                                    cy={yForFretMark(fret)}
                                    r={8}
                                    fill={colors.sand3}
                                />
                            </G>
                        ),
                )}

                {/* Fret number labels */}
                {labelFrets.map(
                    (fret) =>
                        fret <= numFrets && (
                            <SvgText
                                key={`label-${fret}`}
                                x={handedness === 'right' ? 12 : diagramWidth - 12}
                                y={yForFretMark(fret)}
                                textAnchor="middle"
                                alignmentBaseline="central"
                                fontSize={12}
                                fontFamily={fonts.sans.bold}
                                fill={colors.ink}
                            >
                                {fret}
                            </SvgText>
                        ),
                )}

                {/* Connector line(s) */}
                {showConnector &&
                    connectorGroups.map((group, gi) => {
                        const sorted = group
                            .filter((p) => p.fret != null && p.fret >= 0 && p.fret <= numFrets)
                            .sort((a, b) => b.string - a.string);
                        if (sorted.length < 2) return null;
                        const center = (p: NotePosition) => ({
                            x: xForString(p.string),
                            y: p.fret === 0 ? openY : yForFretMark(p.fret!),
                            r: p.fret === 0 ? 14 : 16,
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
                                <Line
                                    key={`connector-${gi}-${i}`}
                                    x1={a.x + ux * a.r}
                                    y1={a.y + uy * a.r}
                                    x2={b.x - ux * b.r}
                                    y2={b.y - uy * b.r}
                                    stroke={colors.ink}
                                    strokeWidth={2.5}
                                    strokeLinecap="round"
                                />
                            );
                        });
                    })}

                {/* Notes */}
                {chordShape.map((pos, index) => {
                    const { string, fret, semitones, degree, isTonic } = pos;
                    if (fret === null || fret === undefined || fret < 0 || fret > numFrets) {
                        return null;
                    }
                    const isRoot = semitones === 0;
                    const isHollowTonic = isTonic && !isRoot;
                    const label = showIntervals
                        ? spellInterval(rootNote, semitones!, degree!)
                        : spellNote(rootNote, semitones!, degree!);
                    const x = xForString(string);
                    const y = fret === 0 ? openY : yForFretMark(fret);
                    const fontSize = label.includes('bb') || label.includes('##') ? 13 : 16;
                    const onPress = playOnClick ? () => playNote(string, fret, tuningFreqs) : undefined;

                    if (fret === 0) {
                        return (
                            <G key={`note-${index}`} onPress={onPress}>
                                <Circle
                                    cx={x}
                                    cy={openY}
                                    r={14}
                                    fill="transparent"
                                    stroke={isRoot ? colors.rootRed : colors.ink}
                                    strokeWidth={2}
                                />
                                <SvgText
                                    x={x}
                                    y={openY}
                                    textAnchor="middle"
                                    alignmentBaseline="central"
                                    fontSize={fontSize}
                                    fontFamily={fonts.sans.semiBold}
                                    fill={isRoot ? colors.rootRed : colors.ink}
                                >
                                    {label}
                                </SvgText>
                            </G>
                        );
                    }
                    return (
                        <G key={`note-${index}`} onPress={onPress}>
                            <Circle
                                cx={x}
                                cy={y}
                                r={16}
                                fill={isRoot ? colors.rootRed : isHollowTonic ? 'transparent' : colors.ink}
                                stroke={isHollowTonic ? colors.ink : 'none'}
                                strokeWidth={isHollowTonic ? 2 : 0}
                            />
                            <SvgText
                                x={x}
                                y={y}
                                textAnchor="middle"
                                alignmentBaseline="central"
                                fontSize={fontSize}
                                fontFamily={fonts.sans.semiBold}
                                fill={isRoot || isHollowTonic ? (isRoot ? colors.sand1 : colors.ink) : colors.sand1}
                            >
                                {label}
                            </SvgText>
                        </G>
                    );
                })}

                {/* Interactive hit layer */}
                {interactive && (
                    <G>
                        {[...Array(numStrings)].map((_, s) =>
                            [...Array(numFrets + 1)].map((_, f) => {
                                if (interactivePositions && !interactivePositions.has(`${s}:${f}`)) {
                                    return null;
                                }
                                const x = xForString(s);
                                const y = f === 0 ? openY : yForFretMark(f);
                                return (
                                    <Circle
                                        key={`hit-${s}-${f}`}
                                        cx={x}
                                        cy={y}
                                        fill="transparent"
                                        r={18}
                                        onPress={() => onTogglePosition?.({ string: s, fret: f })}
                                    />
                                );
                            }),
                        )}
                    </G>
                )}
            </Svg>
        </ScrollView>
    );
};

export default FretboardVertical;
