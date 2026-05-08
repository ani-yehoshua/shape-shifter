import { BEGINNER_CHORD_SHAPES } from '@/lib/ChordShapes/Beginner';
import { INTERMEDIATE_CHORD_SHAPES } from '@/lib/ChordShapes/Intermediate';
import createClient from '@/lib/supabaseBrowserClient';

const supabase = createClient();

// DELETE currently logged-in user
export async function deleteAccount(): Promise<{
    success: boolean;
    message: string;
}> {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session) throw new Error('No active session');

    const res = await fetch('/api/delete-account', {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || 'Failed to delete your account');
    }
    return res.json();
}

// UPDATE current user's email
export async function updateEmail(newEmail: string): Promise<unknown> {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session) throw new Error('No active session');

    const res = await fetch('/api/update-email', {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: newEmail }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || 'Failed to update your email');
    }
    return res.json();
}

// UPDATE current user's password
export async function updatePassword(newPassword: string): Promise<unknown> {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session) throw new Error('No active session');

    const res = await fetch('/api/update-password', {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || 'Failed to update your password');
    }
    return res.json();
}

// GET user's settings
export async function getSettings() {
    return supabase.from('settings').select('*').single();
}

// UPDATE user's settings
export async function updateSettings(payload: Record<string, unknown>) {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('No active session');
    const { data, error } = await supabase
        .from('settings')
        .update(payload)
        .eq('user_id', user.id);
    if (error) throw error;
    return data;
}

// Email validator
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password validator
export function isValidPassword(password: string): boolean {
    return (
        /.{8,}/.test(password) &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[!@#$%^&_.?\/-]/.test(password) &&
        !/[*()+={}|,<>:;"']/.test(password)
    );
}

// Convert difficulty level names to initials for mobile display
export function toInitials(
    str: string,
    { delimiter = '.', trailForMulti = true } = {},
): string {
    if (!str) return '';
    const parts = str
        .trim()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
    if (parts.length === 0) return '';
    const letters = parts.map(p => p[0].toUpperCase());
    const joined = letters.join(delimiter);
    return letters.length > 1 && trailForMulti ? joined + delimiter : joined;
}

export const allChordShapes = {
    CAGED: (BEGINNER_CHORD_SHAPES as any).CAGED,
    Triads: (BEGINNER_CHORD_SHAPES as any).Triads,
    Sevenths: (INTERMEDIATE_CHORD_SHAPES as any).Sevenths,
    Shells: (INTERMEDIATE_CHORD_SHAPES as any).Shells,
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

type MatchInfo = {
    positionsMap?: Record<string, unknown>;
    posKey?: string;
    altIdx?: number;
    difficulty?: string;
    category?: string;
    voicingType?: string;
    stringSet?: string;
    quality?: string;
    trail?: string[];
} | null;

// Helper for Draw Mode to search chord library and return drawn chord info
export function getFinalFormulasFromMatch(
    shapes: Record<string, unknown>,
    matchInfo: MatchInfo,
): {
    finalFormulas: Record<string, unknown> | null;
    availableAlts: unknown[];
    posKey: string;
    altIdx: number;
} {
    if (!matchInfo) {
        return {
            finalFormulas: null,
            availableAlts: [],
            posKey: '',
            altIdx: 0,
        };
    }

    if (matchInfo.positionsMap && typeof matchInfo.positionsMap === 'object') {
        const fm = matchInfo.positionsMap as Record<string, any>;
        const base = fm[matchInfo.posKey ?? ''];
        const availableAlts = base
            ? [base, ...(Array.isArray(base.altShapes) ? base.altShapes : [])]
            : [];
        return {
            finalFormulas: fm,
            availableAlts,
            posKey: matchInfo.posKey ?? '',
            altIdx: matchInfo.altIdx ?? 0,
        };
    }

    const {
        difficulty,
        category,
        voicingType,
        stringSet,
        quality,
        posKey = '',
        altIdx = 0,
    } = matchInfo;

    let node: any = (shapes as any)?.[difficulty!]?.[category!];
    if (!node)
        return {
            finalFormulas: null,
            availableAlts: [],
            posKey: '',
            altIdx: 0,
        };

    const go = (levelName: string, key: string | undefined) => {
        if (!key) return;
        if (node?.levelName === levelName && node.options?.[key]) {
            node = node.options[key];
        } else if (node?.options?.[key]) {
            node = node.options[key];
        }
    };

    go('Voicing Types', voicingType);
    go('String Sets', stringSet);
    go('Chord Qualities', quality);

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

    const finalFormulas =
        node?.options && isPositionBag(node.options)
            ? (node.options as Record<string, unknown>)
            : null;

    let availableAlts: unknown[] = [];
    if (finalFormulas && posKey && finalFormulas[posKey]) {
        const base = finalFormulas[posKey] as any;
        availableAlts = [
            base,
            ...(Array.isArray(base.altShapes) ? base.altShapes : []),
        ];
    }

    return { finalFormulas, availableAlts, posKey, altIdx };
}
