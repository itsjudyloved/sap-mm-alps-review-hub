# sap-mm-alps-review-hub

Open admin reviewer app for SAP MM ALPS.

## Shared database

The app now supports a shared hosted Postgres database through `DATABASE_URL` or `POSTGRES_URL`.

- Set the same database URL in Vercel Project Settings > Environment Variables.
- Set the same value locally in `server/.env` or root `.env` when you want local and deployed data to sync.
- Without `DATABASE_URL`, the app falls back to local SQLite, which is only for local development and will not sync with Vercel.
