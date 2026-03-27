"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watermarkWithNotice = exports.appendAcknowledgmentPage = exports.prepareDocumentForSigning = exports.getSignatureById = exports.createSignatureRecord = exports.updateNotarizationRequest = exports.getNotarizationRequestById = exports.updateNotarizationCode = exports.getNotarizationCodeByValue = exports.createNotarizationCode = exports.createNotarizationRequest = exports.getActiveNotarizationRequest = exports.updateDocument = exports.updateDocumentVersion = exports.listDocumentVersions = exports.getDocumentVersionById = exports.listDocuments = exports.getDocumentById = exports.createDocumentWithVersion = exports.getOrCreateUserId = exports.getUserIdBySupabaseId = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const fetchUserBySupabaseId = async (supabaseUserId) => {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, supabase_user_id, email, role")
        .eq("supabase_user_id", supabaseUserId)
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
const getUserIdBySupabaseId = async (supabaseUserId) => {
    const user = await fetchUserBySupabaseId(supabaseUserId);
    return user?.id ?? null;
};
exports.getUserIdBySupabaseId = getUserIdBySupabaseId;
const getOrCreateUserId = async (supabaseUserId, email, role) => {
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
    return data.id;
};
exports.getOrCreateUserId = getOrCreateUserId;
const createDocumentWithVersion = async (input) => {
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
        .select("id, owner_id, idn, status, document_type, jurisdiction, created_at, updated_at")
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
        .select("id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at")
        .single();
    if (versionError || !version) {
        throw new Error(versionError?.message ?? "Failed to create document version");
    }
    return {
        document: document,
        version: version,
    };
};
exports.createDocumentWithVersion = createDocumentWithVersion;
const getDocumentById = async (documentId) => {
    const { data, error } = await supabaseAdmin
        .from("documents")
        .select("id, owner_id, idn, status, document_type, jurisdiction, created_at, updated_at")
        .eq("id", documentId)
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
exports.getDocumentById = getDocumentById;
const listDocuments = async (ownerId) => {
    let query = supabaseAdmin
        .from("documents")
        .select("id, owner_id, idn, status, document_type, jurisdiction, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
    if (ownerId) {
        query = query.eq("owner_id", ownerId);
    }
    const { data, error } = await query;
    if (error) {
        throw new Error(error.message);
    }
    return (data ?? []);
};
exports.listDocuments = listDocuments;
const getDocumentVersionById = async (documentVersionId, documentId) => {
    const { data, error } = await supabaseAdmin
        .from("document_versions")
        .select("id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at")
        .eq("id", documentVersionId)
        .eq("document_id", documentId)
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
exports.getDocumentVersionById = getDocumentVersionById;
const listDocumentVersions = async (documentId) => {
    const { data, error } = await supabaseAdmin
        .from("document_versions")
        .select("id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at")
        .eq("document_id", documentId)
        .order("version", { ascending: true });
    if (error) {
        throw new Error(error.message);
    }
    return (data ?? []);
};
exports.listDocumentVersions = listDocumentVersions;
const updateDocumentVersion = async (documentVersionId, updates) => {
    const { data, error } = await supabaseAdmin
        .from("document_versions")
        .update(updates)
        .eq("id", documentVersionId)
        .select("id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at")
        .single();
    if (error || !data) {
        throw new Error(error?.message ?? "Failed to update document version");
    }
    return data;
};
exports.updateDocumentVersion = updateDocumentVersion;
const updateDocument = async (documentId, updates) => {
    const updatesWithTimestamp = {
        ...updates,
        updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
        .from("documents")
        .update(updatesWithTimestamp)
        .eq("id", documentId)
        .select("id, owner_id, idn, status, document_type, jurisdiction, created_at, updated_at")
        .single();
    if (error || !data) {
        throw new Error(error?.message ?? "Failed to update document");
    }
    return data;
};
exports.updateDocument = updateDocument;
const getActiveNotarizationRequest = async (documentId) => {
    const { data, error } = await supabaseAdmin
        .from("notarization_requests")
        .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
        .eq("document_id", documentId)
        .in("status", ["pending", "in_review"])
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
exports.getActiveNotarizationRequest = getActiveNotarizationRequest;
const createNotarizationRequest = async (input) => {
    const { data, error } = await supabaseAdmin
        .from("notarization_requests")
        .insert({
        document_id: input.documentId,
        status: "pending",
        submitted_at: input.submittedAt,
    })
        .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
        .single();
    if (error || !data) {
        throw new Error(error?.message ?? "Failed to create notarization request");
    }
    return data;
};
exports.createNotarizationRequest = createNotarizationRequest;
const createNotarizationCode = async (input) => {
    const { data, error } = await supabaseAdmin
        .from("illuminotarization_codes")
        .insert({
        request_id: input.requestId,
        code: input.code,
        status: "active",
        expires_at: input.expiresAt,
    })
        .select("id, request_id, code, status, expires_at, consumed_at, created_at")
        .single();
    if (error || !data) {
        throw new Error(error?.message ?? "Failed to create notarization code");
    }
    return data;
};
exports.createNotarizationCode = createNotarizationCode;
const getNotarizationCodeByValue = async (code) => {
    const { data, error } = await supabaseAdmin
        .from("illuminotarization_codes")
        .select("id, request_id, code, status, expires_at, consumed_at, created_at")
        .eq("code", code)
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
exports.getNotarizationCodeByValue = getNotarizationCodeByValue;
const updateNotarizationCode = async (codeId, updates) => {
    const { data, error } = await supabaseAdmin
        .from("illuminotarization_codes")
        .update(updates)
        .eq("id", codeId)
        .select("id, request_id, code, status, expires_at, consumed_at, created_at")
        .single();
    if (error || !data) {
        throw new Error(error?.message ?? "Failed to update notarization code");
    }
    return data;
};
exports.updateNotarizationCode = updateNotarizationCode;
const getNotarizationRequestById = async (requestId) => {
    const { data, error } = await supabaseAdmin
        .from("notarization_requests")
        .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
        .eq("id", requestId)
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
exports.getNotarizationRequestById = getNotarizationRequestById;
const updateNotarizationRequest = async (requestId, updates) => {
    const { data, error } = await supabaseAdmin
        .from("notarization_requests")
        .update(updates)
        .eq("id", requestId)
        .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
        .single();
    if (error || !data) {
        throw new Error(error?.message ?? "Failed to update notarization request");
    }
    return data;
};
exports.updateNotarizationRequest = updateNotarizationRequest;
const createSignatureRecord = async (input) => {
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
    return data;
};
exports.createSignatureRecord = createSignatureRecord;
const getSignatureById = async (signatureId, documentId) => {
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
    return data;
};
exports.getSignatureById = getSignatureById;
const prepareDocumentForSigning = async (documentId) => {
    return { documentId, status: "pending_signature" };
};
exports.prepareDocumentForSigning = prepareDocumentForSigning;
const appendAcknowledgmentPage = async (documentId) => {
    return { documentId, status: "acknowledgment_appended" };
};
exports.appendAcknowledgmentPage = appendAcknowledgmentPage;
const watermarkWithNotice = async (documentId) => {
    return { documentId, status: "watermarked" };
};
exports.watermarkWithNotice = watermarkWithNotice;
//# sourceMappingURL=documentService.js.map