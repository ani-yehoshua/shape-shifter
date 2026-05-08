import * as React from 'react';

type ChordLibraryParams = {
    allChordShapes: Record<string, any>;
    selectedCategory: string;
    selectedVoicingType: string;
    selectedStringSet: string;
    selectedChordQuality: string;
    selectedPosition: string;
};

export default function useChordLibrary({
    allChordShapes,
    selectedCategory,
    selectedVoicingType,
    selectedStringSet,
    selectedChordQuality,
    selectedPosition,
}: ChordLibraryParams) {
    const selectionHierarchy = React.useMemo(() => {
        const hierarchy: {
            categories: string[];
            subLevels: { levelName: string; options: string[] }[];
            finalFormulas: Record<string, any> | null;
            positions: string[];
        } = {
            categories: Object.keys(allChordShapes),
            subLevels: [],
            finalFormulas: null,
            positions: [],
        };

        if (!selectedCategory) return hierarchy;
        let currentLevel: any = allChordShapes[selectedCategory];

        if (
            currentLevel?.options &&
            Object.values(currentLevel.options)[0] != null &&
            (Object.values(currentLevel.options)[0] as any)?.pattern != null
        ) {
            hierarchy.finalFormulas = currentLevel.options;
            hierarchy.positions = Object.keys(currentLevel.options);
        }

        const selections: Record<string, string> = {
            'Voicing Types': selectedVoicingType,
            'String Sets': selectedStringSet,
            'Chord Qualities': selectedChordQuality,
        };

        while (
            currentLevel &&
            currentLevel.levelName &&
            currentLevel.options &&
            !(
                currentLevel.options &&
                Object.values(currentLevel.options)[0] != null &&
                (Object.values(currentLevel.options)[0] as any)?.pattern != null
            )
        ) {
            const levelName: string = currentLevel.levelName;
            const options = Object.keys(currentLevel.options);
            const currentSelection = selections[levelName];

            hierarchy.subLevels.push({ levelName, options });

            if (!currentSelection || !currentLevel.options[currentSelection]) {
                return hierarchy;
            }
            currentLevel = currentLevel.options[currentSelection];
        }

        if (currentLevel?.options) {
            hierarchy.finalFormulas = currentLevel.options;
            hierarchy.positions = Object.keys(currentLevel.options);
        }

        return hierarchy;
    }, [
        allChordShapes,
        selectedCategory,
        selectedVoicingType,
        selectedStringSet,
        selectedChordQuality,
    ]);

    const availableAlts = React.useMemo(() => {
        if (
            !selectedPosition ||
            selectedPosition === 'All' ||
            !selectionHierarchy.finalFormulas
        ) {
            return [];
        }
        const positionData = selectionHierarchy.finalFormulas[selectedPosition];
        if (!positionData) return [];
        const all = [positionData];
        if (positionData.altShapes && Array.isArray(positionData.altShapes)) {
            all.push(...positionData.altShapes);
        }
        return all;
    }, [selectedPosition, selectionHierarchy.finalFormulas]);

    return { selectionHierarchy, availableAlts };
}
