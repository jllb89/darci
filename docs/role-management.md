# Role Management

This document explains how to set and verify user roles for DARCI.

## Roles

Supported roles:
- member
- notary
- admin

Roles are enforced by the API middleware. Admin and service_role can update roles.

## Admin API (preferred)

Once you already have an admin token, update a user role via API:

```bash
curl -X PATCH "$API_BASE_URL/admin/users/<supabase_user_id>/role" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}'
```

Set API_BASE_URL based on environment:

```bash
# local
API_BASE_URL=https://your-local-api

# staging
API_BASE_URL=https://staging-api.example.com

# production
API_BASE_URL=https://api.example.com
```

Notes:
- The `id` is the Supabase Auth user id (JWT sub).
- Users must re-login to get a new token with updated role claims.

## Bootstrap First Admin (when no admin exists)

If no admin exists yet, set the role directly in the database using the service role connection:

```bash
psql "$DATABASE_URL" -c "update public.users set role='admin' where supabase_user_id='<supabase_user_id>';"
```

Then re-login to get a fresh token. The API will use `public.users.role` as a fallback when JWT role claims are missing.

## Verify Role

```bash
curl -s -H "Authorization: Bearer <ACCESS_TOKEN>" $API_BASE_URL/users/me
```

Expected response includes the role:

```json
{
  "user": {
    "id": "<internal_user_id>",
    "email": "user@example.com",
    "role": "admin",
    "status": "active"
  }
}
```
