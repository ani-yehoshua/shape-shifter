// Trimmed port of ../lib/API.ts on the website: only what Chords mode
// actually needs. The website's version also has account-management
// helpers (deleteAccount/updateEmail/updatePassword/getSettings) that call
// relative /api/* routes -- those only exist on the Next.js server, so
// they'll need to point at the deployed website's absolute URL once a
// Settings screen is built here. getFinalFormulasFromMatch is Draw Mode
// only, and follows once that's ported.
import { CHORD_SHAPES } from './Shapes/Chords';

export const allChordShapes = {
    CAGED: (CHORD_SHAPES as any).CAGED,
    Triads: (CHORD_SHAPES as any).Triads,
    Sevenths: (CHORD_SHAPES as any).Sevenths,
    Shells: (CHORD_SHAPES as any).Shells,
};

// Helpers for +/- position cycling buttons
export function useCycleList<T>(
    items: T[],
    current: T,
    onChange: (item: T) => void,
    { allToken }: { allToken?: T } = {},
) {
    const isIndex = typeof current === 'number';

    function step(dir: 1 | -1) {
        if (!items?.length) return;
        if (!isIndex && allToken !== undefined && current === allToken) {
            onChange(dir === 1 ? items[0] : items[items.length - 1]);
            return;
        }
        const i = isIndex
            ? (current as unknown as number)
            : items.indexOf(current);
        const next = (i + dir + items.length) % items.length;
        onChange(isIndex ? (next as unknown as T) : items[next]);
    }

    return { prev: () => step(-1), next: () => step(1) };
}
