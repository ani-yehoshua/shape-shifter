import * as React from 'react';
import {
    generateFretboardMap,
    generateAllVoicingsForShape,
} from '../fretboardMap';

function keyFromVoicing(voicing: { string: number; fret: number | null }[]) {
    return voicing
        .filter(n => n && n.fret != null)
        .map(v => `${v.string}:${v.fret}`)
        .sort((a, b) => a.localeCompare(b))
        .join('|');
}

export function keyFromSelection(selection: Map<number, number>): string {
    return Array.from(selection.entries())
        .map(([s, f]) => `${s}:${f}`)
        .sort((a, b) => a.localeCompare(b))
        .join('|');
}

type DrawModeIndexParams = {
    allChordShapes: Record<string, any>;
    tuning: string[];
    numFrets: number;
    rootNote: string;
};

export function useDrawModeIndex({
    allChordShapes,
    tuning,
    numFrets,
    rootNote,
}: DrawModeIndexParams) {
    const fretboardMap = React.useMemo(
        () => generateFretboardMap(tuning, numFrets),
        [tuning, numFrets],
    );

    const index = React.useMemo(() => {
        const idx = new Map<string, any>();
        if (!rootNote) return idx;

        const isPositionBag = (bag: unknown): boolean => {
            if (!bag || typeof bag !== 'object') return false;
            const vals = Object.values(bag as object);
            if (!vals.length) return false;
            const v = vals[0] as any;
            return (
                v &&
                typeof v === 'object' &&
                ('pattern' in v ||
                    'altShapes' in v ||
                    ('rootString' in v && 'name' in v))
            );
        };

        function crawl(
            node: any,
            emit: (positions: any, trail: string[]) => void,
            trail: string[] = [],
        ) {
            if (!node || !node.options || typeof node.options !== 'object')
                return;
            if (isPositionBag(node.options)) emit(node.options, trail);
            for (const [label, child] of Object.entries(node.options) as [
                string,
                any,
            ][]) {
                if (
                    child &&
                    child.levelName === 'Positions' &&
                    isPositionBag(child.options)
                ) {
                    emit(child.options, [...trail, label]);
                }
                crawl(child, emit, [...trail, label]);
            }
        }

        for (const [difficulty, categories] of Object.entries(allChordShapes)) {
            for (const [category, node] of Object.entries(
                categories as Record<string, any>,
            )) {
                crawl(node, (positions, trail) => {
                    if (!positions || typeof positions !== 'object') return;
                    for (const [posKey, base] of Object.entries(positions) as [
                        string,
                        any,
                    ][]) {
                        if (!base || typeof base !== 'object') continue;
                        const variants = [
                            base,
                            ...(Array.isArray(base.altShapes)
                                ? base.altShapes
                                : []),
                        ];
                        variants.forEach((formula, altIdx) => {
                            if (!formula) return;
                            const raw =
                                generateAllVoicingsForShape(
                                    rootNote,
                                    formula,
                                    fretboardMap,
                                ) || [];
                            const voicings = Array.isArray(raw[0])
                                ? raw
                                : [raw];
                            for (const v of voicings) {
                                if (!Array.isArray(v) || !v.length) continue;
                                const k = `${rootNote}::${keyFromVoicing(v as { string: number; fret: number | null }[])}`;
                                idx.set(k, {
                                    difficulty,
                                    category,
                                    posKey,
                                    altIdx,
                                    formulaName: base.name || posKey,
                                    trail,
                                    positionsMap: positions,
                                });
                            }
                        });
                    }
                });
            }
        }

        return idx;
    }, [allChordShapes, rootNote, fretboardMap]);

    return { index, fretboardMap };
}
