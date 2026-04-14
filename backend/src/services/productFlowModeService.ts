import { createClient } from "@supabase/supabase-js";
import {
  idnDocumentTypes,
  listIdnJurisdictions,
  type IdnDocumentType,
} from "./idnService";
import { listPoaJurisdictions, poaTypes } from "./poaService";
import {
  listTrustJurisdictions,
  trustDocumentTypes,
  type TrustDocumentType,
} from "./trustService";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export const productFlowModeKeys = [
  "poa_only",
  "trust_bundle",
  "notarize_document",
] as const;

export type ProductFlowModeKey = (typeof productFlowModeKeys)[number];
export type ProductFlowFamily = "poa" | "trust" | "idn";

type ProductFlowPoaType = (typeof poaTypes)[number];

type ProductFlowModeRow = {
  id: string;
  mode_key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
};

type ProductFlowModeFamilyRow = {
  mode_id: string;
  family: ProductFlowFamily;
  default_document_type: string;
  is_required: boolean;
  sort_order: number;
};

type ProductFlowModeOutputRow = {
  mode_id: string;
  output_key: string;
  output_label: string;
  is_required: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
};

type ProductFlowModeUiRow = {
  mode_id: string;
  group_key: string;
  layout_mode: "single-column" | "two-column" | "wizard-step";
  show_upload_column: boolean;
  upload_required: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
};

export type ProductFlowModeDefinition = {
  modeKey: string;
  displayName: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  families: Array<{
    family: ProductFlowFamily;
    defaultDocumentType: string;
    isRequired: boolean;
    sortOrder: number;
  }>;
  outputs: Array<{
    outputKey: string;
    outputLabel: string;
    isRequired: boolean;
    sortOrder: number;
    metadata: Record<string, unknown>;
  }>;
  ui: Array<{
    groupKey: string;
    layoutMode: "single-column" | "two-column" | "wizard-step";
    showUploadColumn: boolean;
    uploadRequired: boolean;
    sortOrder: number;
    metadata: Record<string, unknown>;
  }>;
};

export type ProductFlowModeOutputDefinition = ProductFlowModeDefinition["outputs"][number];

export type ProductFlowModeSelection = {
  modeKey: string;
  families: ProductFlowFamily[];
  poaType: ProductFlowPoaType;
  trustType: TrustDocumentType;
  idnType: IdnDocumentType;
};

export type ProductFlowJurisdictionOption = {
  code: string;
  label: string;
};

const defaultProductFlowModeKey: ProductFlowModeKey = "trust_bundle";

const fallbackSelections: Record<ProductFlowModeKey, Omit<ProductFlowModeSelection, "modeKey">> = {
  poa_only: {
    families: ["poa"],
    poaType: "general",
    trustType: "rrr",
    idnType: "acknowledgment",
  },
  trust_bundle: {
    families: ["poa", "trust"],
    poaType: "general",
    trustType: "rrr",
    idnType: "acknowledgment",
  },
  notarize_document: {
    families: ["poa"],
    poaType: "general",
    trustType: "rrr",
    idnType: "acknowledgment",
  },
};

const flowFamilyOrder: ProductFlowFamily[] = ["poa", "trust", "idn"];

const isProductFlowModeKey = (value: string): value is ProductFlowModeKey => {
  return (productFlowModeKeys as readonly string[]).includes(value);
};

const isPoaDocumentType = (value: string): value is ProductFlowPoaType => {
  return (poaTypes as readonly string[]).includes(value);
};

const isTrustDocumentType = (value: string): value is TrustDocumentType => {
  return (trustDocumentTypes as readonly string[]).includes(value);
};

const isIdnDocumentType = (value: string): value is IdnDocumentType => {
  return (idnDocumentTypes as readonly string[]).includes(value);
};

const normalizeModeKey = (modeKey?: string): ProductFlowModeKey => {
  if (modeKey && isProductFlowModeKey(modeKey)) {
    return modeKey;
  }

  return defaultProductFlowModeKey;
};

const normalizeFamilies = (families: ProductFlowFamily[]): ProductFlowFamily[] => {
  const selected = new Set(families);

  return flowFamilyOrder.filter((family) => selected.has(family));
};

const buildFallbackSelection = (modeKey?: string): ProductFlowModeSelection => {
  const normalizedModeKey = normalizeModeKey(modeKey);
  const fallback = fallbackSelections[normalizedModeKey];

  return {
    modeKey: normalizedModeKey,
    families: [...fallback.families],
    poaType: fallback.poaType,
    trustType: fallback.trustType,
    idnType: fallback.idnType,
  };
};

const intersectJurisdictionLists = (
  lists: ProductFlowJurisdictionOption[][],
): ProductFlowJurisdictionOption[] => {
  if (lists.length === 0) {
    return [];
  }

  const firstList = lists[0];
  if (!firstList) {
    return [];
  }

  const intersection = new Set(firstList.map((item) => item.code));

  for (const list of lists.slice(1)) {
    const codes = new Set(list.map((item) => item.code));

    for (const code of [...intersection.values()]) {
      if (!codes.has(code)) {
        intersection.delete(code);
      }
    }
  }

  return firstList.filter((item) => intersection.has(item.code));
};

