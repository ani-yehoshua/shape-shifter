import createClient from '@/lib/supabaseBrowserClient';
import type { NotePosition } from '@/lib/fretboardMap';

export type ProgressionChord = {
    id: string;
    label: string;
    notes: NotePosition[];
    tuningName: string;
    tuningFreqs?: number[];
    capo: number;
};

export type Progression = {
    id: string;
    name: string;
    bpm: number;
    chords: ProgressionChord[];
    created_at: string;
};

function client() {
    return createClient();
}

export async function fetchProgressions(): Promise<Progression[]> {
    const supabase = client();
    const { data, error } = await supabase
        .from('progressions')
        .select('id, name, bpm, chords, created_at')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Progression[];
}

export async function saveProgression(
    p: Omit<Progression, 'id' | 'created_at'>,
): Promise<Progression> {
    const supabase = client();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    const { data, error } = await supabase
        .from('progressions')
        .insert({ user_id: session.user.id, ...p })
        .select('id, name, bpm, chords, created_at')
        .single();
    if (error) throw error;
    return data as Progression;
}

export async function updateProgression(
    id: string,
    patch: Partial<Pick<Progression, 'name' | 'bpm' | 'chords'>>,
): Promise<void> {
    const supabase = client();
    const { error } = await supabase
        .from('progressions')
        .update(patch)
        .eq('id', id);
    if (error) throw error;
}

export async function deleteProgression(id: string): Promise<void> {
    const supabase = client();
    const { error } = await supabase
        .from('progressions')
        .delete()
        .eq('id', id);
    if (error) throw error;
}
