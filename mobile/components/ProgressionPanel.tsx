// Port of ../../components/ProgressionPanel.tsx on the website. Same
// build-a-progression flow (saved-progression switcher, name + BPM,
// reorderable chord list with inline rename/delete, add-current-chord,
// playback, save/delete) as a bottom-sheet Modal instead of the website's
// slide-up-on-mobile/slide-in-from-right-on-desktop panel.
//
// Differences from the website version, deliberately:
// - userId/hasPro are read locally via useAuth/useSubscription instead of
//   being threaded in as props (same self-contained style already used in
//   SavedChordsPanel.tsx here), so only onAuthRequired is still a prop --
//   it opens this app's shared auth-gate modal in app/index.tsx, since that
//   state lives at the screen level, not here.
// - Saving while signed in but not Pro doesn't call a separate
//   onProRequired the way the website opens its paywall -- there's no
//   paywall screen here yet, so it's the same silent-no-op-behind-a-star-
//   badge treatment already used for Draw Mode / alt shapes elsewhere in
//   this app.
// - The BPM control is a +/- stepper instead of the website's draggable
//   range slider anchored in a popup -- RN has no built-in slider, and
//   adding a dependency for a 40-200bpm control (step 5) felt like more
//   than this needed; a stepper covers the same range/step exactly.
// - No draft-persist-across-a-sign-in-redirect (the website stashes an
//   unsaved progression in localStorage before bouncing to /signin and
//   restores it after). This app's sign-in doesn't navigate away from the
//   panel the way a full-page redirect would, so there's nothing to lose in
//   the first place -- the auth-gate modal is just an overlay on top of the
//   same screen.
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Svg, { Path, Polygon, Rect } from 'react-native-svg';
import { useAuth } from '../lib/auth-context';
import { playChord } from '../lib/guitarAudio';
import { useSubscription } from '../lib/hooks/useSubscription';
import {
    deleteProgression,
    fetchProgressions,
    saveProgression,
    updateProgression,
    type Progression,
    type ProgressionChord,
} from '../lib/progressions';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/theme-context';
import type { NotePosition } from '../lib/fretboardMap';

type CurrentChord = {
    label: string;
    notes: NotePosition[];
    tuningName: string;
    tuningFreqs?: number[];
    capo: number;
};

type Props = {
    visible: boolean;
    onClose: () => void;
    currentChord: CurrentChord | null;
    onAuthRequired: () => void;
    pendingChord?: CurrentChord | null;
    onPendingConsumed?: () => void;
};

function randomId() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function TrashIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={18} height={18} viewBox="0 0 20 20" fill={`${colors.ink}66`}>
            <Path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482 41.03 41.03 0 00-2.365-.298V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
            />
        </Svg>
    );
}

function EditIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={`${colors.ink}80`} strokeWidth={2}>
            <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </Svg>
    );
}

function ChevronUpIcon({ disabled }: { disabled?: boolean }) {
    const { colors } = useTheme();
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={disabled ? `${colors.ink}33` : `${colors.ink}99`} strokeWidth={2} strokeLinecap="round">
            <Path d="M18 15l-6-6-6 6" />
        </Svg>
    );
}

function ChevronDownIcon({ disabled }: { disabled?: boolean }) {
    const { colors } = useTheme();
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={disabled ? `${colors.ink}33` : `${colors.ink}99`} strokeWidth={2} strokeLinecap="round">
            <Path d="M6 9l6 6 6-6" />
        </Svg>
    );
}

function PlayIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.sand1}>
            <Polygon points="5 3 19 12 5 21 5 3" />
        </Svg>
    );
}

function StopIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.sand1}>
            <Rect x={5} y={5} width={14} height={14} rx={2} />
        </Svg>
    );
}

function StarIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={10} height={10} viewBox="0 0 24 24" fill={colors.sand1}>
            <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </Svg>
    );
}