const mapModeRowsToDefinitions = (
  modeRows: ProductFlowModeRow[],
  familyRows: ProductFlowModeFamilyRow[],
  outputRows: ProductFlowModeOutputRow[],
  uiRows: ProductFlowModeUiRow[],
): ProductFlowModeDefinition[] => {
  const familyRowsByModeId = new Map<string, ProductFlowModeFamilyRow[]>();
  const outputRowsByModeId = new Map<string, ProductFlowModeOutputRow[]>();
  const uiRowsByModeId = new Map<string, ProductFlowModeUiRow[]>();

  for (const row of familyRows) {
    const rows = familyRowsByModeId.get(row.mode_id) ?? [];
    rows.push(row);
    familyRowsByModeId.set(row.mode_id, rows);
  }

  for (const row of outputRows) {
    const rows = outputRowsByModeId.get(row.mode_id) ?? [];
    rows.push(row);
    outputRowsByModeId.set(row.mode_id, rows);
  }

  for (const row of uiRows) {
    const rows = uiRowsByModeId.get(row.mode_id) ?? [];
    rows.push(row);
    uiRowsByModeId.set(row.mode_id, rows);
  }

  return modeRows
    .map((mode) => {
      const families = (familyRowsByModeId.get(mode.id) ?? [])
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((family) => ({
          family: family.family,
          defaultDocumentType: family.default_document_type,
          isRequired: family.is_required,
          sortOrder: family.sort_order,
        }));

      const outputs = (outputRowsByModeId.get(mode.id) ?? [])
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((output) => ({
          outputKey: output.output_key,
          outputLabel: output.output_label,
          isRequired: output.is_required,
          sortOrder: output.sort_order,
          metadata: output.metadata,
        }));

      const ui = (uiRowsByModeId.get(mode.id) ?? [])
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((entry) => ({
          groupKey: entry.group_key,
          layoutMode: entry.layout_mode,
          showUploadColumn: entry.show_upload_column,
          uploadRequired: entry.upload_required,
          sortOrder: entry.sort_order,
          metadata: entry.metadata,
        }));

      return {
        modeKey: mode.mode_key,
        displayName: mode.display_name,
        description: mode.description,
        isActive: mode.is_active,
        isDefault: mode.is_default,
        sortOrder: mode.sort_order,
        families,
        outputs,
        ui,
      } satisfies ProductFlowModeDefinition;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
};

const listModeRows = async (): Promise<ProductFlowModeRow[]> => {
  const { data, error } = await supabaseAdmin
    .from("product_flow_modes")
    .select("id, mode_key, display_name, description, is_active, is_default, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("mode_key", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProductFlowModeRow[];
};

const listModeFamilyRows = async (modeIds: string[]): Promise<ProductFlowModeFamilyRow[]> => {
  if (modeIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("product_flow_mode_families")
    .select("mode_id, family, default_document_type, is_required, sort_order")
    .in("mode_id", modeIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProductFlowModeFamilyRow[];
};

const listModeOutputRows = async (modeIds: string[]): Promise<ProductFlowModeOutputRow[]> => {
  if (modeIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("product_flow_mode_outputs")
    .select("mode_id, output_key, output_label, is_required, sort_order, metadata")
    .in("mode_id", modeIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProductFlowModeOutputRow[];
};

const listModeUiRows = async (modeIds: string[]): Promise<ProductFlowModeUiRow[]> => {
  if (modeIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("product_flow_mode_ui")
    .select(
      "mode_id, group_key, layout_mode, show_upload_column, upload_required, sort_order, metadata",
    )
    .in("mode_id", modeIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ProductFlowModeUiRow[];
};

const getDefaultModeKeyFromDatabase = async (): Promise<string | null> => {
  const { data, error } = await supabaseAdmin
    .from("product_flow_modes")
    .select("mode_key")
    .eq("is_active", true)
    .eq("is_default", true)
    .order("sort_order", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{ mode_key: string }>;
  return rows[0]?.mode_key ?? null;
};

const getModeFamilyRowsByKey = async (
  modeKey: string,
): Promise<{ modeKey: string; rows: ProductFlowModeFamilyRow[] } | null> => {
  const { data: modeData, error: modeError } = await supabaseAdmin
    .from("product_flow_modes")
    .select("id, mode_key")
    .eq("mode_key", modeKey)
    .eq("is_active", true)
    .limit(1);

  if (modeError) {
    throw new Error(modeError.message);
  }

  const modeRows = (modeData ?? []) as Array<{ id: string; mode_key: string }>;
  const mode = modeRows[0];

  if (!mode) {
    return null;
  }

  const { data: familyData, error: familyError } = await supabaseAdmin
    .from("product_flow_mode_families")
    .select("mode_id, family, default_document_type, is_required, sort_order")
    .eq("mode_id", mode.id)
    .order("sort_order", { ascending: true });

  if (familyError) {
    throw new Error(familyError.message);
  }

  return {
    modeKey: mode.mode_key,
    rows: (familyData ?? []) as ProductFlowModeFamilyRow[],
  };
};

const buildSelectionFromRows = (
  modeKey: string,
  familyRows: ProductFlowModeFamilyRow[],
): ProductFlowModeSelection => {
  const fallback = buildFallbackSelection(modeKey);

  if (familyRows.length === 0) {
    return fallback;
  }

  const sortedRows = [...familyRows].sort((left, right) => left.sort_order - right.sort_order);
  const requiredRows = sortedRows.filter((row) => row.is_required);
  const selectedRows = requiredRows.length > 0 ? requiredRows : sortedRows;

  const families = normalizeFamilies(selectedRows.map((row) => row.family));

  if (families.length === 0) {
    return fallback;
  }

  const poaTypeFromRow = sortedRows.find((row) => row.family === "poa")?.default_document_type;
  const trustTypeFromRow = sortedRows.find(
    (row) => row.family === "trust",
  )?.default_document_type;
  const idnTypeFromRow = sortedRows.find((row) => row.family === "idn")?.default_document_type;

  return {
    modeKey,
    families,
    poaType:
      poaTypeFromRow && isPoaDocumentType(poaTypeFromRow)
        ? poaTypeFromRow
        : fallback.poaType,
    trustType:
      trustTypeFromRow && isTrustDocumentType(trustTypeFromRow)
        ? trustTypeFromRow
        : fallback.trustType,
    idnType:
      idnTypeFromRow && isIdnDocumentType(idnTypeFromRow)
        ? idnTypeFromRow
        : fallback.idnType,
  };
};

export const listProductFlowModes = async (): Promise<ProductFlowModeDefinition[]> => {
  const modeRows = await listModeRows();
  const modeIds = modeRows.map((mode) => mode.id);

  const [familyRows, outputRows, uiRows] = await Promise.all([
    listModeFamilyRows(modeIds),
    listModeOutputRows(modeIds),
    listModeUiRows(modeIds),
  ]);

  return mapModeRowsToDefinitions(modeRows, familyRows, outputRows, uiRows);
};

export const getProductFlowMode = async (
  modeKey: string,
): Promise<ProductFlowModeDefinition | null> => {
  const modeRows = await listModeRows();
  const mode = modeRows.find((row) => row.mode_key === modeKey);

  if (!mode) {
    return null;
  }

  const [familyRows, outputRows, uiRows] = await Promise.all([
    listModeFamilyRows([mode.id]),
    listModeOutputRows([mode.id]),
    listModeUiRows([mode.id]),
  ]);

  const modes = mapModeRowsToDefinitions([mode], familyRows, outputRows, uiRows);
  return modes[0] ?? null;
};

export const buildSelectionForMode = async (
  modeKey?: string,
): Promise<ProductFlowModeSelection> => {
  try {
    const requestedModeKey = modeKey?.trim();
    const resolvedModeKey = requestedModeKey || (await getDefaultModeKeyFromDatabase()) || defaultProductFlowModeKey;
    const modeFamilyRows = await getModeFamilyRowsByKey(resolvedModeKey);

    if (!modeFamilyRows) {
      return buildFallbackSelection(resolvedModeKey);
    }

    return buildSelectionFromRows(modeFamilyRows.modeKey, modeFamilyRows.rows);
  } catch {
    return buildFallbackSelection(modeKey);
  }
};

export const getDefaultProductFlowModeSelection = async (): Promise<ProductFlowModeSelection> => {
  return buildSelectionForMode();
};

export const getJurisdictionsForMode = async (
  modeKey?: string,
): Promise<ProductFlowJurisdictionOption[]> => {
  const selection = await buildSelectionForMode(modeKey);
  const lists: ProductFlowJurisdictionOption[][] = [];

  if (selection.families.includes("poa")) {
    lists.push(await listPoaJurisdictions(selection.poaType));
  }

  if (selection.families.includes("trust")) {
    lists.push(await listTrustJurisdictions(selection.trustType));
  }

  if (selection.families.includes("idn")) {
    lists.push(await listIdnJurisdictions(selection.idnType));
  }

  return intersectJurisdictionLists(lists);
};

export const resolveExpectedOutputsForMode = async (
  modeKey?: string,
): Promise<ProductFlowModeOutputDefinition[]> => {
  const selection = await buildSelectionForMode(modeKey);
  const mode = await getProductFlowMode(selection.modeKey);

  if (!mode || mode.outputs.length === 0) {
    return [];
  }

  return mode.outputs.map((output) => ({
    outputKey: output.outputKey,
    outputLabel: output.outputLabel,
    isRequired: output.isRequired,
    sortOrder: output.sortOrder,
    metadata: output.metadata,
  }));
};
