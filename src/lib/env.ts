/**
 * Server-side environment access.
 *
 * Nothing here is safe to import from a Client Component — these values are
 * read from the server process environment only.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

export const serverEnv = {
  /** Full RTDB instance URL, e.g. https://velora-wears-default-rtdb.firebaseio.com */
  get firebaseDatabaseUrl(): string {
    return required("FIREBASE_DATABASE_URL");
  },

  /** Optional explicit override for the service account JSON location. */
  get serviceAccountPath(): string | undefined {
    return (
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
      process.env.GOOGLE_APPLICATION_CREDENTIALS ??
      undefined
    );
  },

  get projectId(): string | undefined {
    return process.env.FIREBASE_PROJECT_ID ?? undefined;
  },
};
