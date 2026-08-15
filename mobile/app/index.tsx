import { Redirect } from 'expo-router';

/** The guard in the root layout does the real work; this just picks a start. */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
