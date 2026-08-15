import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(
    'DATABASE_URL',
    isProduction ? undefined : 'postgres://postgres:postgres@localhost:5432/fittrack',
  ),
  // A weak default is fine locally but must never reach production.
  jwtSecret: required('JWT_SECRET', isProduction ? undefined : 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),

  // Optional: Power BI streaming datasets for live tiles. When these are unset
  // the push service quietly no-ops and DirectQuery remains the only path.
  powerBi: {
    pushUrls: {
      workouts: process.env.POWERBI_PUSH_URL_WORKOUTS ?? '',
      nutrition: process.env.POWERBI_PUSH_URL_NUTRITION ?? '',
      supplements: process.env.POWERBI_PUSH_URL_SUPPLEMENTS ?? '',
      dailyLog: process.env.POWERBI_PUSH_URL_DAILY_LOG ?? '',
    },
  },
} as const;

export type PushStream = keyof typeof env.powerBi.pushUrls;
