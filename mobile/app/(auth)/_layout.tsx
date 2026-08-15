import { Stack } from 'expo-router';
import { colors } from '../../src/lib/theme';

/**
 * The auth screens carry their own titles, so the group hides the stack header.
 * Declaring this layout is also what makes `(auth)` addressable as a group by
 * the root navigator.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
