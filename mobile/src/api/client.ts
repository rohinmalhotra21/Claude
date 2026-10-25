import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * Base URL of the API.
 *
 * `localhost` means the phone itself, so on a real device it has to be the
 * dev machine's LAN address. We read it from the Expo host when no explicit
 * value is configured, which covers the common "run it on my phone" case.
 */
function resolveBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (configured) return configured;

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : 'http://localhost:4000';
}

export const API_BASE_URL = resolveBaseUrl();

/**
 * True when the build fell back to localhost while being served from a real
 * domain — i.e. it was deployed without EXPO_PUBLIC_API_URL set. Worth telling
 * apart from a server that is merely down, because the fix is a rebuild, not
 * starting something.
 */
const isMisconfiguredDeploy =
  API_BASE_URL.includes('localhost') &&
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { location?: { hostname?: string } }).location?.hostname === 'string' &&
  !['localhost', '127.0.0.1', ''].includes(
    (globalThis as { location?: { hostname?: string } }).location!.hostname!,
  );

function unreachableMessage(): string {
  return isMisconfiguredDeploy
    ? 'This build has no API address baked in, so it is pointing at localhost. ' +
        'Set the API_URL variable and redeploy.'
    : `Can't reach the server at ${API_BASE_URL}. Is it running?`;
}

const TOKEN_KEY = 'twr.token';

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Appended as query parameters; undefined and null values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = options;

  const url = new URL(path.startsWith('/') ? path : `/${path}`, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const token = await getToken();

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, unreachableMessage());
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload.error as string) ?? `Request failed (${response.status})`,
      payload.details,
    );
  }

  return payload as T;
}
