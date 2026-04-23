# Role Management

This document explains how to set and verify user roles for DARCI.

## Roles

Current runtime roles enforced by the API middleware:
- member
- pro
- notary
- admin

Phase 1 also adds a database-backed capability model for:
- member
- pro
- notary
- admin

Important notes:
- `public.users.role` is now the active runtime role used by the current API middleware and JWT fallback logic.
- `public.user_roles` is the additive capability table introduced for Phase 1.
- `public.user_roles.is_active_profile` marks the currently selected app/dashboard profile role.
- `pro` is now authorized as a first-class runtime role, and it satisfies member-authorized routes where the current product surface is member-equivalent.
- Admin and `service_role` can now assign multiple capabilities, not just rewrite one role string.

## Admin API (preferred)

Once you already have an admin token, update a user's current active runtime role via API:

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
- This endpoint remains as a convenience wrapper over the new multi-role service.

## Multi-Role Admin APIs

List a user's role assignments:

```bash
curl -s -H "Authorization: Bearer <ADMIN_OR_SERVICE_ROLE_TOKEN>" \
  "$API_BASE_URL/admin/users/<supabase_user_id>/roles"
```

Assign or update a role capability without forcing it active:

```bash
curl -X POST "$API_BASE_URL/admin/users/<supabase_user_id>/roles" \
  -H "Authorization: Bearer <ADMIN_OR_SERVICE_ROLE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"role":"notary","status":"active"}'
```

Assign or update a role and make it the active app profile immediately:

```bash
curl -X POST "$API_BASE_URL/admin/users/<supabase_user_id>/roles" \
  -H "Authorization: Bearer <ADMIN_OR_SERVICE_ROLE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"role":"pro","status":"active","makeActive":true}'
```

Switch the active runtime role for a target user:

```bash
curl -X PATCH "$API_BASE_URL/admin/users/<supabase_user_id>/active-role" \
  -H "Authorization: Bearer <ADMIN_OR_SERVICE_ROLE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"role":"notary"}'
```

## Bootstrap First Admin (when no admin exists)

If no admin exists yet, set the role directly in the database using the service role connection:

```bash
psql "$DATABASE_URL" -c "update public.users set role='admin' where supabase_user_id='<supabase_user_id>';"
```

Then re-login to get a fresh token. The API will use `public.users.role` as a fallback when JWT role claims are missing.

## Phase 1 Schema Foundation

Phase 1 adds these role-management tables:
- `public.user_roles`
- `public.user_role_verifications`
- `public.pro_profiles`
- `public.user_role_history`
- `public.role_verification_artifacts`

It also evolves `public.notary_profiles` in place rather than replacing it.

Compatibility rules:
- `public.users.role` remains the single active runtime role consumed by existing controllers and route guards.
- `public.user_roles.is_active_profile` tracks which capability row is mirrored back into `public.users.role`.
- Existing users are backfilled with at least a `member` role row, and legacy `admin` and `notary` users also receive matching capability rows.

## User Profile Switching

Authenticated users can switch their own active app profile:

```bash
curl -X PATCH "$API_BASE_URL/users/me/active-role" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"role":"pro"}'
```

The role must already be assigned and active in `public.user_roles`.

## Verify Role

```bash
curl -s -H "Authorization: Bearer <ACCESS_TOKEN>" $API_BASE_URL/users/me
```

Expected response includes the current active runtime role plus the assigned active capabilities:

```json
{
  "user": {
    "id": "<internal_user_id>",
    "email": "user@example.com",
    "role": "admin",
    "availableRoles": ["member", "admin", "notary"],
    "status": "active"
  }
}
```
