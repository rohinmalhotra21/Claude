# FitTrack

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
export DATABASE_URL=postgres://user:pass@localhost:5432/fittrack
./setup.sh
```

The app infers the API address from the Expo dev host, so it works on a real
phone over the LAN without configuration. To point it elsewhere, set
`EXPO_PUBLIC_API_URL`.

Seed logins are `coach@fittrack.app` (trainer), `alex@fittrack.app` and
`priya@fittrack.app` (clients), all with password `password123`.

Other useful scripts:

| Command | Does |
|---|---|
| `npm run dev:api` · `npm run dev:app` | run either half on its own |
| `npm run db:reset` | drop the volume, re-migrate, re-seed |
| `npm test` | unit tests for the set-grouping logic |
| `npm run typecheck` | typecheck both packages |

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
