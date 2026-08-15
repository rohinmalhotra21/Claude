# Connecting Power BI

The app writes to Postgres; Power BI reads from the `vw_*` views. Nothing in a
report ever touches a base table, so the physical schema can change without
breaking published dashboards.

There are three ways to connect. Use **DirectQuery** as the default, add
**streaming datasets** only if you want tiles that move while a client is still
in the gym, and fall back to the **JSON feed** when the database isn't reachable
from the Power BI service.

---

## 1. DirectQuery (recommended)

Near-realtime: every visual re-queries Postgres, so a set logged on the phone
shows up as soon as the visual refreshes.

### Create the read-only login

`migrations/003_powerbi_role.sql` creates a `powerbi_reader` role that can read
the analytics views and nothing else — no base tables, no password hashes, no
writes. Set a real password before you deploy:

```sql
ALTER ROLE powerbi_reader WITH PASSWORD 'a-strong-password';
```

### Connect

1. Power BI Desktop → **Get Data** → **PostgreSQL database**
2. Server `your-host:5432`, Database `trainwithrohin`
3. Data Connectivity mode → **DirectQuery**
4. Sign in as `powerbi_reader`
5. Load these views:

| View | Grain | Use it for |
|---|---|---|
| `vw_dim_date` | one row per day | the date table — mark it as such |
| `vw_dim_client` | one row per client | slicers, roster attributes |
| `vw_dim_exercise` | one row per exercise | exercise/muscle-group slicers |
| `vw_fact_workout_sets` | one logged set | volume, est. 1RM, technique analysis |
| `vw_fact_workout_sessions` | one session | session counts, adherence |
| `vw_fact_technique_usage` | client × day × technique | how often drop sets/supersets are used |
| `vw_fact_meal_items` | one food in one meal | food-level breakdowns |
| `vw_fact_nutrition_daily` | client × day | calories and macros vs target |
| `vw_fact_supplement_logs` | one dose taken | what was actually taken |
| `vw_fact_supplement_adherence` | client × day × supplement | prescribed vs taken |
| `vw_fact_daily_log` | client × day | weight, 7-day trend, sleep, steps |
| `vw_fact_body_measurements` | client × day × site | tape measurements over time |
| `vw_client_summary` | one row per client | the trainer's roster page |

### Model it

Relationships — all one-to-many, single direction, from dimension to fact:

```
vw_dim_date[date_key]        →  every fact's [date_key]
vw_dim_client[client_id]     →  every fact's [client_id]
vw_dim_exercise[exercise_id] →  vw_fact_workout_sets[exercise_id]
```

Then **Table tools → Mark as date table** on `vw_dim_date` using `date_key`.
Without this, time-intelligence measures (`SAMEPERIODLASTYEAR`, rolling
averages) silently return wrong results.

### Measures worth adding

```dax
Total Volume (kg) = SUM(vw_fact_workout_sets[volume_kg])

Working Volume (kg) =
CALCULATE([Total Volume (kg)], vw_fact_workout_sets[is_warmup] = FALSE)

Volume vs Prior 4 Weeks =
VAR Current = [Working Volume (kg)]
VAR Prior =
    CALCULATE(
        [Working Volume (kg)],
        DATEADD(vw_dim_date[date_key], -28, DAY)
    )
RETURN DIVIDE(Current - Prior, Prior)

Est 1RM = MAX(vw_fact_workout_sets[est_1rm_kg])

Avg Daily Calories = AVERAGE(vw_fact_nutrition_daily[kcal])

Protein Target Hit Rate =
DIVIDE(
    COUNTROWS(
        FILTER(vw_fact_nutrition_daily, vw_fact_nutrition_daily[protein_pct_of_target] >= 95)
    ),
    COUNTROWS(vw_fact_nutrition_daily)
)

Supplement Adherence = AVERAGE(vw_fact_supplement_adherence[adherence_pct])

Weight Change (kg) =
VAR First = CALCULATE(MIN(vw_fact_daily_log[weight_kg]), FIRSTDATE(vw_dim_date[date_key]))
VAR Last  = CALCULATE(MIN(vw_fact_daily_log[weight_kg]), LASTDATE(vw_dim_date[date_key]))
RETURN Last - First
```

### Suggested report pages

- **Roster** — table from `vw_client_summary`, conditional formatting on
  `workouts_last_7d` and `supp_adherence_last_7d` so quiet clients stand out.
- **Client detail** — client slicer driving four cards: weight trend with the
  7-day average, weekly volume by muscle group, calories vs target, supplement
  adherence.
