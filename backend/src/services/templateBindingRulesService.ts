import { createClient } from "@supabase/supabase-js";

export const templateBindingRuleSources = [
  "member_form",
  "system",
  "notary",
  "signing",
] as const;

export type TemplateBindingRuleSource =
  (typeof templateBindingRuleSources)[number];

export type TemplateBindingRuleRecord = {
  id: string;
  documentKey: string;
  placeholder: string;
  description: string;
  required: boolean;
  source: TemplateBindingRuleSource;
  canonicalKey: string | null;
  sourceFieldKey: string | null;
  notes: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type TemplateBindingRuleRow = {
  id: string;
  document_key: string;
  placeholder: string;
  description: string;
  required: boolean;
  source: TemplateBindingRuleSource;
  canonical_key: string | null;
  source_field_key: string | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type CacheOptions = {
  forceRefresh?: boolean;
};

export type ListTemplateBindingRulesForAdminOptions = {
  documentKey?: string;
  includeInactive?: boolean;
};

export type CreateTemplateBindingRuleInput = {
  documentKey: string;
  placeholder: string;
  description: string;
  required: boolean;
  source: TemplateBindingRuleSource;
  canonicalKey?: string | null;
  sourceFieldKey?: string | null;
  notes?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type UpdateTemplateBindingRuleInput = {
  documentKey?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  source?: TemplateBindingRuleSource;
  canonicalKey?: string | null;
  sourceFieldKey?: string | null;
  notes?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

const TEMPLATE_BINDING_RULE_SELECT = [
  "id",
  "document_key",
  "placeholder",
  "description",
  "required",
  "source",
  "canonical_key",
  "source_field_key",
  "notes",
  "sort_order",
  "is_active",
  "created_at",
  "updated_at",
].join(", ");

const TEMPLATE_BINDING_RULES_CACHE_TTL_MS = 60_000;

let templateBindingRulesCache: {
  expiresAt: number;
  byDocumentKey: Map<string, TemplateBindingRuleRecord[]>;
} | null = null;

let templateBindingRulesLoadPromise:
  | Promise<Map<string, TemplateBindingRuleRecord[]>>
  | null = null;

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is required to load template binding rules");
  }

  if (!supabaseKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to load template binding rules",
    );
  }

  return createClient(supabaseUrl, supabaseKey);
};

const mapRowToRecord = (row: TemplateBindingRuleRow): TemplateBindingRuleRecord => {
  return {
    id: row.id,
    documentKey: row.document_key,
    placeholder: row.placeholder,
    description: row.description,
    required: row.required,
    source: row.source,
    canonicalKey: row.canonical_key,
    sourceFieldKey: row.source_field_key,
    notes: row.notes,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const cloneRules = (rules: TemplateBindingRuleRecord[]) => {
  return rules.map((rule) => ({ ...rule }));
};

const hasOwn = <T extends object>(value: T, key: string) => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const mapDataRowsToRecords = (data: unknown) => {
  return ((data ?? []) as unknown as TemplateBindingRuleRow[]).map(mapRowToRecord);
};

const loadTemplateBindingRulesByDocumentKey = async () => {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("template_binding_rules")
    .select(TEMPLATE_BINDING_RULE_SELECT)
    .eq("is_active", true)
    .order("document_key", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("placeholder", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const byDocumentKey = new Map<string, TemplateBindingRuleRecord[]>();

  for (const row of (data ?? []) as unknown as TemplateBindingRuleRow[]) {
    const record = mapRowToRecord(row);
    const current = byDocumentKey.get(record.documentKey) ?? [];
    current.push(record);
    byDocumentKey.set(record.documentKey, current);
  }

  return byDocumentKey;
};

const getCachedTemplateBindingRulesByDocumentKey = async (
  options: CacheOptions = {},
) => {
  const forceRefresh = options.forceRefresh === true;

  if (!forceRefresh && templateBindingRulesCache) {
    const isFresh = Date.now() < templateBindingRulesCache.expiresAt;
    if (isFresh) {
      return templateBindingRulesCache.byDocumentKey;
    }
  }

  if (!forceRefresh && templateBindingRulesLoadPromise) {
    return templateBindingRulesLoadPromise;
  }

  templateBindingRulesLoadPromise = loadTemplateBindingRulesByDocumentKey()
    .then((byDocumentKey) => {
      templateBindingRulesCache = {
        expiresAt: Date.now() + TEMPLATE_BINDING_RULES_CACHE_TTL_MS,
        byDocumentKey,
      };

      return byDocumentKey;
    })
    .finally(() => {
      templateBindingRulesLoadPromise = null;
    });

  return templateBindingRulesLoadPromise;
};

export const invalidateTemplateBindingRulesCache = () => {
  templateBindingRulesCache = null;
  templateBindingRulesLoadPromise = null;
};

export const listTemplateBindingRules = async (options: CacheOptions = {}) => {
  const byDocumentKey = await getCachedTemplateBindingRulesByDocumentKey(options);
  const flattened = [...byDocumentKey.values()].flatMap((rules) => rules);

  return cloneRules(flattened);
};

export const getTemplateBindingRulesByDocumentKey = async (
  documentKey: string,
  options: CacheOptions = {},
) => {
  const normalizedDocumentKey = documentKey.trim();
  if (!normalizedDocumentKey) {
    return [] as TemplateBindingRuleRecord[];
  }

  const byDocumentKey = await getCachedTemplateBindingRulesByDocumentKey(options);
  const rules = byDocumentKey.get(normalizedDocumentKey) ?? [];

  return cloneRules(rules);
};

export const listTemplateBindingRulesForAdmin = async (
  options: ListTemplateBindingRulesForAdminOptions = {},
) => {
  const supabaseAdmin = getSupabaseAdmin();

  let query = supabaseAdmin
    .from("template_binding_rules")
    .select(TEMPLATE_BINDING_RULE_SELECT)
    .order("document_key", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("placeholder", { ascending: true });

  if (options.documentKey) {
    query = query.eq("document_key", options.documentKey);
  }

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return mapDataRowsToRecords(data);
};

export const getTemplateBindingRuleById = async (id: string) => {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("template_binding_rules")
    .select(TEMPLATE_BINDING_RULE_SELECT)
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return mapRowToRecord(data as unknown as TemplateBindingRuleRow);
};

export const createTemplateBindingRule = async (
  input: CreateTemplateBindingRuleInput,
) => {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("template_binding_rules")
    .insert({
      document_key: input.documentKey,
      placeholder: input.placeholder,
      description: input.description,
      required: input.required,
      source: input.source,
      canonical_key: input.canonicalKey ?? null,
      source_field_key: input.sourceFieldKey ?? null,
      notes: input.notes ?? null,
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
    })
    .select(TEMPLATE_BINDING_RULE_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  invalidateTemplateBindingRulesCache();

  return mapRowToRecord(data as unknown as TemplateBindingRuleRow);
};

export const updateTemplateBindingRule = async (
  id: string,
  input: UpdateTemplateBindingRuleInput,
) => {
  const updates: Record<string, unknown> = {};

  if (hasOwn(input, "documentKey")) {
    updates.document_key = input.documentKey;
  }

  if (hasOwn(input, "placeholder")) {
    updates.placeholder = input.placeholder;
  }

  if (hasOwn(input, "description")) {
    updates.description = input.description;
  }

  if (hasOwn(input, "required")) {
    updates.required = input.required;
  }

  if (hasOwn(input, "source")) {
    updates.source = input.source;
  }

  if (hasOwn(input, "canonicalKey")) {
    updates.canonical_key = input.canonicalKey ?? null;
  }

  if (hasOwn(input, "sourceFieldKey")) {
    updates.source_field_key = input.sourceFieldKey ?? null;
  }

  if (hasOwn(input, "notes")) {
    updates.notes = input.notes ?? null;
  }

  if (hasOwn(input, "sortOrder")) {
    updates.sort_order = input.sortOrder;
  }

  if (hasOwn(input, "isActive")) {
    updates.is_active = input.isActive;
  }

  if (Object.keys(updates).length === 0) {
    return getTemplateBindingRuleById(id);
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("template_binding_rules")
    .update(updates)
    .eq("id", id)
    .select(TEMPLATE_BINDING_RULE_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  invalidateTemplateBindingRulesCache();

  return mapRowToRecord(data as unknown as TemplateBindingRuleRow);
};

export const deactivateTemplateBindingRule = async (id: string) => {
  return updateTemplateBindingRule(id, {
    isActive: false,
  });
};

export const getRequiredMemberFormFieldKeysForDocumentKey = async (
  documentKey: string,
  options: CacheOptions = {},
) => {
  const rules = await getTemplateBindingRulesByDocumentKey(documentKey, options);
  const requiredFieldKeys = new Set<string>();

  for (const rule of rules) {
    if (rule.source !== "member_form" || !rule.required) {
      continue;
    }

    const fieldKey = rule.sourceFieldKey ?? rule.canonicalKey;
    if (!fieldKey) {
      continue;
    }

    requiredFieldKeys.add(fieldKey);
  }

  return [...requiredFieldKeys.values()].sort((left, right) =>
    left.localeCompare(right),
  );
};
