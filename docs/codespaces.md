# Running it from a browser (no local install)

GitHub Codespaces gives you a real terminal in the browser, with the repo
already cloned and Node, Docker and Postgres ready. Free tier covers ~60
hours a month.

## 1. Start the Codespace

On the repo page: **Code ▾ → Codespaces → Create codespace on
`claude/new-session-xwrugi`**.

First boot takes ~3 minutes. `setup.sh` runs automatically — Postgres starts,
the schema migrates, demo data seeds, dependencies install.

## 2. Terminal 1 — the API

In the Codespace, open a terminal (**Ctrl+`** or Terminal → New Terminal):

```bash
npm run dev:api
```

## 3. Get the API's public URL

Open the **PORTS** tab next to the terminal. Copy the forwarded address for
port **4000** — it looks like:

```
https://something-4000.app.github.dev
```

Make sure its Visibility says **Public**. If it says Private, right-click the
row → Port Visibility → Public.

## 4. Terminal 2 — the app

Open a second terminal (the **+** icon in the terminal panel), then paste the
URL from step 3:

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://something-4000.app.github.dev npx expo start --web
```

That variable matters. Without it the app guesses the API is on port 4000 of
its own hostname, which is not how Codespaces forwards ports, and every request
fails.

## 5. Open it on your phone

Back in the **PORTS** tab, copy the public URL for port **8081** and open it in
Chrome on Android.

Sign in with `alex@trainwithrohin.com` / `password123`, or
`coach@trainwithrohin.com` for the trainer view.

Add it to your home screen (Chrome ⋮ → Add to Home screen) and it opens
fullscreen like an app.

## Notes

- Ports must be **Public** for the phone to reach them without a GitHub login.
- The Codespace stops after 30 minutes idle; restarting it keeps the database,
  since the Postgres volume persists.
- This is the web build. For a real installable Android app with the TR icon,
  see [install-on-phone.md](install-on-phone.md) — `npm run build:apk` works
  from a Codespace terminal too.
