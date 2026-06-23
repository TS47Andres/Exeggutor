// Cross-platform credential storage for the Exeggutor Mobile app.
// Uses AsyncStorage (works in Expo Go). For production builds, this can be
// swapped for expo-secure-store without changing the public API.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  HOST: 'exeggutor_host', // Stored Tailscale IP or hostname for the backend server.
  PORT: 'exeggutor_port', // Stored backend port number as a string.
  TOKEN: 'exeggutor_token', // Persistent auth token for API and WebSocket requests.
  HOSTNAME: 'exeggutor_hostname', // Human-readable display name for the connected machine.
} as const;

// Saves a key-value pair to persistent storage.
async function set(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

// Retrieves a value from persistent storage, or null if the key is absent.
async function get(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

// Removes a single key from persistent storage.
async function remove(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

// Persists all connection credentials at once.
export async function saveConnection(host: string, port: string, token: string, hostname: string): Promise<void> {
  await set(KEYS.HOST, host);
  await set(KEYS.PORT, port);
  await set(KEYS.TOKEN, token);
  await set(KEYS.HOSTNAME, hostname);
}

// Loads all stored connection credentials, returning nulls for missing values.
export async function loadConnection(): Promise<{ host: string | null; port: string | null; token: string | null; hostname: string | null }> {
  const host = await get(KEYS.HOST);
  const port = await get(KEYS.PORT);
  const token = await get(KEYS.TOKEN);
  const hostname = await get(KEYS.HOSTNAME);
  return { host, port, token, hostname };
}

// Removes all stored connection credentials from persistent storage.
export async function clearConnection(): Promise<void> {
  await remove(KEYS.HOST);
  await remove(KEYS.PORT);
  await remove(KEYS.TOKEN);
  await remove(KEYS.HOSTNAME);
}

// Returns true if stored connection credentials exist.
export async function hasConnection(): Promise<boolean> {
  const token = await get(KEYS.TOKEN);
  return token !== null;
}
