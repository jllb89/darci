import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type IdentityDocumentFieldKey =
  | "issuingJurisdiction"
  | "documentExpirationDate"
  | "documentNumberTail"
  | "maskedIdentifier";

export type IdentityDocumentFieldInputKind = "text" | "date";

export type IdentityDocumentTypeSchema = {
  value: string;
  label: string;
  sortOrder: number;
  fields: Array<{
    fieldKey: IdentityDocumentFieldKey;
    label: string;
    placeholder: string | null;
    inputKind: IdentityDocumentFieldInputKind;
    required: boolean;
    minLength: number | null;
    maxLength: number | null;
    pattern: string | null;
    sortOrder: number;
  }>;
};

const identifierFieldOverrides: Partial<Record<string, { label: string; placeholder: string; pattern: string }>> = {
  passport: {
    label: "Passport number",
    placeholder: "Passport number",
    pattern: "^[A-Za-z0-9\\-\\s]{4,64}$",
  },
  passport_card: {
    label: "Passport card number",
    placeholder: "Passport card number",
    pattern: "^[A-Za-z0-9\\-\\s]{4,64}$",
  },
  military_id: {
    label: "Military ID number",
    placeholder: "Military ID number",
    pattern: "^[A-Za-z0-9\\-\\s]{4,64}$",
  },
  permanent_resident_card: {
    label: "Resident card number",
    placeholder: "Resident card number",
    pattern: "^[A-Za-z0-9\\-\\s]{4,64}$",
  },
  foreign_passport: {
    label: "Passport number",
    placeholder: "Passport number",
    pattern: "^[A-Za-z0-9\\-\\s]{4,64}$",
  },
};

const normalizeIdentifierField = (
  documentTypeCode: string,
  field: IdentityDocumentTypeSchema["fields"][number],
) => {
  if (field.fieldKey !== "maskedIdentifier") {
    return field;
  }

  const override = identifierFieldOverrides[documentTypeCode];
  if (!override) {
    return field;
  }

  return {
    ...field,
    label: override.label,
    placeholder: override.placeholder,
    pattern: override.pattern,
  };
};

