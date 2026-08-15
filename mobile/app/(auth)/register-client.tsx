import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/lib/auth';
import { Button, ErrorBanner, Field } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/lib/theme';

export default function RegisterClientScreen() {
  const { registerClient } = useAuth();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    inviteCode: '',
    heightCm: '',
    goal: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const height = Number(form.heightCm);
      await registerClient({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        inviteCode: form.inviteCode.trim(),
        heightCm: Number.isFinite(height) && height > 0 ? height : undefined,
        goal: form.goal.trim() || undefined,
      });
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
          <Text style={typography.title}>Join your trainer</Text>
          <Text style={[typography.label, { marginBottom: spacing.xl }]}>
            Enter the invite code your trainer gave you.
          </Text>

          <ErrorBanner message={error} />

          <Field
            label="Invite code"
            value={form.inviteCode}
            onChangeText={(v) => update('inviteCode')(v.toUpperCase())}
            autoCapitalize="characters"
            placeholder="ABCD2345"
          />
          <Field label="Full name" value={form.fullName} onChangeText={update('fullName')} />
          <Field
            label="Email"
            value={form.email}
            onChangeText={update('email')}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={form.password}
            onChangeText={update('password')}
            secureTextEntry
            placeholder="At least 8 characters"
          />
          <Field
            label="Height"
            value={form.heightCm}
            onChangeText={update('heightCm')}
            keyboardType="numeric"
            suffix="cm"
          />
          <Field
            label="Goal (optional)"
            value={form.goal}
            onChangeText={update('goal')}
            placeholder="Fat loss, keep strength"
          />

          <Button title="Create account" onPress={onSubmit} loading={busy} />

          <View style={styles.links}>
            <Link href="/(auth)/login" style={styles.link}>
              Already have an account? Sign in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  links: { marginTop: spacing.xl, alignItems: 'center' },
  link: { color: colors.textMuted, fontSize: 14 },
});
