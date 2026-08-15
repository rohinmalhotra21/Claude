import { env, type PushStream } from '../env.js';

/**
 * Pushes rows into a Power BI streaming dataset.
 *
 * DirectQuery against the vw_* views is the system of record for reporting;
 * this exists purely so dashboard tiles can update the instant a client logs
 * something, without waiting for a query refresh. It is therefore best-effort:
 * a failure here is logged and swallowed, never surfaced to the app, because
 * the row is already committed to Postgres and will appear on the next refresh
 * regardless.
 */
export async function pushToPowerBi(
  stream: PushStream,
  rows: Record<string, unknown>[],
): Promise<void> {
  const url = env.powerBi.pushUrls[stream];
  if (!url || rows.length === 0) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `Power BI push to "${stream}" returned ${response.status}: ${await response.text()}`,
      );
    }
  } catch (err) {
    console.warn(`Power BI push to "${stream}" failed:`, (err as Error).message);
  }
}

/** Fire-and-forget wrapper for use in request handlers. */
export function pushAsync(stream: PushStream, rows: Record<string, unknown>[]): void {
  void pushToPowerBi(stream, rows);
}
