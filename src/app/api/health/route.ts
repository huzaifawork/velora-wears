import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Setup smoke check: reports whether the server has the Firebase configuration
 * it needs. Deliberately does not touch the database yet.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "velora-wears",
    firebase: {
      databaseUrlConfigured: Boolean(process.env.FIREBASE_DATABASE_URL),
      serviceAccountConfigured: Boolean(
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH ??
          process.env.GOOGLE_APPLICATION_CREDENTIALS,
      ),
    },
  });
}
