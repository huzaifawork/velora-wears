import "server-only";

import { readFileSync } from "node:fs";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { Database, getDatabase } from "firebase-admin/database";

import { serverEnv } from "@/lib/env";

/**
 * Firebase Admin SDK singleton.
 *
 * Credentials are loaded from a service account JSON file that lives on disk
 * and is never committed. Point at it with FIREBASE_SERVICE_ACCOUNT_PATH (or
 * the standard GOOGLE_APPLICATION_CREDENTIALS).
 */

const APP_NAME = "velora-wears-admin";

function loadCredential() {
  const path = serverEnv.serviceAccountPath;
  if (!path) {
    throw new Error(
      "No service account configured. Set FIREBASE_SERVICE_ACCOUNT_PATH " +
        "(or GOOGLE_APPLICATION_CREDENTIALS) to the local service account JSON file.",
    );
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not read service account JSON at: ${path}`);
  }

  return cert(JSON.parse(raw));
}

export function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  return initializeApp(
    {
      credential: loadCredential(),
      databaseURL: serverEnv.firebaseDatabaseUrl,
      projectId: serverEnv.projectId,
    },
    APP_NAME,
  );
}

export function getDb(): Database {
  return getDatabase(getAdminApp());
}
