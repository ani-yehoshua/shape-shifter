// Ports of the website's Delete Account confirmation (components/Header.tsx)
// and Support form (components/SubmitFeedback.tsx), as centered dialogs in a
// transparent Modal. Rendered from the Settings drawer.
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { deleteAccount, emailRegex, submitFeedback } from '../lib/account';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useThemedStyles } from '../lib/theme-context';

type Notice = { msg: string; ok: boolean } | null;

function DialogShell({
    visible,
    onClose,
    children,
}: {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const styles = useThemedStyles(makeStyles);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.card}>{children}</View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function NoticeText({ notice }: { notice: Notice }) {
    const styles = useThemedStyles(makeStyles);
    if (!notice) return null;
    return (
        <Text style={[styles.notice, notice.ok ? styles.noticeOk : styles.noticeErr]}>{notice.msg}</Text>
    );
}

export function DeleteAccountDialog({
    visible,
    onClose,
    onDeleted,
}: {
    visible: boolean;
    onClose: () => void;
    /** called after the account is deleted, to sign out and close the drawer */
    onDeleted: () => Promise<void> | void;
}) {
    const styles = useThemedStyles(makeStyles);
    const [confirmText, setConfirmText] = useState('');
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);

    const close = () => {
        setConfirmText('');
        setNotice(null);
        onClose();
    };

    const handleDelete = async () => {
        setLoading(true);
        try {
            await deleteAccount();
            setNotice({ msg: 'Account deleted.', ok: true });
            await new Promise((r) => setTimeout(r, 1500));
            setConfirmText('');
            setNotice(null);
            await onDeleted();
        } catch {
            setNotice({ msg: 'Could not delete account. Try again.', ok: false });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DialogShell visible={visible} onClose={close}>
            <View style={[styles.cardHeader, { borderBottomColor: '#dc262650' }]}>
                <Text style={styles.cardTitle}>Delete Account</Text>
                <Text style={styles.cardSubtitle}>This cannot be undone.</Text>
            </View>
            <View style={styles.cardBody}>
                <NoticeText notice={notice} />
                <Text style={styles.confirmLabel}>
                    Type <Text style={styles.confirmWord}>DELETE</Text> to confirm
                </Text>
                <TextInput
                    value={confirmText}
                    onChangeText={setConfirmText}
                    placeholder="DELETE"
                    placeholderTextColor={styles.placeholder.color}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={[styles.input, styles.confirmInput]}
                />
            </View>
            <View style={styles.cardFooter}>
                <TouchableOpacity style={[styles.footerButton, styles.cancelFill]} onPress={close}>
                    <Text style={styles.cancelFillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.footerButton,
                        styles.dangerFill,
                        (loading || confirmText !== 'DELETE') && styles.disabled,
                    ]}
                    disabled={loading || confirmText !== 'DELETE'}
                    onPress={handleDelete}>
                    <Text style={styles.dangerFillText}>{loading ? 'Deleting…' : 'Delete'}</Text>
                </TouchableOpacity>
            </View>
        </DialogShell>
    );
}

