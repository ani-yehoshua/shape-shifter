// Port of ../../lib/savedChords.ts on the website. Straight Supabase table
// reads/writes with no Next.js-route dependency, so this needed no real
// adaptation beyond swapping the website's per-call createClient() factory
// (its @supabase/ssr cookie-based client) for this app's single shared
// AsyncStorage-backed client from ./supabase.
import { supabase } from './supabase';
import type { NotePosition } from './fretboardMap';

export type SavedChordContext =
    | {
          source: 'draw';
          tuningName: string;
          capo: number;
      }
    | {
          source: 'library';
          mode: 'chords';
          rootNote: string;
          tuningName: string;
          capo: number;
          category: string;
          voicingType: string;
          stringSet: string;
          chordQuality: string;
          position: string;
          altShape: number;
      }
    | {
          source: 'library';
          mode: 'scales';
          rootNote: string;
          tuningName: string;
          capo: number;
          noteGroup: string;
          scale: string;
          scalePosition: number;
          scalePattern: string;
          scaleVariant: number;
      };

export type SavedChord = {
    id: string;
    label: string;
    notes: NotePosition[];
    context: SavedChordContext;
    created_at: string;
};

export async function getCurrentUserId(): Promise<string | null> {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
}

export async function fetchSavedChords(): Promise<SavedChord[]> {
    const { data, error } = await supabase
        .from('saved_chords')
        .select('id, label, notes, context, created_at')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedChord[];
}

export async function saveChord(chord: {
    label: string;
    notes: NotePosition[];
    context: SavedChordContext;
}): Promise<SavedChord> {
    const uid = await getCurrentUserId();
    if (!uid) throw new Error('Not signed in');
    const { data, error } = await supabase
        .from('saved_chords')
        .insert({ user_id: uid, ...chord })
        .select('id, label, notes, context, created_at')
        .single();
    if (error) throw error;
    return data as SavedChord;
}

export async function renameChord(id: string, label: string): Promise<void> {
    const { error } = await supabase.from('saved_chords').update({ label }).eq('id', id);
    if (error) throw error;
}

export async function deleteChord(id: string): Promise<void> {
    const { error } = await supabase.from('saved_chords').delete().eq('id', id);
    if (error) throw error;
}
