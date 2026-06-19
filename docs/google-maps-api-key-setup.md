# Google Maps API Key Setup

## Purpose

DARCi Venue Capture uses two separate Google API keys:

- Browser key: powers address autocomplete in the web UI.
- Server key: powers backend reverse geocoding from latitude/longitude into venue fields.

These keys can live in the same Google Cloud project, but they should be separate credentials with different restrictions.

## Required APIs

Enable these APIs in the Google Cloud project:

- Maps JavaScript API
- Places API
- Geocoding API

Path:

```text
Google Cloud Console -> APIs & Services -> Library
```

## Key 1: Browser Autocomplete Key

This key is intentionally public because it is bundled into the Next.js browser app.

Repo env vars:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=browser_key_here
NEXT_PUBLIC_GOOGLE_MAPS_LIBRARIES=places
NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED=true
```

Use this key for:

- Maps JavaScript API
- Places API

Do not use this key for backend-only geocoding.

### Create The Browser Key

1. Open Google Cloud Console:

   ```text
   https://console.cloud.google.com/
   ```

2. Select the DARCi Google Cloud project.

3. Confirm billing is enabled for the project.

4. Go to:

   ```text
   APIs & Services -> Credentials
   ```

5. Click:

   ```text
   Create Credentials -> API key
   ```

6. Rename the key:

   ```text
   DARCi Staging Browser Maps Key
   ```

7. Under `Application restrictions`, choose:

   ```text
   Websites
   ```

8. Add allowed HTTP referrers.

   Staging examples:

   ```text
   https://app.staging.darciregistry.dev/*
   http://localhost:3000/*
   http://localhost:3001/*
   ```

   Production example:

   ```text
   https://app.darciregistry.com/*
   ```

9. Under `API restrictions`, choose:

   ```text
   Restrict key
   ```

10. Select only:

    ```text
    Maps JavaScript API
    Places API
    ```

11. Save the key.

12. Add it to the web environment as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

### Test The Browser Key

From the repo root:

```bash
cd /Users/jorge/Desktop/darci
set -a
source .env.staging
set +a

node <<'NODE'
const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const url = new URL('https://maps.googleapis.com/maps/api/js');
url.searchParams.set('key', key);
url.searchParams.set('libraries', 'places');
url.searchParams.set('callback', '__darciGoogleSmoke');

const response = await fetch(url, {
  headers: { Referer: 'http://localhost:3000/' },
});
const text = await response.text();
const error = text.match(/Google Maps JavaScript API error: ([A-Za-z0-9_]+)/)?.[1] ?? null;

console.log({ httpStatus: response.status, error });
NODE
```

Expected result:

```json
{ "httpStatus": 200, "error": null }
```

If the error is `RefererNotAllowedMapError`, add the local or staging origin to the browser key's website restrictions.

## Key 2: Server Reverse-Geocoding Key

This key must not be exposed to the browser. It is used only by the backend API.

Repo env vars:

```dotenv
GOOGLE_MAPS_SERVER_API_KEY=server_key_here
GOOGLE_MAPS_GEOCODE_USE_SERVER=true
```

Use this key for:

- Geocoding API

Do not prefix this key with `NEXT_PUBLIC_`.

### Create The Server Key

1. Open Google Cloud Console:

   ```text
   https://console.cloud.google.com/
   ```

2. Select the DARCi Google Cloud project.

3. Confirm billing is enabled for the project.

4. Go to:

   ```text
   APIs & Services -> Credentials
   ```

5. Click:

   ```text
   Create Credentials -> API key
   ```

6. Rename the key:

   ```text
   DARCi Staging Backend Geocoding Key
   ```

7. For first local verification only, set `Application restrictions` to:

   ```text
   None
   ```

   This keeps the first smoke test simple.

8. Under `API restrictions`, choose:

   ```text
   Restrict key
   ```

9. Select only:

   ```text
   Geocoding API
   ```

10. Save the key.

11. Add it to the backend environment as `GOOGLE_MAPS_SERVER_API_KEY`.

12. Confirm `GOOGLE_MAPS_GEOCODE_USE_SERVER=true` is also set.

13. Restart the backend API after changing the env value.

### Test The Server Key

From the repo root:

```bash
cd /Users/jorge/Desktop/darci
set -a
source .env.staging
set +a

