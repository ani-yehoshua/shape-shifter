// Draw Mode's "Shapes" sheet: change the matched drawing without leaving Draw
// Mode (a chord's inversion and alternate shape, a scale's pattern, variant and
// box). app/index.tsx builds the groups and applies the choices; this only lays
// them out. It isn't dimmed, so the fretboard stays visible above it and shows
// each change straight away. (Website twin: components/ShapesPanel.tsx.)
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useThemedStyles } from '../lib/theme-context';

export type ShapeGroup = {
    title: string;
    options: { label: string; selected: boolean; onSelect: () => void }[];
};

type Props = {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    groups: ShapeGroup[];
};

export default function ShapesSheet({ visible, onClose, title, subtitle, groups }: Props) {
    const styles = useThemedStyles(makeStyles);
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                {/* tap-away is a sibling, not a wrapper: a Pressable around the sheet steals the scroll */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <View style={styles.headerText}>
                            <Text style={styles.title}>{title}</Text>
                            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={10}>
                            <Text style={styles.closeX}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={styles.body}>
                        {groups.map(group => (
                            <View key={group.title} style={styles.group}>
                                <Text style={styles.groupTitle}>{group.title}</Text>
                                <View style={styles.chips}>
                                    {group.options.map(option => (
                                        <TouchableOpacity
                                            key={option.label}
                                            onPress={option.onSelect}
                                            style={[styles.chip, option.selected && styles.chipSelected]}>
                                            <Text style={[styles.chipText, option.selected && styles.chipTextSelected]}>
                                                {option.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const makeStyles = (colors: Palette) =>
    StyleSheet.create({
        backdrop: { flex: 1, justifyContent: 'flex-end' },
        sheet: {
            maxHeight: '45%',
            backgroundColor: colors.sand2,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            borderTopWidth: 1,
            borderColor: `${colors.ink}1A`,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: spacing.md,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.md,
            paddingBottom: spacing.sm,
        },
        headerText: { flex: 1, gap: 2 },
        title: { fontFamily: fonts.sans.bold, fontSize: 15, color: colors.ink },
        subtitle: { fontFamily: fonts.sans.regular, fontSize: 11, color: `${colors.ink}99` },
        closeX: { fontSize: 18, color: `${colors.ink}66` },
        body: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
        group: { gap: spacing.xs + 2 },
        groupTitle: {
            fontFamily: fonts.sans.bold,
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: `${colors.ink}80`,
        },
        chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
        chip: {
            paddingHorizontal: spacing.sm + 4,
            paddingVertical: spacing.xs + 2,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: `${colors.ink}66`,
        },
        chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
        chipText: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: colors.ink },
        chipTextSelected: { color: colors.sand1 },
    });
