// The "ⓘ" sheet: explains what's on the fretboard right now. The text itself
// comes from lib/theory (explainChord / explainScale), which works it out from
// the selection and the dots on screen; this component only lays it out.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { InfoContent } from '../lib/theory';
import DiagramView from './DiagramView';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useThemedStyles } from '../lib/theme-context';

type Props = {
    visible: boolean;
    onClose: () => void;
    /** called when the sheet is open, so the text always reflects the current selection */
    getContent: () => InfoContent | null;
};

/** Label/value rows whose values start in one straight column: every label is
 *  given the width of the widest label in the list (measured, not guessed). */
function AlignedRows({ items }: { items: { label: string; value: string }[] }) {
    const styles = useThemedStyles(makeStyles);
    const [labelWidth, setLabelWidth] = useState(0);
    const widest = (w: number) => setLabelWidth(prev => (w > prev ? Math.ceil(w) : prev));
    return (
        <>
            {items.map((item, i) => (
                <View key={i} style={styles.row}>
                    <Text
                        style={[styles.rowLabel, labelWidth > 0 && { width: labelWidth }]}
                        onTextLayout={e => {
                            const w = Math.max(0, ...e.nativeEvent.lines.map(l => l.width));
                            widest(w);
                        }}>
                        {item.label}
                    </Text>
                    <Text style={styles.rowValue}>{item.value}</Text>
                </View>
            ))}
        </>
    );
}

export default function InfoSheet({ visible, onClose, getContent }: Props) {
    const styles = useThemedStyles(makeStyles);
    const content = visible ? getContent() : null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                {/* Backdrop tap-to-close is a sibling, not a wrapper: a Pressable around the
                    sheet steals the touches the ScrollView needs to scroll. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <View style={styles.headerText}>
                            <Text style={styles.title}>{content?.title ?? 'Info'}</Text>
                            {content?.subtitle ? <Text style={styles.subtitle}>{content.subtitle}</Text> : null}
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={10}>
                            <Text style={styles.closeX}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
                        {content ? (
                            content.sections.map(section => (
                                <View key={section.title} style={styles.section}>
                                    <Text style={styles.sectionTitle}>{section.title}</Text>
                                    {section.kind === 'text' ? (
                                        <>
                                            {section.paragraphs.map((p, i) => (
                                                <Text key={i} style={styles.paragraph}>
                                                    {p}
                                                </Text>
                                            ))}
                                            {section.figures?.map((fig, i) => (
                                                <View key={`fig${i}`} style={styles.figure}>
                                                    <Text style={styles.figureCaption}>
                                                        {i + 1}. {fig.caption}
                                                    </Text>
                                                    <DiagramView spec={fig.diagram} />
                                                </View>
                                            ))}
                                        </>
                                    ) : (
                                        <>
                                            {section.intro ? <Text style={styles.paragraph}>{section.intro}</Text> : null}
                                            <AlignedRows items={section.items} />
                                        </>
                                    )}
                                </View>
                            ))
                        ) : (
                            <Text style={styles.paragraph}>Pick a chord or scale to see what it is.</Text>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const makeStyles = (colors: Palette) =>
    StyleSheet.create({
        backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
        sheet: {
            maxHeight: '85%',
            backgroundColor: colors.sand1,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
        },
        scroll: { flexShrink: 1 },
        header: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: spacing.md,
            paddingHorizontal: spacing.md + 4,
            paddingTop: spacing.md + 4,
            paddingBottom: spacing.sm + 4,
            borderBottomWidth: 1,
            borderBottomColor: `${colors.ink}1A`,
        },
        headerText: { flex: 1, gap: 2 },
        title: { fontFamily: fonts.sans.bold, fontSize: 18, color: colors.ink },
        subtitle: { fontFamily: fonts.sans.regular, fontSize: 12, color: `${colors.ink}99` },
        closeX: { fontSize: 18, color: `${colors.ink}66` },
        body: { padding: spacing.md + 4, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
        section: { gap: spacing.sm },
        sectionTitle: {
            fontFamily: fonts.sans.bold,
            fontSize: 11,
            letterSpacing: 0.9,
            textTransform: 'uppercase',
            color: `${colors.ink}99`,
        },
        paragraph: { fontFamily: fonts.sans.regular, fontSize: 14, lineHeight: 21, color: colors.ink },
        figure: {
            gap: spacing.sm,
            padding: spacing.sm + 4,
            borderRadius: radius.xl,
            backgroundColor: `${colors.ink}0D`,
        },
        figureCaption: { fontFamily: fonts.sans.regular, fontSize: 13, lineHeight: 19, color: `${colors.ink}CC` },
        row: {
            flexDirection: 'row',
            gap: spacing.md,
            paddingVertical: spacing.xs + 2,
            borderBottomWidth: 1,
            borderBottomColor: `${colors.ink}14`,
        },
        rowLabel: { flexShrink: 0, minWidth: 64, fontFamily: fonts.sans.semiBold, fontSize: 14, color: colors.ink },
        rowValue: { flex: 1, fontFamily: fonts.sans.regular, fontSize: 14, color: `${colors.ink}CC` },
    });
