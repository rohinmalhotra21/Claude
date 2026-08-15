import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/lib/auth';
import { Button, ErrorBanner, Field } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/lib/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>FitTrack</Text>
            <Text style={typography.label}>Coaching, tracked properly.</Text>
          </View>

          <ErrorBanner message={error} />

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            placeholder="••••••••"
            onSubmitEditing={onSubmit}
          />

          <Button title="Sign in" onPress={onSubmit} loading={busy} style={{ marginTop: spacing.sm }} />

          <View style={styles.links}>
            <Link href="/(auth)/register-client" style={styles.link}>
              I have an invite code
            </Link>
            <Link href="/(auth)/register-trainer" style={styles.link}>
              Sign up as a trainer
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: spacing.xxl, gap: spacing.xs },
  logo: { fontSize: 40, fontWeight: '800', color: colors.accent, letterSpacing: -1 },
  links: { marginTop: spacing.xl, gap: spacing.md, alignItems: 'center' },
  link: { color: colors.textMuted, fontSize: 14 },
});
