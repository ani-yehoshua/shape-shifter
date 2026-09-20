// Port of ../../components/SavedChordsPanel.tsx on the website. Same list/
// rename/delete/load behavior, presented as a bottom-sheet Modal (this
// app's usual pattern for this kind of panel -- see the Menu sheet in
// app/index.tsx) instead of the website's slide-up-on-mobile /
// slide-in-from-right-on-desktop panel, since there's no desktop layout
// here.
import { useEffect, useState } from 'react';
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
import Svg, { Path } from 'react-native-svg';
import { deleteChord, fetchSavedChords, renameChord, type SavedChord } from '../lib/savedChords';
import { colors, fonts, radius, spacing } from '../lib/theme';

type Props = {
    visible: boolean;
    onClose: () => void;
    onLoad: (chord: SavedChord) => void;
    /** bumped by the parent to trigger a refetch right after a save */
    refreshKey?: number;
    /** called after a delete, so the parent can re-sync its own "is this
     *  chord saved?" bookmark state */
    onChange?: () => void;
};

function EditIcon() {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={`${colors.ink}80`} strokeWidth={2}>
            <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </Svg>
    );
}

function TrashIcon() {
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

function sourceLabel(chord: SavedChord) {
    const ctx = chord.context;
    if (ctx.source === 'draw') return 'Draw Mode';
    if (ctx.mode === 'scales') return 'Scale';
    return 'Library';
}

export default function SavedChordsPanel({ visible, onClose, onLoad, refreshKey = 0, onChange }: Props) {
    const [chords, setChords] = useState<SavedChord[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        fetchSavedChords()
            .then(setChords)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [visible, refreshKey]);

    async function handleDelete(id: string) {
        await deleteChord(id).catch(console.error);
        setChords((prev) => prev.filter((c) => c.id !== id));
        onChange?.();
    }

    async function handleRename(id: string) {
        const label = editLabel.trim();
        if (!label) return;
        await renameChord(id, label).catch(console.error);
        setChords((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
        setEditingId(null);
    }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={() => {}}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Saved Chords</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Text style={styles.closeX}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
                        {loading ? (
                            <ActivityIndicator style={styles.loading} color={colors.ink} />
                        ) : chords.length === 0 ? (
                            <Text style={styles.emptyText}>No saved chords yet. Hit the bookmark icon to save one.</Text>
                        ) : (
                            chords.map((chord) => (
                                <View key={chord.id} style={styles.row}>
                                    <View style={styles.labelRow}>
                                        {editingId === chord.id ? (
                                            <TextInput
                                                autoFocus
                                                style={styles.editInput}
                                                value={editLabel}
                                                onChangeText={setEditLabel}
                                                onSubmitEditing={() => handleRename(chord.id)}
                                            />
                                        ) : (
                                            <Text style={styles.label} numberOfLines={1}>
                                                {chord.label}
                                            </Text>
                                        )}

                                        {editingId === chord.id ? (
                                            <TouchableOpacity onPress={() => handleRename(chord.id)}>
                                                <Text style={styles.saveRenameText}>Save</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setEditingId(chord.id);
                                                    setEditLabel(chord.label);
                                                }}
                                            >
                                                <EditIcon />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    <View style={styles.metaRow}>
                                        <Text style={styles.sourceTag}>{sourceLabel(chord)}</Text>
                                        <Text style={styles.dateTag}>
                                            {new Date(chord.created_at).toLocaleDateString()}
                                        </Text>
                                        <View style={styles.spacer} />
                                        <TouchableOpacity onPress={() => handleDelete(chord.id)} style={styles.iconSpacing}>
                                            <TrashIcon />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => {
                                                onLoad(chord);
                                                onClose();
                                            }}
                                            style={styles.loadButton}
                                        >
                                            <Text style={styles.loadButtonText}>Load</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))
                        )}
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
        maxHeight: '80%',
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
    body: {
        maxHeight: 420,
    },
    bodyContent: {
        paddingBottom: spacing.lg,
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
    row: {
        paddingHorizontal: spacing.md + 4,
        paddingVertical: spacing.sm + 4,
        borderBottomWidth: 1,
        borderBottomColor: `${colors.ink}1A`,
        gap: spacing.xs,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    label: {
        flex: 1,
        fontFamily: fonts.sans.semiBold,
        fontSize: 14,
        color: colors.ink,
    },
    editInput: {
        flex: 1,
        fontFamily: fonts.sans.semiBold,
        fontSize: 14,
        color: colors.ink,
        backgroundColor: colors.sand2,
        borderRadius: radius.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: `${colors.ink}33`,
    },
    saveRenameText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.olive,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    sourceTag: {
        fontFamily: fonts.sans.bold,
        fontSize: 9,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: `${colors.ink}66`,
    },
    dateTag: {
        fontSize: 9,
        color: `${colors.ink}40`,
    },
    spacer: {
        flex: 1,
    },
    iconSpacing: {
        marginRight: spacing.xs,
    },
    loadButton: {
        backgroundColor: colors.ink,
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
    },
    loadButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.sand1,
    },
});