export function SupportDialog({
    visible,
    onClose,
    initialEmail,
}: {
    visible: boolean;
    onClose: () => void;
    initialEmail: string;
}) {
    const styles = useThemedStyles(makeStyles);
    const [email, setEmail] = useState(initialEmail);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);

    const close = () => {
        setNotice(null);
        onClose();
    };

    const handleSubmit = async () => {
        if (!email || !emailRegex.test(email.trim())) {
            setNotice({ msg: 'Please enter a valid email address.', ok: false });
            return;
        }
        if (!message.trim()) {
            setNotice({ msg: 'Please provide a description.', ok: false });
            return;
        }
        setLoading(true);
        setNotice(null);
        try {
            const ok = await submitFeedback(email.trim(), message);
            if (ok) {
                setNotice({ msg: 'Feedback submitted! Check your spam folder for confirmation.', ok: true });
                setMessage('');
                await new Promise((r) => setTimeout(r, 2500));
                close();
            } else {
                setNotice({ msg: 'Something went wrong. Please try again.', ok: false });
            }
        } catch {
            setNotice({ msg: 'An error occurred. Please try again.', ok: false });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DialogShell visible={visible} onClose={close}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Support</Text>
            </View>
            <View style={styles.cardBody}>
                <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Your email</Text>
                    <TextInput
                        value={email}
                        onChangeText={(v) => {
                            setEmail(v);
                            setNotice(null);
                        }}
                        placeholder="you@example.com"
                        placeholderTextColor={styles.placeholder.color}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.input}
                    />
                </View>
                <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Description</Text>
                    <TextInput
                        value={message}
                        onChangeText={(v) => {
                            setMessage(v);
                            setNotice(null);
                        }}
                        placeholder="Describe the issue or feedback…"
                        placeholderTextColor={styles.placeholder.color}
                        multiline
                        numberOfLines={5}
                        textAlignVertical="top"
                        style={[styles.input, styles.textarea]}
                    />
                </View>
                <NoticeText notice={notice} />
            </View>
            <View style={styles.cardFooter}>
                <TouchableOpacity style={[styles.footerButton, styles.cancelOutline]} onPress={close}>
                    <Text style={styles.cancelOutlineText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.footerButton, styles.submitFill, loading && styles.disabled]}
                    disabled={loading}
                    onPress={handleSubmit}>
                    {loading ? (
                        <ActivityIndicator size="small" color={styles.submitFillText.color} />
                    ) : (
                        <Text style={styles.submitFillText}>Submit</Text>
                    )}
                </TouchableOpacity>
            </View>
        </DialogShell>
    );
}

const makeStyles = (colors: Palette) =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.md,
            backgroundColor: 'rgba(0,0,0,0.6)',
        },
        card: {
            width: '100%',
            maxWidth: 400,
            borderRadius: radius['2xl'],
            backgroundColor: colors.sand4,
            overflow: 'hidden',
        },
        cardHeader: {
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md + 2,
            borderBottomWidth: 1,
            borderBottomColor: `${colors.ink}4D`,
            alignItems: 'center',
        },
        cardTitle: { fontFamily: fonts.sans.bold, fontSize: 18, color: colors.sand1 },
        cardSubtitle: { fontFamily: fonts.sans.regular, fontSize: 14, color: `${colors.sand1}B3`, marginTop: 4 },
        cardBody: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
        cardFooter: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: spacing.sm + 4,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.md + 4,
        },
        field: { gap: 4 },
        fieldLabel: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: `${colors.sand1}CC` },
        input: {
            fontFamily: fonts.sans.regular,
            fontSize: 14,
            color: colors.sand1,
            backgroundColor: `${colors.sand1}1A`,
            borderWidth: 1,
            borderColor: `${colors.sand1}4D`,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.sm + 4,
            paddingVertical: spacing.sm,
        },
        textarea: { minHeight: 110 },
        placeholder: { color: `${colors.sand1}66` },
        confirmLabel: { fontFamily: fonts.sans.regular, fontSize: 12, color: `${colors.sand1}99`, textAlign: 'center' },
        confirmWord: { fontFamily: fonts.sans.bold, letterSpacing: 2, color: `${colors.sand1}CC` },
        confirmInput: { textAlign: 'center', fontFamily: fonts.sans.bold, letterSpacing: 2 },
        notice: {
            fontFamily: fonts.sans.semiBold,
            fontSize: 13,
            borderRadius: radius.lg,
            borderWidth: 1,
            paddingHorizontal: spacing.sm + 4,
            paddingVertical: spacing.sm,
            overflow: 'hidden',
        },
        noticeOk: { color: '#bbf7d0', backgroundColor: '#14532d99', borderColor: '#16653499' },
        noticeErr: { color: '#fecaca', backgroundColor: '#7f1d1d99', borderColor: '#991b1b99' },
        footerButton: {
            paddingHorizontal: spacing.lg - 4,
            paddingVertical: spacing.sm + 2,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
        },
        cancelFill: { flex: 1, backgroundColor: colors.sand2 },
        cancelFillText: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: colors.ink },
        dangerFill: { flex: 1, backgroundColor: '#dc2626' },
        dangerFillText: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: '#ffffff' },
        cancelOutline: { borderWidth: 1, borderColor: '#ef4444' },
        cancelOutlineText: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: '#ef4444' },
        submitFill: { backgroundColor: colors.sand1, minWidth: 88 },
        submitFillText: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: colors.sand4 },
        disabled: { opacity: 0.5 },
    });
