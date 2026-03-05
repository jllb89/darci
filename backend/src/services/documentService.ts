import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

type UserRecord = {
  id: string;
  supabase_user_id: string | null;
  email: string | null;
  role: string | null;
};

type DocumentRecord = {
  id: string;
  owner_id: string;
  idn: string | null;
  status: string | null;
  document_type: string | null;
  jurisdiction: string | null;
  created_at: string;
};

type DocumentVersionRecord = {
  id: string;
  document_id: string;
  version: number;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  is_final: boolean | null;
  created_by: string | null;
  created_at: string;
};

type SignatureRecord = {
  id: string;
  document_id: string;
  signer_id: string | null;
  signature_type: string | null;
  storage_path: string | null;
  created_at: string;
};

const fetchUserBySupabaseId = async (supabaseUserId: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email, role")
    .eq("supabase_user_id", supabaseUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserRecord | null;
};

export const getUserIdBySupabaseId = async (supabaseUserId: string) => {
  const user = await fetchUserBySupabaseId(supabaseUserId);
  return user?.id ?? null;
};

export const getOrCreateUserId = async (
  supabaseUserId: string,
  email?: string,
  role?: string
) => {
  const existing = await fetchUserBySupabaseId(supabaseUserId);
  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      supabase_user_id: supabaseUserId,
      email: email ?? null,
      role: role ?? "member",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to create user record");
  }

  return data.id as string;
};

export const createDocumentWithVersion = async (input: {
  documentId: string;
  ownerId: string;
  documentType: string | null;
  jurisdiction: string | null;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}) => {
  const { data: document, error: documentError } = await supabaseAdmin
    .from("documents")
    .insert({
      id: input.documentId,
      owner_id: input.ownerId,
      idn: null,
      status: "draft",
      document_type: input.documentType,
      jurisdiction: input.jurisdiction,
    })
    .select("id, owner_id, idn, status, document_type, jurisdiction, created_at")
    .single();

  if (documentError || !document) {
    throw new Error(documentError?.message ?? "Failed to create document");
  }

  const { data: version, error: versionError } = await supabaseAdmin
    .from("document_versions")
    .insert({
      document_id: document.id,
      version: 1,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.fileSize,
      is_final: false,
      created_by: input.ownerId,
    })
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at"
    )
    .single();

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Failed to create document version");
  }

  return {
    document: document as DocumentRecord,
    version: version as DocumentVersionRecord,
  };
};

export const getDocumentById = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, idn, status, document_type, jurisdiction, created_at")
    .eq("id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentRecord | null;
};

export const listDocuments = async (ownerId?: string) => {
  let query = supabaseAdmin
    .from("documents")
    .select("id, owner_id, idn, status, document_type, jurisdiction, created_at")
    .order("created_at", { ascending: false });

  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentRecord[];
};

export const getDocumentVersionById = async (
  documentVersionId: string,
  documentId: string
) => {
  const { data, error } = await supabaseAdmin
    .from("document_versions")
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at"
    )
    .eq("id", documentVersionId)
    .eq("document_id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentVersionRecord | null;
};

export const listDocumentVersions = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_versions")
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at"
    )
    .eq("document_id", documentId)
    .order("version", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentVersionRecord[];
};

export const updateDocumentVersion = async (
  documentVersionId: string,
  updates: Partial<
    Pick<
      DocumentVersionRecord,
      "storage_path" | "file_name" | "mime_type" | "size_bytes" | "is_final"
    >
  >
) => {
  const { data, error } = await supabaseAdmin
    .from("document_versions")
    .update(updates)
    .eq("id", documentVersionId)
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update document version");
  }

  return data as DocumentVersionRecord;
};

export const updateDocument = async (
  documentId: string,
  updates: Partial<Pick<DocumentRecord, "idn" | "status" | "document_type" | "jurisdiction">>
) => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .update(updates)
    .eq("id", documentId)
    .select("id, owner_id, idn, status, document_type, jurisdiction, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update document");
  }

  return data as DocumentRecord;
};

export const createSignatureRecord = async (input: {
  signatureId: string;
  documentId: string;
  signerId: string | null;
  storagePath: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("signatures")
    .insert({
      id: input.signatureId,
      document_id: input.documentId,
      signer_id: input.signerId,
      signature_type: "member",
      storage_path: input.storagePath,
    })
    .select("id, document_id, signer_id, signature_type, storage_path, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create signature record");
  }

  return data as SignatureRecord;
};

export const getSignatureById = async (
  signatureId: string,
  documentId: string
) => {
  const { data, error } = await supabaseAdmin
    .from("signatures")
    .select("id, document_id, signer_id, signature_type, storage_path, created_at")
    .eq("id", signatureId)
    .eq("document_id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as SignatureRecord | null;
};

export const prepareDocumentForSigning = async (documentId: string) => {
  return { documentId, status: "pending_signature" };
};

export const appendAcknowledgmentPage = async (documentId: string) => {
  return { documentId, status: "acknowledgment_appended" };
};

export const watermarkWithNotice = async (documentId: string) => {
  return { documentId, status: "watermarked" };
};
