# Getting the app onto a phone

Three routes, cheapest first. Pick by what you're trying to do.

| Route | Build needed | Good for |
|---|---|---|
| **Expo Go** | none | trying it yourself in the next 10 minutes |
| **EAS Build → APK** | cloud, ~15 min | a real installable app, sideloaded to your phone or a client's |
| **Play Store / App Store** | cloud + store review | actual distribution to paying clients |

---

## The one thing that breaks every route

The app is a *client*. It needs the API and database running somewhere it can
reach. `localhost` on a phone means the phone itself, so an installed app
pointed at `localhost:4000` will never connect.

You have two options:

**A. API on your laptop (fine for testing, free)**
Phone and laptop on the same Wi-Fi. Find your laptop's LAN address:

```bash
# macOS
ipconfig getifaddr en0
# Linux
hostname -I | awk '{print $1}'
# Windows
ipconfig | findstr IPv4
```

That gives something like `192.168.1.10`. The API must listen on all
interfaces, which it already does, and your firewall must allow port 4000.

**B. API deployed (needed for real clients)**
Anything that runs Node and Postgres — Railway, Render, Fly.io, a VPS. Set
`DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGINS`, run `npm run migrate`, and
point the app at the resulting HTTPS URL. Clients can't depend on your laptop
being awake.

---

## Route 1 — Expo Go (no build)

Nothing to install but the Expo Go app. This is how to see it working today.

```bash
./setup.sh
npm run dev
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS). Phone and
laptop must be on the same Wi-Fi; the app works out the API address from the
Expo dev host automatically.

Limitations: it runs inside Expo Go, so it uses Expo Go's icon rather than the
TR monogram, and it stops working when you stop the dev server. It is not
something to hand to a client.

---

## Route 2 — EAS Build, producing an APK

Expo's cloud builders compile the app and give you a download link. **No Android
Studio and no Android SDK needed on your machine.** The free tier covers
occasional builds; it queues behind paid users at busy times.

### One-time setup

```bash
npm install -g eas-cli
eas login                 # create a free account at expo.dev if you don't have one

cd mobile
eas build:configure       # links this app to your Expo account, writes the project id
```

### Point the build at your API

Open `mobile/eas.json` and set the `preview` profile's URL to your laptop's LAN
address from above (or your deployed HTTPS URL):

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" },
  "env": { "EXPO_PUBLIC_API_URL": "http://192.168.1.10:4000" }
}
```

This value is compiled into the APK. Changing it later means rebuilding.

> The config reads that URL and, when it is plain `http://`, allows cleartext
> traffic on Android. Without that, Android 9+ silently blocks the connection
> and every request fails with an unhelpful network error. An `https://` URL
> keeps the secure default.

### Build it

```bash
cd mobile
eas build --platform android --profile preview
```

Roughly 10–20 minutes. It prints a URL, and the build also appears at
[expo.dev](https://expo.dev) under your account. Download the `.apk` from
there — on the phone, open that link directly and tap the download.

### Install it

Android will warn about installing outside the Play Store. Allow your browser
or file manager to install unknown apps when prompted, then open the downloaded
APK and tap Install.

The TR monogram will be the launcher icon and the splash screen.

> **iPhone has no APK equivalent.** Sideloading requires either TestFlight (a
> paid Apple Developer account, $99/yr) or a development build registered to
> that specific device via `eas device:create`. For iOS clients, TestFlight is
> the realistic route.

---

## Route 3 — Store distribution

When you're ready to hand this to paying clients properly:

```bash
eas build --platform android --profile production   # .aab for Play Store
eas submit --platform android
```

You'll need a Google Play developer account (one-off $25) and a deployed API on
HTTPS. The `production` profile already targets `app-bundle`, which is what the
Play Store requires, and keeps cleartext disabled.

---

## Building locally instead

If you'd rather not use Expo's cloud, install Android Studio (which brings the
Android SDK), then:

```bash
cd mobile
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
# APK lands in android/app/build/outputs/apk/release/
```

This needs roughly 10 GB of SDK and toolchain, and a signing key for anything
you intend to distribute. EAS is less work unless you specifically want an
offline build.
