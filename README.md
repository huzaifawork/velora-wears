# Velora Wears

E-commerce / clothing brand app for **Velora Wears**, backed by **Firebase Realtime Database**.

> **Status: project scaffold only.** No product features are implemented yet.
> Feature work begins once `requirements.md` is added to the repo root.

## Stack

| Layer     | Choice                                          |
| --------- | ----------------------------------------------- |
| Framework | Next.js (App Router) + TypeScript               |
| Styling   | Tailwind CSS                                    |
| Data      | Firebase **Realtime Database**                  |
| Server    | Firebase **Admin SDK** (server-side only)       |
| Package manager | npm                                       |

## Firebase & credentials

This project talks to the Realtime Database through the Firebase **Admin SDK**, which runs
**server-side only** (route handlers, server actions, server components). The Admin SDK is
listed in `serverExternalPackages` and every module that touches it imports `server-only`,
so it can never be pulled into a client bundle.

### Service account key

The Admin SDK needs a service account JSON key.

- **Place the key file locally yourself.** It is not part of this repository.
- **The path is configurable via environment variable** — the file location is your choice.
- **It is never committed.** `.gitignore` blocks `*serviceAccountKey.json`,
  `*firebase-adminsdk*.json`, `*service-account*.json`, and the `secrets/` and
  `credentials/` directories.

Recommended layout:

```
secrets/velora-wears-firebase-adminsdk.json   # gitignored
```

Then point at it in `.env.local`:

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/velora-wears-firebase-adminsdk.json
```

`GOOGLE_APPLICATION_CREDENTIALS` is honoured as a fallback if you prefer the Google-standard
variable. If the key is ever exposed, revoke it in
**Firebase Console → Project settings → Service accounts** and issue a new one.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local     # then fill in real values

# 3. Drop your service account JSON at the path set in .env.local

# 4. Link the Firebase project (once, with the Firebase CLI)
firebase login
firebase use --add             # select the "Velora Wears" project

# 5. Run
npm run dev                    # http://localhost:3000
```

Sanity check that the server sees its configuration:

```bash
curl http://localhost:3000/api/health
```

## Environment variables

See [`.env.example`](.env.example) for the full template. Real values live in `.env.local`,
which is gitignored.

| Variable | Purpose |
| -------- | ------- |
| `FIREBASE_DATABASE_URL` | Realtime Database instance URL |
| `FIREBASE_PROJECT_ID` | Firebase project ID (optional; inferred from the key) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Local path to the Admin SDK service account JSON |
| `GOOGLE_APPLICATION_CREDENTIALS` | Fallback path for the same key |
| `FIREBASE_DATABASE_EMULATOR_HOST` | Point at the local emulator instead of live data |

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run emulators` | Realtime Database emulator on port 9000 |
| `npm run deploy:rules` | Deploy `database.rules.json` |

## Project structure

```
src/
├── app/
│   ├── api/health/route.ts   # setup smoke check
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/               # UI components (empty)
└── lib/
    ├── env.ts                # server-side env access
    └── firebase/
        ├── admin.ts          # Admin SDK singleton
        └── db.ts             # Realtime Database helpers
database.rules.json           # RTDB security rules (deny-all by default)
firebase.json                 # Firebase CLI config (rules + emulator)
```

### Database rules

`database.rules.json` ships **deny-all** (`.read: false`, `.write: false`). The Admin SDK
bypasses rules, so server-side access keeps working; direct client access stays closed until
rules are written deliberately alongside real features.

## Next step

Add `requirements.md` to the repo root. Feature development starts after that, on your
confirmation.
