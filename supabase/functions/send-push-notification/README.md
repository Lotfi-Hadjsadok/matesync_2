# send-push-notification

Invoked from the **MateSync app** with the signed-in user’s JWT (`supabase.functions.invoke`). The function checks that the caller is allowed for each `action`, then sends Expo pushes via the service role.

## Deploy

```bash
supabase functions deploy send-push-notification
```

## Env (Supabase-hosted defaults)

- `SUPABASE_URL`
- `SB_PUBLISHABLE_KEY` — `createClient` + `auth.getClaims(token)` on the incoming `Authorization` JWT
- `SUPABASE_SERVICE_ROLE_KEY` — read tasks/boards/rewards/tokens

Set `SB_PUBLISHABLE_KEY` in the function’s secrets to the same value as the project publishable/anon API key you use in the app.

Keep **Enforce JWT verification** **ON** for this function so only requests with a valid session reach the code (matches `verify_jwt = true` in `supabase/config.toml`).

## Body shape

```json
{ "action": "task_assigned", "taskId": "uuid" }
```

Supported `action` values: `task_assigned`, `task_completed`, `board_created`, `reward_created`, `reward_pending`, `reward_approved`, `reward_rejected` (each with the matching id field).