const fallbackSchema: IdentityDocumentTypeSchema[] = [
  {
    value: "state_driver_license",
    label: "State driver license",
    sortOrder: 10,
    fields: [
      { fieldKey: "issuingJurisdiction", label: "Issuing state", placeholder: "Issuing state", inputKind: "text", required: true, minLength: 2, maxLength: 80, pattern: null, sortOrder: 10 },
      { fieldKey: "documentExpirationDate", label: "Expiration date", placeholder: "Expiration date", inputKind: "date", required: true, minLength: 10, maxLength: 10, pattern: null, sortOrder: 20 },
      { fieldKey: "documentNumberTail", label: "License number tail", placeholder: "Last 4 characters", inputKind: "text", required: true, minLength: 2, maxLength: 4, pattern: "^[A-Za-z0-9]{2,4}$", sortOrder: 30 },
    ],
  },
  {
    value: "state_identification_card",
    label: "State identification card",
    sortOrder: 20,
    fields: [
      { fieldKey: "issuingJurisdiction", label: "Issuing state", placeholder: "Issuing state", inputKind: "text", required: true, minLength: 2, maxLength: 80, pattern: null, sortOrder: 10 },
      { fieldKey: "documentExpirationDate", label: "Expiration date", placeholder: "Expiration date", inputKind: "date", required: true, minLength: 10, maxLength: 10, pattern: null, sortOrder: 20 },
      { fieldKey: "documentNumberTail", label: "ID number tail", placeholder: "Last 4 characters", inputKind: "text", required: true, minLength: 2, maxLength: 4, pattern: "^[A-Za-z0-9]{2,4}$", sortOrder: 30 },
    ],
  },
  {
    value: "passport",
    label: "Passport",
    sortOrder: 30,
    fields: [
      { fieldKey: "issuingJurisdiction", label: "Issuing country", placeholder: "Issuing country", inputKind: "text", required: true, minLength: 2, maxLength: 80, pattern: null, sortOrder: 10 },
      { fieldKey: "documentExpirationDate", label: "Expiration date", placeholder: "Expiration date", inputKind: "date", required: true, minLength: 10, maxLength: 10, pattern: null, sortOrder: 20 },
      { fieldKey: "maskedIdentifier", label: "Passport number", placeholder: "Passport number", inputKind: "text", required: true, minLength: 4, maxLength: 64, pattern: "^[A-Za-z0-9\\-\\s]{4,64}$", sortOrder: 30 },
    ],
  },
  {
    value: "passport_card",
    label: "Passport card",
    sortOrder: 40,
    fields: [
      { fieldKey: "issuingJurisdiction", label: "Issuing country", placeholder: "Issuing country", inputKind: "text", required: true, minLength: 2, maxLength: 80, pattern: null, sortOrder: 10 },
      { fieldKey: "documentExpirationDate", label: "Expiration date", placeholder: "Expiration date", inputKind: "date", required: true, minLength: 10, maxLength: 10, pattern: null, sortOrder: 20 },
      { fieldKey: "maskedIdentifier", label: "Passport card number", placeholder: "Passport card number", inputKind: "text", required: true, minLength: 4, maxLength: 64, pattern: "^[A-Za-z0-9\\-\\s]{4,64}$", sortOrder: 30 },
    ],
  },
  {
    value: "military_id",
    label: "Military ID",
    sortOrder: 50,
    fields: [
      { fieldKey: "issuingJurisdiction", label: "Issuing authority", placeholder: "Issuing authority", inputKind: "text", required: true, minLength: 2, maxLength: 80, pattern: null, sortOrder: 10 },
      { fieldKey: "documentExpirationDate", label: "Expiration date", placeholder: "Expiration date", inputKind: "date", required: true, minLength: 10, maxLength: 10, pattern: null, sortOrder: 20 },
      { fieldKey: "maskedIdentifier", label: "Military ID number", placeholder: "Military ID number", inputKind: "text", required: true, minLength: 4, maxLength: 64, pattern: "^[A-Za-z0-9\\-\\s]{4,64}$", sortOrder: 30 },
    ],
  },
  {
    value: "permanent_resident_card",
    label: "Permanent resident card",
    sortOrder: 60,
    fields: [
      { fieldKey: "issuingJurisdiction", label: "Issuing country", placeholder: "Issuing country", inputKind: "text", required: true, minLength: 2, maxLength: 80, pattern: null, sortOrder: 10 },
      { fieldKey: "documentExpirationDate", label: "Expiration date", placeholder: "Expiration date", inputKind: "date", required: true, minLength: 10, maxLength: 10, pattern: null, sortOrder: 20 },
      { fieldKey: "maskedIdentifier", label: "Resident card number", placeholder: "Resident card number", inputKind: "text", required: true, minLength: 4, maxLength: 64, pattern: "^[A-Za-z0-9\\-\\s]{4,64}$", sortOrder: 30 },
    ],
  },
  {
    value: "tribal_identification_card",
    label: "Tribal identification card",
    sortOrder: 70,
    fields: [
      { fieldKey: "issuingJurisdiction", label: "Issuing tribe or jurisdiction", placeholder: "Issuing tribe or jurisdiction", inputKind: "text", required: true, minLength: 2, maxLength: 120, pattern: null, sortOrder: 10 },
      { fieldKey: "documentExpirationDate", label: "Expiration date", placeholder: "Expiration date", inputKind: "date", required: true, minLength: 10, maxLength: 10, pattern: null, sortOrder: 20 },
      { fieldKey: "documentNumberTail", label: "Tribal ID number tail", placeholder: "Last 4 characters", inputKind: "text", required: true, minLength: 2, maxLength: 4, pattern: "^[A-Za-z0-9]{2,4}$", sortOrder: 30 },
    ],
  },
  {
    value: "foreign_passport",
    label: "Foreign passport",
    sortOrder: 80,
    fields: [
      { fieldKey: "issuingJurisdiction", label: "Issuing country", placeholder: "Issuing country", inputKind: "text", required: true, minLength: 2, maxLength: 80, pattern: null, sortOrder: 10 },
      { fieldKey: "documentExpirationDate", label: "Expiration date", placeholder: "Expiration date", inputKind: "date", required: true, minLength: 10, maxLength: 10, pattern: null, sortOrder: 20 },
      { fieldKey: "maskedIdentifier", label: "Passport number", placeholder: "Passport number", inputKind: "text", required: true, minLength: 4, maxLength: 64, pattern: "^[A-Za-z0-9\\-\\s]{4,64}$", sortOrder: 30 },
    ],
  },
];