curl -s "https://maps.googleapis.com/maps/api/geocode/json?latlng=40.7128,-74.0060&key=$GOOGLE_MAPS_SERVER_API_KEY" \
  | jq '{status, error_message, resultCount: (.results | length)}'
```

Expected result:

```json
{
  "status": "OK",
  "error_message": null,
  "resultCount": 1
}
```

If the response is `REQUEST_DENIED`, check:

- The key was copied completely.
- The key has not been deleted or disabled.
- Billing is enabled on the Google Cloud project.
- Geocoding API is enabled in the same project as the key.
- API restrictions include `Geocoding API`.
- Application restrictions are not blocking the request.

### Lock Down The Server Key After It Works

After the local smoke test passes, restrict the server key.

For AWS staging/production:

1. Find the backend API's outbound public IP address.
2. If ECS uses a NAT Gateway, use the NAT Gateway Elastic IP.
3. In Google Cloud Console, open the server key.
4. Under `Application restrictions`, choose:

   ```text
   IP addresses
   ```

5. Add the backend outbound IP as `/32`.

   Example placeholder:

   ```text
   203.0.113.10/32
   ```

6. Save the key.

For local development, use one of these options:

- Keep a separate local server key with temporary relaxed restrictions.
- Add your current public IP address temporarily.
- Remove your local IP when testing is complete.

## Environment Placement

Local staging file:

```text
.env.staging
```

Browser key values:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=browser_key_here
NEXT_PUBLIC_GOOGLE_MAPS_LIBRARIES=places
NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED=true
```

Backend key values:

```dotenv
GOOGLE_MAPS_SERVER_API_KEY=server_key_here
GOOGLE_MAPS_GEOCODE_USE_SERVER=true
```

AWS staging/prod:

- Store `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with the web build secrets.
- Store `GOOGLE_MAPS_SERVER_API_KEY` with the backend API task secrets.
- Redeploy the web app after changing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` because Next.js embeds public env vars at build time.
- Restart or redeploy the backend after changing `GOOGLE_MAPS_SERVER_API_KEY`.

## Current DARCi Code Paths

Browser autocomplete:

```text
apps/web/src/app/app/notary/requests/[id]/page.tsx
```

Backend reverse geocoding:

```text
backend/src/controllers/notaryController.ts
```

Local Next env shim:

```text
apps/web/scripts/with-local-next-env.mjs
```

The local Next env shim must allow the browser Google vars through its public env allowlist.

## Common Failure Messages

`UrlAuthenticationCommonError`

- Usually means the browser key is invalid, restricted incorrectly, or the current referrer is not allowed.

`RefererNotAllowedMapError`

- The browser key exists, but the current website origin is missing from allowed HTTP referrers.

`REQUEST_DENIED: The provided API key is invalid.`

- The key is wrong, deleted, copied incompletely, or not valid for the API/project being called.

`REQUEST_DENIED: API keys with referer restrictions cannot be used with this API.`

- A browser-style referrer-restricted key is being used from the backend. Create/use the server key instead.

`This API project is not authorized to use this API.`

- Enable the required API in the Google Cloud project that owns the key.

## Rotation Checklist

Rotate keys immediately if a key is exposed, pasted into chat, committed, or suspected compromised.

1. Create a replacement browser key and server key.
2. Apply the same API restrictions.
3. Apply the same application restrictions.
4. Update local `.env.staging`.
5. Update AWS staging/prod secrets.
6. Redeploy web and backend services.
7. Smoke test browser autocomplete and backend geocoding.
8. Delete the old keys from Google Cloud Console.