- **Strength** — `est_1rm_kg` over time per exercise, sliced by muscle group.
- **Technique** — `vw_fact_technique_usage` showing drop sets and supersets per
  week, to check the programme is being followed as written.

### Scheduled refresh

DirectQuery visuals query live, so there's no dataset refresh to schedule. If
you switch any table to Import instead, set up a gateway and a refresh schedule —
and use `RangeStart`/`RangeEnd` parameters against `date_key` for incremental
refresh.

---

## 2. Streaming datasets (live tiles)

Use this when you want a dashboard tile to move the moment a client logs
something, without waiting for a visual to re-query.

1. Power BI service → workspace → **New** → **Streaming dataset** → **API**
2. Create one per stream with these fields:

| Dataset | Fields |
|---|---|
| Workouts | `client_id` (text), `client_name` (text), `date` (text), `total_volume_kg` (number), `total_sets` (number), `logged_at` (datetime) |
| Nutrition | `client_id`, `client_name`, `date` (text), `kcal`, `protein_g`, `carbs_g`, `fat_g` (number), `logged_at` (datetime) |
| Supplements | `client_id`, `supplement_name`, `date` (text), `servings` (number), `logged_at` (datetime) |
| Daily log | `client_id`, `client_name`, `date` (text), `weight_kg`, `weight_kg_7d_avg`, `body_fat_pct` (number), `logged_at` (datetime) |

3. Turn on **Historic data analysis** if you want the rows retained.
4. Copy each push URL into the server's environment:

```bash
POWERBI_PUSH_URL_WORKOUTS=https://api.powerbi.com/beta/...
POWERBI_PUSH_URL_NUTRITION=https://api.powerbi.com/beta/...
POWERBI_PUSH_URL_SUPPLEMENTS=https://api.powerbi.com/beta/...
POWERBI_PUSH_URL_DAILY_LOG=https://api.powerbi.com/beta/...
```

Pushes are best-effort by design: the row is already committed to Postgres
before the push is attempted, so a Power BI outage logs a warning and is
otherwise ignored. Leaving these unset disables pushing entirely.

> Streaming datasets keep limited history and can't be modelled with
> relationships. Treat them as live tiles on top of the DirectQuery report, not
> as a replacement for it.

---

## 3. JSON feed (Web connector)

For deployments where Power BI can't reach Postgres directly — no VNet peering,
no on-premises gateway — but the API is exposed.

Set a shared secret on the server:

```bash
POWERBI_API_KEY=$(openssl rand -base64 32)
```

Then in Power BI Desktop, **Get Data → Blank query** and paste:

```m
let
    BaseUrl = "https://api.yourdomain.com/api/powerbi/",
    ApiKey  = "your-api-key",

    // Pages until the API stops returning a nextOffset.
    GetPage = (view as text, offset as number) =>
        let
            Response = Json.Document(
                Web.Contents(
                    BaseUrl,
                    [
                        RelativePath = view,
                        Query   = [limit = "10000", offset = Text.From(offset)],
                        Headers = [#"x-api-key" = ApiKey]
                    ]
                )
            )
        in
            Response,

    GetAll = (view as text) =>
        let
            Pages = List.Generate(
                () => [Result = GetPage(view, 0), Offset = 0],
                each [Result][value] <> null and List.Count([Result][value]) > 0,
                each [
                    Offset = [Offset] + 10000,
                    Result = GetPage(view, [Offset] + 10000)
                ],
                each [Result][value]
            ),
            Combined = List.Combine(Pages)
        in
            Combined,

    Source = GetAll("nutrition_daily"),
    Table  = Table.FromRecords(Source)
in
    Table
```

`GET /api/powerbi` lists every available view and flags which ones support
incremental refresh. Views with a `date_key` accept `from` and `to` query
parameters — bind Power BI's `RangeStart` / `RangeEnd` parameters to those to
enable an incremental refresh policy.

The feed is read-only, exposes only the allowlisted views, and authenticates
with a constant-time key comparison.

---

## Security notes

- `powerbi_reader` can read the `vw_*` views only. Adding a new view means
  granting it explicitly in `003_powerbi_role.sql` — that migration is the single
  place where Power BI's read surface is declared.
- The JSON feed's allowlist is a fixed map in `server/src/routes/powerbi.ts`; the
  view name from the URL is never interpolated into SQL.
- Row-level security is not configured. If several trainers ever share one
  workspace, add an RLS role on `trainer_id` before publishing, or give each
  trainer their own workspace — every fact view already carries `trainer_id` for
  exactly this purpose.
