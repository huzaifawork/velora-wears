import { initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";

/**
 * Firebase CLIENT SDK.
 *
 * These VITE_ values are compiled into the browser bundle and are PUBLIC by
 * design — that is how Firebase web config works. They are not secrets.
 * Security comes from database.rules.json, not from hiding this config.
 *
 * The Admin SDK and its service account key must NEVER appear in this app.
 * Privileged work (placing orders, writing reviews) goes through Cloud Functions.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let db: Database | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    if (!config.databaseURL) {
      throw new Error(
        "Firebase config missing. Copy .env.example to .env.local in storefront/ and fill it in.",
      );
    }
    app = initializeApp(config);
  }
  return app;
}

export function getDb(): Database {
  if (!db) db = getDatabase(getFirebaseApp());
  return db;
}
