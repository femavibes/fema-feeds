# @cfb/ingest-jetstream

Jetstream WebSocket consumer. Emits `NormalizedPost` to a callback.

Depends on `@skyware/jetstream` (optional until live connect). Pattern borrowed from ATlas `subscription.ts`.

## Env

- `JETSTREAM_URL` — WebSocket endpoint
