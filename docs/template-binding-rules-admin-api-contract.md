# Template Binding Rules Admin API Contract

Short contract for managing template placeholder bindings used by extraction coverage and template-driven requiredness.

## Auth and roles

- Requires bearer auth.
- Allowed roles: `admin`, `service_role`.

## Resource shape

```json
{
  "id": "5f1a9662-3f3f-41a4-9d18-31ea1c04fe46",
  "documentKey": "poa_general",
  "placeholder": "Principal.FullName",
  "description": "Principal full legal name.",
  "required": true,
  "source": "member_form",
  "canonicalKey": "principal_full_name",
  "sourceFieldKey": null,
  "notes": null,
  "sortOrder": 20,
  "isActive": true,
  "createdAt": "2026-04-14T15:00:00.000Z",
  "updatedAt": "2026-04-14T15:00:00.000Z"
}
```

## Source enum

- `member_form`
- `system`
- `notary`
- `signing`

## Validation rules

- `documentKey` must match `^[a-z0-9_]+$`.
- `canonicalKey` and `sourceFieldKey` (when provided) must match `^[a-z0-9_]+$`.
- `sortOrder` must be an integer >= 0.
- `placeholder` and `description` must be non-empty.
- If `source` is `member_form`, at least one of `canonicalKey` or `sourceFieldKey` must be set.
- Update requests must include at least one field.

## Endpoints

## 1) List rules

`GET /admin/template-binding-rules`

Query params:

- `documentKey` (optional)
- `includeInactive` (optional, default `false`)

Response `200`:

```json
{
  "rules": [
    {
      "id": "5f1a9662-3f3f-41a4-9d18-31ea1c04fe46",
      "documentKey": "poa_general",
      "placeholder": "Principal.FullName",
      "description": "Principal full legal name.",
      "required": true,
      "source": "member_form",
      "canonicalKey": "principal_full_name",
      "sourceFieldKey": null,
      "notes": null,
      "sortOrder": 20,
      "isActive": true,
      "createdAt": "2026-04-14T15:00:00.000Z",
      "updatedAt": "2026-04-14T15:00:00.000Z"
    }
  ]
}
```

Curl:

```bash
curl -s "$API_BASE_URL/admin/template-binding-rules?documentKey=poa_general&includeInactive=true" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

## 2) Create rule

`POST /admin/template-binding-rules`

Request body:

```json
{
  "documentKey": "poa_general",
  "placeholder": "Principal.FullName",
  "description": "Principal full legal name.",
  "required": true,
  "source": "member_form",
  "canonicalKey": "principal_full_name",
  "sourceFieldKey": null,
  "notes": null,
  "sortOrder": 20,
  "isActive": true
}
```

Response `201`:

```json
{
  "rule": {
    "id": "5f1a9662-3f3f-41a4-9d18-31ea1c04fe46",
    "documentKey": "poa_general",
    "placeholder": "Principal.FullName",
    "description": "Principal full legal name.",
    "required": true,
    "source": "member_form",
    "canonicalKey": "principal_full_name",
    "sourceFieldKey": null,
    "notes": null,
    "sortOrder": 20,
    "isActive": true,
    "createdAt": "2026-04-14T15:00:00.000Z",
    "updatedAt": "2026-04-14T15:00:00.000Z"
  }
}
```

Curl:

```bash
curl -X POST "$API_BASE_URL/admin/template-binding-rules" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "documentKey": "poa_general",
    "placeholder": "Principal.FullName",
    "description": "Principal full legal name.",
    "required": true,
    "source": "member_form",
    "canonicalKey": "principal_full_name",
    "sortOrder": 20
  }'
```

## 3) Update rule

`PATCH /admin/template-binding-rules/{id}`

Request body (partial updates):

```json
{
  "description": "Primary principal legal name.",
  "required": true,
  "notes": "Aligned with latest template rev.",
  "sortOrder": 25
}
```

Response `200`:

```json
{
  "rule": {
    "id": "5f1a9662-3f3f-41a4-9d18-31ea1c04fe46",
    "documentKey": "poa_general",
    "placeholder": "Principal.FullName",
    "description": "Primary principal legal name.",
    "required": true,
    "source": "member_form",
    "canonicalKey": "principal_full_name",
    "sourceFieldKey": null,
    "notes": "Aligned with latest template rev.",
    "sortOrder": 25,
    "isActive": true,
    "createdAt": "2026-04-14T15:00:00.000Z",
    "updatedAt": "2026-04-14T15:10:00.000Z"
  }
}
```

Curl:

```bash
curl -X PATCH "$API_BASE_URL/admin/template-binding-rules/<RULE_ID>" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"required": false, "notes": null}'
```

## 4) Deactivate rule (soft delete)

`DELETE /admin/template-binding-rules/{id}`

Behavior:

- Sets `isActive` to `false`.
- Returns updated rule in response body.

Response `200`:

```json
{
  "rule": {
    "id": "5f1a9662-3f3f-41a4-9d18-31ea1c04fe46",
    "documentKey": "poa_general",
    "placeholder": "Principal.FullName",
    "description": "Principal full legal name.",
    "required": true,
    "source": "member_form",
    "canonicalKey": "principal_full_name",
    "sourceFieldKey": null,
    "notes": null,
    "sortOrder": 20,
    "isActive": false,
    "createdAt": "2026-04-14T15:00:00.000Z",
    "updatedAt": "2026-04-14T15:15:00.000Z"
  }
}
```

Curl:

```bash
curl -X DELETE "$API_BASE_URL/admin/template-binding-rules/<RULE_ID>" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

## Error contract

All endpoints can return the standard error envelope:

```json
{
  "error": "validation_error",
  "message": "Invalid request",
  "details": []
}
```

Common statuses:

- `400` validation errors
- `401` unauthorized
- `403` forbidden
- `404` rule not found (update/delete)
- `409` conflict (for example duplicate `documentKey + placeholder`)
- `500` internal error

## Frontend/admin tooling notes

- Default list behavior excludes inactive rows; pass `includeInactive=true` when building admin maintenance screens.
- Prefer stable keying by `id`, not by placeholder text.
- For `member_form` source rules, UI should enforce `canonicalKey || sourceFieldKey` before submit.
- OpenAPI source of truth: `api/openapi.yaml`.