export default function ProgressionPanel({ visible, onClose, currentChord, onAuthRequired, pendingChord, onPendingConsumed }: Props) {
    const { session } = useAuth();
    const { colors } = useTheme();
    const styles = useThemedStyles(makeStyles);
    const hasPro = useSubscription();

    const [progressions, setProgressions] = useState<Progression[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState('My Progression');
    const [bpm, setBpm] = useState(80);
    const [chords, setChords] = useState<ProgressionChord[]>([]);
    const [dirty, setDirty] = useState(false);

    const [editingChordId, setEditingChordId] = useState<string | null>(null);
    const [editingChordLabel, setEditingChordLabel] = useState('');

    const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);
    const isPlaying = playingIndex !== null;

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        fetchProgressions()
            .then((data) => {
                setProgressions(data);
                if (!activeId && data.length > 0) loadProgression(data[0]);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    useEffect(() => {
        if (!pendingChord) return;
        const slot: ProgressionChord = { id: randomId(), ...pendingChord };
        setChords((prev) => [...prev, slot]);
        setDirty(true);
        onPendingConsumed?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingChord]);

    function loadProgression(p: Progression) {
        setActiveId(p.id);
        setName(p.name);
        setBpm(p.bpm);
        setChords(p.chords);
        setDirty(false);
    }

    function newProgression() {
        setActiveId(null);
        setName('My Progression');
        setBpm(80);
        setChords([]);
        setDirty(false);
    }

    function addCurrentChord() {
        if (!currentChord) return;
        setChords((prev) => [...prev, { id: randomId(), ...currentChord }]);
        setDirty(true);
    }

    function confirmRename(id: string) {
        const label = editingChordLabel.trim();
        if (label) {
            setChords((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
            setDirty(true);
        }
        setEditingChordId(null);
    }

    function removeChord(id: string) {
        setChords((prev) => prev.filter((c) => c.id !== id));
        setDirty(true);
    }

    function moveChord(index: number, dir: -1 | 1) {
        setChords((prev) => {
            const next = [...prev];
            const target = index + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
        setDirty(true);
    }

    async function handleSave() {
        if (!session) {
            onAuthRequired();
            return;
        }
        if (!hasPro) return; // no paywall screen yet -- see the file-level note
        setSaving(true);
        try {
            if (activeId) {
                await updateProgression(activeId, { name: name.trim() || 'My Progression', bpm, chords });
                setProgressions((prev) => prev.map((p) => (p.id === activeId ? { ...p, name, bpm, chords } : p)));
            } else {
                const saved = await saveProgression({ name: name.trim() || 'My Progression', bpm, chords });
                setProgressions((prev) => [saved, ...prev]);
                setActiveId(saved.id);
            }
            setDirty(false);
        } catch (e) {
            if (e instanceof Error && e.message === 'Not signed in') onAuthRequired();
            else console.error(e);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        await deleteProgression(id).catch(console.error);
        const remaining = progressions.filter((p) => p.id !== id);
        setProgressions(remaining);
        if (activeId === id) {
            if (remaining.length > 0) loadProgression(remaining[0]);
            else newProgression();
        }
    }

    function stopPlayback() {
        playTimers.current.forEach(clearTimeout);
        playTimers.current = [];
        setPlayingIndex(null);
    }

    function startPlayback() {
        if (chords.length === 0) return;
        stopPlayback();
        const msPerBeat = 60000 / bpm;
        const msPerChord = msPerBeat * 4; // one bar per chord
        chords.forEach((chord, i) => {
            const t = setTimeout(() => {
                setPlayingIndex(i);
                playChord(chord.notes, chord.tuningFreqs);
                if (i === chords.length - 1) {
                    const end = setTimeout(() => setPlayingIndex(null), msPerChord);
                    playTimers.current.push(end);
                }
            }, i * msPerChord);
            playTimers.current.push(t);
        });
    }

    useEffect(() => {
        if (!visible) stopPlayback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={() => {}}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Progression Builder</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={styles.closeX}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {progressions.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.switcher} contentContainerStyle={styles.switcherContent}>
                            <TouchableOpacity
                                onPress={newProgression}
                                style={[styles.switcherPill, activeId === null && !dirty && styles.switcherPillActive]}
                            >
                                <Text style={[styles.switcherPillText, activeId === null && !dirty && styles.switcherPillTextActive]}>
                                    + New
                                </Text>
                            </TouchableOpacity>
                            {progressions.map((p) => (
                                <TouchableOpacity
                                    key={p.id}
                                    onPress={() => loadProgression(p)}
                                    style={[styles.switcherPill, activeId === p.id && styles.switcherPillActive]}
                                >
                                    <Text style={[styles.switcherPillText, activeId === p.id && styles.switcherPillTextActive]}>
                                        {p.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    <View style={styles.nameBpmRow}>
                        <TextInput
                            style={styles.nameInput}
                            value={name}
                            onChangeText={(v) => {
                                setName(v);
                                setDirty(true);
                            }}
                            placeholder="Progression name…"
                            placeholderTextColor={`${colors.ink}66`}
                        />
                        <View style={styles.bpmStepper}>
                            <TouchableOpacity
                                onPress={() => {
                                    setBpm((v) => Math.max(40, v - 5));
                                    setDirty(true);
                                }}
                                style={styles.bpmStepButton}
                            >
                                <Text style={styles.bpmStepButtonText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.bpmValue}>{bpm}</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setBpm((v) => Math.min(200, v + 5));
                                    setDirty(true);
                                }}
                                style={styles.bpmStepButton}
                            >
                                <Text style={styles.bpmStepButtonText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView style={styles.list}>
                        {loading ? (
                            <ActivityIndicator style={styles.loading} color={colors.ink} />
                        ) : chords.length === 0 ? (
                            <Text style={styles.emptyText}>No chords yet. Hit "Add Chord" to get started.</Text>
                        ) : (
                            chords.map((chord, i) => (
                                <View key={chord.id} style={[styles.chordRow, playingIndex === i && styles.chordRowPlaying]}>
                                    <View style={[styles.posBadge, playingIndex === i && styles.posBadgeActive]}>
                                        <Text style={[styles.posBadgeText, playingIndex === i && styles.posBadgeTextActive]}>
                                            {i + 1}
                                        </Text>
                                    </View>

                                    <View style={styles.chordInfo}>
                                        {editingChordId === chord.id ? (
                                            <TextInput
                                                autoFocus
                                                style={styles.chordEditInput}
                                                value={editingChordLabel}
                                                onChangeText={setEditingChordLabel}
                                                onSubmitEditing={() => confirmRename(chord.id)}
                                                onBlur={() => confirmRename(chord.id)}
                                            />
                                        ) : (
                                            <Text style={styles.chordLabel} numberOfLines={1}>
                                                {chord.label}
                                            </Text>
                                        )}
                                        <Text style={styles.chordMeta}>
                                            {chord.tuningName}
                                            {chord.capo > 0 ? ` · Capo ${chord.capo}` : ''}
                                        </Text>
                                    </View>

                                    <View style={styles.reorderCol}>
                                        <TouchableOpacity onPress={() => moveChord(i, -1)} disabled={i === 0}>
                                            <ChevronUpIcon disabled={i === 0} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => moveChord(i, 1)} disabled={i === chords.length - 1}>
                                            <ChevronDownIcon disabled={i === chords.length - 1} />
                                        </TouchableOpacity>
                                    </View>

                                    {editingChordId === chord.id ? (
                                        <TouchableOpacity onPress={() => confirmRename(chord.id)}>
                                            <Text style={styles.saveRenameText}>Save</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity
                                            onPress={() => {
                                                setEditingChordId(chord.id);
                                                setEditingChordLabel(chord.label);
                                            }}
                                        >
                                            <EditIcon />
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity onPress={() => removeChord(chord.id)}>
                                        <TrashIcon />
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </ScrollView>

                    <View style={styles.footer}>
                        <View style={styles.footerRow}>
                            <TouchableOpacity
                                onPress={addCurrentChord}
                                disabled={!currentChord}
                                style={[styles.addButton, !currentChord && styles.disabled]}
                            >
                                <Text style={styles.addButtonText}>+ Add Chord</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={isPlaying ? stopPlayback : startPlayback}
                                disabled={chords.length === 0}
                                style={[styles.playButton, chords.length === 0 && styles.disabled]}
                            >
                                {isPlaying ? <StopIcon /> : <PlayIcon />}
                                <Text style={styles.playButtonText}>{isPlaying ? 'Stop' : 'Play'}</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.footerRow}>
                            {activeId && hasPro && (
                                <TouchableOpacity onPress={() => handleDelete(activeId)} style={styles.deleteButton}>
                                    <Text style={styles.deleteButtonText}>Delete</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={saving || (hasPro && !dirty)}
                                style={[styles.saveButton, (saving || (hasPro && !dirty)) && styles.disabled]}
                            >
                                {!hasPro && (
                                    <View style={styles.proBadge}>
                                        <StarIcon />
                                    </View>
                                )}
                                <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Progression'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
        maxHeight: '85%',
        backgroundColor: colors.sand1,
        borderTopLeftRadius: radius['2xl'],
        borderTopRightRadius: radius['2xl'],
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md + 4,
        paddingTop: spacing.md + 4,
        paddingBottom: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: `${colors.ink}1A`,
    },
    headerTitle: {
        fontFamily: fonts.sans.bold,
        fontSize: 15,
        color: colors.ink,
    },
    closeX: {
        fontSize: 18,
        color: `${colors.ink}66`,
    },
    switcher: {
        flexGrow: 0,
        borderBottomWidth: 1,
        borderBottomColor: `${colors.ink}1A`,
    },
    switcherContent: {
        flexDirection: 'row',
        gap: spacing.xs + 2,
        paddingHorizontal: spacing.md + 4,
        paddingVertical: spacing.xs + 4,
    },
    switcherPill: {
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    switcherPillActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    switcherPillText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: colors.ink,
    },
    switcherPillTextActive: {
        color: colors.sand1,
    },
    nameBpmRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md + 4,
        paddingTop: spacing.sm + 4,
        paddingBottom: spacing.xs + 4,
    },
    nameInput: {
        flex: 1,
        backgroundColor: colors.sand2,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: `${colors.ink}33`,
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 4,
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: colors.ink,
    },
    bpmStepper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}4D`,
        overflow: 'hidden',
    },
    bpmStepButton: {
        width: 28,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bpmStepButtonText: {
        fontFamily: fonts.sans.bold,
        fontSize: 16,
        color: colors.ink,
    },
    bpmValue: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
        minWidth: 32,
        textAlign: 'center',
    },
    list: {
        maxHeight: 300,
    },
    loading: {
        paddingVertical: spacing.xl,
    },
    emptyText: {
        fontFamily: fonts.sans.regular,
        fontSize: 13,
        color: `${colors.ink}66`,
        textAlign: 'center',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
    },
    chordRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md + 4,
        paddingVertical: spacing.sm + 2,
        borderBottomWidth: 1,
        borderBottomColor: `${colors.ink}1A`,
    },
    chordRowPlaying: {
        backgroundColor: `${colors.ink}0D`,
    },
    posBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: `${colors.ink}1A`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    posBadgeActive: {
        backgroundColor: colors.ink,
    },
    posBadgeText: {
        fontFamily: fonts.sans.bold,
        fontSize: 10,
        color: `${colors.ink}80`,
    },
    posBadgeTextActive: {
        color: colors.sand1,
    },
    chordInfo: {
        flex: 1,
        minWidth: 0,
    },
    chordLabel: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: colors.ink,
    },
    chordEditInput: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: colors.ink,
        backgroundColor: colors.sand2,
        borderRadius: radius.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: `${colors.ink}33`,
    },
    chordMeta: {
        fontSize: 10,
        color: `${colors.ink}66`,
    },
    reorderCol: {
        alignItems: 'center',
        gap: 2,
    },
    saveRenameText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: colors.olive,
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}1A`,
        paddingHorizontal: spacing.md + 4,
        paddingTop: spacing.sm + 4,
        paddingBottom: spacing.lg,
        gap: spacing.sm,
    },
    footerRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    addButton: {
        flex: 1,
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        alignItems: 'center',
    },
    addButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: colors.ink,
    },
    playButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
    },
    playButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: colors.sand1,
    },
    deleteButton: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: '#dc2626',
    },
    deleteButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: '#dc2626',
    },
    saveButton: {
        flex: 1,
        position: 'relative',
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
        alignItems: 'center',
    },
    saveButtonText: {
        fontFamily: fonts.sans.bold,
        fontSize: 13,
        color: colors.sand1,
    },
    proBadge: {
        position: 'absolute',
        top: -2,
        right: 8,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.olive,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    disabled: {
        opacity: 0.4,
    },
});
