/**
 * Expo config.
 *
 * This is a .js config rather than app.json so the Android networking policy can
 * follow the API URL the build is pointed at.
 */

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

/**
 * Android 9 and newer block plaintext HTTP by default. A release APK aimed at a
 * laptop on the LAN (http://192.168.x.x:4000) therefore fails with an opaque
 * network error unless cleartext is explicitly allowed.
 *
 * So allow it only when the build is actually pointed at an http:// address.
 * A build aimed at https:// keeps the secure default, and a build with no URL
 * set is a dev build talking to Metro, which also needs it.
 */
const needsCleartext = !apiUrl || apiUrl.startsWith('http://');

module.exports = {
  expo: {
    name: 'Train With Rohin',
    slug: 'train-with-rohin',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'trainwithrohin',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    icon: './assets/icon.png',
    backgroundColor: '#000000',
    primaryColor: '#D9A93C',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'cover',
      backgroundColor: '#000000',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'app.trainwithrohin.client',
      infoPlist: needsCleartext
        ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } }
        : undefined,
    },
    android: {
      package: 'app.trainwithrohin.client',
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#000000',
      },
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-build-properties',
        {
          android: { usesCleartextTraffic: needsCleartext },
        },
      ],
    ],
    extra: {
      apiUrl: apiUrl || undefined,
      eas: {
        // Filled in by `eas build:configure` on first run; it links this app to
        // your Expo account's project.
        projectId: process.env.EAS_PROJECT_ID ?? undefined,
      },
    },
  },
};