const toNumberOrNull = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const mapRowsToSchema = (
  types: Array<Record<string, unknown>>,
  fields: Array<Record<string, unknown>>,
) => {
  return types
    .map((typeRow) => {
      const value = String(typeRow.code ?? "").trim();
      if (!value) {
        return null;
      }

      const label = String(typeRow.label ?? value).trim();
      const sortOrder = toNumberOrNull(typeRow.sort_order) ?? 100;
      const typeFields = fields
        .filter((fieldRow) => String(fieldRow.document_type_code ?? "") === value)
        .map((fieldRow) => {
          const fieldKey = String(fieldRow.field_key ?? "") as IdentityDocumentFieldKey;
          const inputKind = String(fieldRow.input_kind ?? "text") as IdentityDocumentFieldInputKind;
          return {
            fieldKey,
            label: String(fieldRow.label ?? fieldKey),
            placeholder: fieldRow.placeholder == null ? null : String(fieldRow.placeholder),
            inputKind,
            required: Boolean(fieldRow.is_required),
            minLength: toNumberOrNull(fieldRow.min_length),
            maxLength: toNumberOrNull(fieldRow.max_length),
            pattern: fieldRow.pattern == null ? null : String(fieldRow.pattern),
            sortOrder: toNumberOrNull(fieldRow.sort_order) ?? 100,
          };
        })
        .map((field) => normalizeIdentifierField(value, field))
        .sort((left, right) => left.sortOrder - right.sortOrder);

      return {
        value,
        label,
        sortOrder,
        fields: typeFields,
      } satisfies IdentityDocumentTypeSchema;
    })
    .filter((item): item is IdentityDocumentTypeSchema => Boolean(item))
    .sort((left, right) => left.sortOrder - right.sortOrder);
};

export const getIdentityDocumentSchema = async (selectedType?: string | null) => {
  try {
    const [{ data: types, error: typesError }, { data: fields, error: fieldsError }] = await Promise.all([
      supabaseAdmin
        .from("notary_identity_document_types")
        .select("code, label, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
      supabaseAdmin
        .from("notary_identity_document_fields")
        .select(
          "document_type_code, field_key, label, placeholder, input_kind, is_required, min_length, max_length, pattern, sort_order",
        )
        .order("sort_order", { ascending: true }),
    ]);

    if (typesError) {
      throw new Error(typesError.message);
    }
    if (fieldsError) {
      throw new Error(fieldsError.message);
    }

    const schema = mapRowsToSchema((types ?? []) as Record<string, unknown>[], (fields ?? []) as Record<string, unknown>[]);
    const documentTypes = schema.length > 0 ? schema : fallbackSchema;
    const selected =
      documentTypes.find((item) => item.value === (selectedType ?? "").trim()) ??
      documentTypes[0];

    return {
      documentTypes: documentTypes.map((item) => ({
        value: item.value,
        label: item.label,
        sortOrder: item.sortOrder,
      })),
      selectedType: selected,
    };
  } catch {
    const selected =
      fallbackSchema.find((item) => item.value === (selectedType ?? "").trim()) ??
      fallbackSchema[0];

    return {
      documentTypes: fallbackSchema.map((item) => ({
        value: item.value,
        label: item.label,
        sortOrder: item.sortOrder,
      })),
      selectedType: selected,
    };
  }
};
