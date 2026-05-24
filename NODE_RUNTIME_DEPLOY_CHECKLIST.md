# Node Runtime Deploy Checklist

## Target runtime
- Node 22 LTS (`v22.x`).

## Local
- `nvm install 22`
- `nvm use 22`
- `node -v` -> `v22.x`
- `npm install`

## Deploy platform
- Set runtime to Node 22 in platform settings.
- Keep `package.json` `engines.node` in sync with platform value.
- Redeploy application after runtime switch.

## Smoke checks after deploy
- No log entries:
  - `supabase_client_init_error`
  - `reason: "client_unavailable"`
- Positive Supabase flow logs:
  - `upsert_created_*`
  - `mark_paid_*`
  - `token_match_*`
