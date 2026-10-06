import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/theme-context';

type Step = 'email' | 'code';
type Status = 'idle' | 'sending' | 'error';

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function SignIn() {
    const { colors } = useTheme();
    const styles = useThemedStyles(makeStyles);
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
    const [status, setStatus] = useState<Status>('idle');
    const [message, setMessage] = useState('');
    const inputRefs = useRef<Array<TextInput | null>>([]);

    async function sendCode() {
        if (!isValidEmail(email)) {
            setStatus('error');
            setMessage('Please enter a valid email address.');
            return;
        }
        setStatus('sending');
        setMessage('');
        // shouldCreateUser: true, same as the website -- passwordless
        // sign-in and sign-up are the same call. No emailRedirectTo here:
        // a confirmation link would open in the system browser, not this
        // app, without Universal Links/App Links set up, so the 6-digit
        // code is the only path in. (The project's Supabase email template
        // sends the code alone, no link -- see the website's signin page.)
        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { shouldCreateUser: true },
        });
        if (error) {
            setStatus('error');
            setMessage(error.message);
            return;
        }
        setStatus('idle');
        setStep('code');
        setDigits(Array(6).fill(''));
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }

    async function verifyCode(fullCode: string) {
        if (fullCode.length !== 6) return;
        setStatus('sending');
        setMessage('');
        const { error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: fullCode,
            type: 'email',
        });
        if (error) {
            setStatus('error');
            setMessage('Code is invalid or expired — request a new one.');
            setDigits(Array(6).fill(''));
            inputRefs.current[0]?.focus();
            return;
        }
        // The root layout's AuthGate picks up the new session from here.
    }

    async function resendCode() {
        setStatus('sending');
        setMessage('');
        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { shouldCreateUser: true },
        });
        if (error) {
            setStatus('error');
            setMessage(error.message);
        } else {
            setStatus('idle');
            setMessage('New code sent — check your inbox.');
            setDigits(Array(6).fill(''));
            inputRefs.current[0]?.focus();
        }
    }

    function handleDigitChange(i: number, value: string) {
        const v = value.replace(/\D/g, '');
        if (!v) {
            const next = [...digits];
            next[i] = '';
            setDigits(next);
            return;
        }
        // Paste-to-fill: if more than one digit landed in one box, spread it.
        if (v.length > 1) {
            const next = [...digits];
            for (let j = 0; j < v.length && i + j < 6; j++) next[i + j] = v[j];
            setDigits(next);
            const lastIdx = Math.min(i + v.length, 5);
            inputRefs.current[lastIdx]?.focus();
            if (next.every((d) => d)) verifyCode(next.join(''));
            return;
        }
        const next = [...digits];
        next[i] = v;
        setDigits(next);
        if (i < 5) inputRefs.current[i + 1]?.focus();
        if (next.every((d) => d)) verifyCode(next.join(''));
    }

    function handleKeyPress(i: number, key: string) {
        if (key === 'Backspace' && !digits[i] && i > 0) {
            inputRefs.current[i - 1]?.focus();
        }
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.container}>
                    <View style={styles.card}>
                        <View style={styles.header}>
                            <Text style={styles.title}>
                                {step === 'email' ? 'Sign in' : 'Check your email'}
                            </Text>
                            <Text style={styles.subtitle}>
                                {step === 'email'
                                    ? "Enter your email and we'll send you a sign-in code. No password needed."
                                    : `We sent a 6-digit code to ${email}. It expires in 15 minutes.`}
                            </Text>
                        </View>

                        {step === 'email' ? (
                            <>
                                <TextInput
                                    style={styles.emailInput}
                                    placeholder="you@example.com"
                                    placeholderTextColor={`${colors.onSurface}66`}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="email-address"
                                    autoComplete="email"
                                    value={email}
                                    onChangeText={(v) => {
                                        setEmail(v);
                                        setMessage('');
                                        setStatus('idle');
                                    }}
                                    editable={status !== 'sending'}
                                />
                                <TouchableOpacity
                                    style={[
                                        styles.button,
                                        (status === 'sending' || !isValidEmail(email)) &&
                                            styles.buttonDisabled,
                                    ]}
                                    onPress={sendCode}
                                    disabled={status === 'sending' || !isValidEmail(email)}
                                >
                                    {status === 'sending' ? (
                                        <ActivityIndicator color={colors.surface} />
                                    ) : (
                                        <Text style={styles.buttonText}>Send code</Text>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.codeLabel}>6-digit code</Text>
                                <View style={styles.codeRow}>
                                    {digits.map((d, i) => (
                                        <TextInput
                                            key={i}
                                            ref={(el) => {
                                                inputRefs.current[i] = el;
                                            }}
                                            style={styles.codeBox}
                                            value={d}
                                            onChangeText={(v) => handleDigitChange(i, v)}
                                            onKeyPress={({ nativeEvent }) =>
                                                handleKeyPress(i, nativeEvent.key)
                                            }
                                            keyboardType="number-pad"
                                            autoComplete={i === 0 ? 'one-time-code' : 'off'}
                                            textContentType="oneTimeCode"
                                            maxLength={6}
                                            editable={status !== 'sending'}
                                        />
                                    ))}
                                </View>

                                {status === 'sending' && (
                                    <View style={styles.verifyingRow}>
                                        <ActivityIndicator color={colors.onSurface} />
                                        <Text style={styles.verifyingText}>Verifying…</Text>
                                    </View>
                                )}

                                <View style={styles.linkRow}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setStep('email');
                                            setDigits(Array(6).fill(''));
                                            setStatus('idle');
                                            setMessage('');
                                        }}
                                    >
                                        <Text style={styles.link}>Wrong email?</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={resendCode}
                                        disabled={status === 'sending'}
                                    >
                                        <Text style={styles.link}>Resend code</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}

                        {message ? (
                            <View
                                style={[
                                    styles.alert,
                                    status === 'error' ? styles.alertError : styles.alertNeutral,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.alertText,
                                        status === 'error' && styles.alertErrorText,
                                    ]}
                                >
                                    {message}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    flex: {
        flex: 1,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
    },
    card: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: colors.surface,
        borderRadius: radius['2xl'],
        padding: spacing.lg,
        gap: spacing.md,
    },
    header: {
        alignItems: 'center',
        gap: spacing.xs,
    },
    title: {
        fontFamily: fonts.sans.bold,
        fontSize: 22,
        color: colors.onSurface,
    },
    subtitle: {
        fontFamily: fonts.sans.regular,
        fontSize: 13,
        color: `${colors.onSurface}99`,
        textAlign: 'center',
        lineHeight: 18,
    },
    emailInput: {
        width: '100%',
        borderWidth: 1,
        borderColor: `${colors.onSurface}4D`,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm + 4,
        paddingHorizontal: spacing.md,
        fontFamily: fonts.sans.regular,
        fontSize: 15,
        color: colors.onSurface,
    },
    button: {
        alignSelf: 'center',
        backgroundColor: colors.onSurface,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm + 2,
        paddingHorizontal: spacing.xl,
        minWidth: 140,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        fontFamily: fonts.sans.bold,
        color: colors.surface,
        fontSize: 14,
    },
    codeLabel: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: `${colors.onSurface}CC`,
        textAlign: 'center',
    },
    codeRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.xs + 2,
    },
    codeBox: {
        width: 42,
        height: 48,
        textAlign: 'center',
        fontFamily: fonts.sans.regular,
        fontSize: 22,
        color: colors.onSurface,
        borderBottomWidth: 2,
        borderBottomColor: `${colors.onSurface}66`,
    },
    verifyingRow: {
        flexDirection: 'row',
        alignSelf: 'center',
        alignItems: 'center',
        gap: spacing.xs + 2,
    },
    verifyingText: {
        fontFamily: fonts.sans.regular,
        fontSize: 13,
        color: `${colors.onSurface}B3`,
    },
    linkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    link: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: `${colors.onSurface}B3`,
        textDecorationLine: 'underline',
    },
    alert: {
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm + 4,
        borderWidth: 1,
    },
    alertNeutral: {
        backgroundColor: colors.sand3,
        borderColor: `${colors.onSurface}33`,
    },
    alertError: {
        backgroundColor: '#fee2e2',
        borderColor: '#fca5a5',
    },
    alertText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: colors.onSurface,
    },
    alertErrorText: {
        color: '#b91c1c',
    },
});
