import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/lib/auth';
import { Button, ErrorBanner, Field } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/lib/theme';

export default function RegisterTrainerScreen() {
  const { registerTrainer } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await registerTrainer(email.trim(), password, fullName.trim());
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
          <Text style={typography.title}>Trainer account</Text>
          <Text style={[typography.label, { marginBottom: spacing.xl }]}>
            You'll be able to invite clients once you're in.
          </Text>

          <ErrorBanner message={error} />

          <Field label="Full name" value={fullName} onChangeText={setFullName} />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="At least 8 characters"
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
  content: { padding: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  links: { marginTop: spacing.xl, alignItems: 'center' },
  link: { color: colors.textMuted, fontSize: 14 },
});
