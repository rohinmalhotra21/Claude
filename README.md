# Train With Rohin

A coaching app for personal trainers and their clients, with a Power BI
analytics layer on top.

Clients log their training, food, supplements and daily body metrics on their
phone. The trainer works from a roster view, can log on any client's behalf, and
gets real dashboards instead of a spreadsheet.

```
mobile/     Expo + React Native (TypeScript) app — iOS and Android
server/     Express + Postgres API, plus the vw_* analytics layer
docs/       Power BI connection guide
```

## The four modules

**Workouts** — sessions of sets, each with exercise, weight, reps and RPE.
Advanced techniques are first-class: drop sets, supersets, giant sets,
rest-pause, myo-reps and cluster sets link their sets under a shared group, so a
superset reads as one unit in the app and stays analysable in reporting.

**Diet** — meals numbered through the day, each holding any number of foods with
a portion in grams or millilitres. Macros are stored per 100 g in the food
catalog and scaled to the portion, so any amount is exact. Trainers set daily
calorie and macro targets that take effect from a chosen date.

**Supplementation** — a catalog of supplements with serving sizes, a
trainer-prescribed protocol per client, and a daily log of what was actually
taken. Adherence is prescribed-versus-taken, computed per day.

**Daily log** — one entry per client per day: weight, body fat, sleep, steps,
resting heart rate, water, and mood/energy/soreness ratings. Body dimensions are
stored as rows rather than columns, so a trainer can track any site without a
schema change.

## Running it

Requires Node 20+, and Docker for the database (or your own Postgres 14+).

```bash
./setup.sh      # starts Postgres, migrates, seeds demo data, installs both packages
npm run dev     # API on :4000, Expo bundler alongside it
```

Then press `w` for the browser, or scan the QR code with Expo Go on your phone.

Already have a Postgres you'd rather use? Point at it and run the same script:

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/trainwithrohin
./setup.sh
```

The app infers the API address from the Expo dev host, so it works on a real
phone over the LAN without configuration. To point it elsewhere, set
`EXPO_PUBLIC_API_URL`.

Seed logins are `coach@trainwithrohin.com` (trainer), `alex@trainwithrohin.com` and
`priya@trainwithrohin.com` (clients), all with password `password123`.

Other useful scripts:

| Command | Does |
|---|---|
| `npm run dev:api` · `npm run dev:app` | run either half on its own |
| `npm run db:reset` | drop the volume, re-migrate, re-seed |
| `npm test` | unit tests for the set-grouping logic |
| `npm run typecheck` | typecheck both packages |

## Installing on a phone

Expo Go is the zero-build way to try it. For a real installable app:

```bash
npm install -g eas-cli && eas login
cd mobile && eas build:configure
# set the preview profile's EXPO_PUBLIC_API_URL in mobile/eas.json first
npm run build:apk
```

Expo's cloud builders return a download link for the APK — no Android Studio or
Android SDK needed locally.

An installed app can't reach `localhost`, so the build has to be pointed at an
API it can actually see: your laptop's LAN address for testing, or a deployed
HTTPS URL for real clients. `app.config.js` reads that URL and allows Android
cleartext traffic only when it is plain `http://`, because Android 9+ otherwise
blocks the connection with an unhelpful error.

Full walkthrough, including iOS and store distribution:
[docs/install-on-phone.md](docs/install-on-phone.md).

## Roles

A trainer signs up directly, then generates single-use invite codes from the
roster screen. A client redeems a code at sign-up, which binds them to that
trainer.

Clients can only ever read and write their own rows. Trainers act on a client by
passing that client's id, which is checked against their roster on every
request. Every module screen shows the trainer which client they're logging for.

## Power BI

Reporting reads from a set of `vw_*` views rather than the base tables, so the
physical schema can change without breaking published reports. Every fact view
carries `client_id`, `trainer_id` and a `date_key`.

Three connection paths, covered in [docs/powerbi-setup.md](docs/powerbi-setup.md):

- **DirectQuery** to Postgres via a least-privilege `powerbi_reader` role — the
  default, and near-realtime.
- **Streaming datasets** for tiles that update the moment something is logged.
  Best-effort: the row is committed to Postgres first, so a push failure is
  logged and ignored.
- **JSON feed** at `/api/powerbi/:view` for when the database isn't reachable
  from the Power BI service. Allowlisted views only, API-key authenticated,
  with pagination and date bounds for incremental refresh.

The guide includes the model relationships, the date-table setup, and starter
DAX for volume, estimated 1RM, macro adherence and weight change.

## API

| Route | Purpose |
|---|---|
| `POST /api/auth/register/trainer` · `/register/client` · `/login` | accounts |
| `POST /api/auth/invites` | trainer generates a client invite code |
| `GET /api/clients` | roster with 7-day summary per client |
| `GET/POST /api/exercises` | exercise catalog |
| `GET/POST/PUT/DELETE /api/workouts` | sessions and their sets |
| `GET /api/workouts/exercises/:id/history` | progression on one lift |
| `GET /api/diet/day/:date` | a day's meals with totals against target |
| `POST /api/diet/meals` · `/meals/:id/items` | log food |
| `PUT /api/diet/targets` | trainer sets macro goals |
| `GET/POST /api/supplements/catalog` · `/protocol` · `/log` | supplementation |
| `GET/PUT /api/daily-log` | daily metrics and body measurements |
| `GET /api/analytics/overview` · `/personal-records` | in-app dashboard |
| `GET /api/powerbi/:view` | read-only analytics feed |

## Notes and limitations

- Authentication is JWT with bcrypt-hashed passwords. Tokens are stored in
  `AsyncStorage`, which is adequate for a coaching app but is not hardware-backed;
  move to `expo-secure-store` if the threat model calls for it.
- There is no offline queue. Logging a set requires connectivity; a gym with no
  signal will fail the write rather than sync it later.
- Row-level security is not enabled in Postgres. Authorization is enforced in the
  API, and every fact view carries `trainer_id` so RLS can be layered on if
  multiple trainers ever share one Power BI workspace.
- The seeded food and supplement catalogs are small starter sets, not a
  nutritional database.

## Branding

The identity is black, gold and white, taken from the Train With Rohin logo.

The TR monogram lives in `mobile/src/brand/logo.ts` as vector artwork, so the
app icon, splash screen and in-app logo all come from one definition and stay
sharp at any size. `<BrandLogo>` composes it with the wordmark and tagline as
real text nodes rather than SVG text, because font metrics differ across iOS,
Android and the browser used to generate the launcher assets.

To use the original artwork instead, save it as `mobile/assets/logo.png` — the
logo component prefers that file when it exists, with no code change. Then
regenerate the launcher assets:

```bash
cd mobile
npx playwright@latest install chromium
node scripts/generate-brand-assets.mjs
```

The four module colours (workouts, diet, supplementation, daily log) were
validated against the app's black surface for lightness, chroma, colour-blind
separation and contrast rather than picked by eye. Brand gold sits deliberately
brighter than a strict chart-series band allows: it is the identity colour, and
every chart in the app is single-series, so nothing depends on it being
weight-matched to another hue.
