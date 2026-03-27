type DocumentRecord = {
    id: string;
    owner_id: string;
    idn: string | null;
    status: string | null;
    document_type: string | null;
    jurisdiction: string | null;
    created_at: string;
    updated_at: string | null;
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
type NotarizationRequestRecord = {
    id: string;
    document_id: string;
    assigned_notary_id: string | null;
    status: string | null;
    submitted_at: string | null;
    created_at: string;
};
type NotarizationCodeRecord = {
    id: string;
    request_id: string;
    code: string;
    status: string | null;
    expires_at: string | null;
    consumed_at: string | null;
    created_at: string;
};
export declare const getUserIdBySupabaseId: (supabaseUserId: string) => Promise<string | null>;
export declare const getOrCreateUserId: (supabaseUserId: string, email?: string, role?: string) => Promise<string>;
export declare const createDocumentWithVersion: (input: {
    documentId: string;
    ownerId: string;
    documentType: string | null;
    jurisdiction: string | null;
    storagePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
}) => Promise<{
    document: DocumentRecord;
    version: DocumentVersionRecord;
}>;
export declare const getDocumentById: (documentId: string) => Promise<DocumentRecord | null>;
export declare const listDocuments: (ownerId?: string) => Promise<DocumentRecord[]>;
export declare const getDocumentVersionById: (documentVersionId: string, documentId: string) => Promise<DocumentVersionRecord | null>;
export declare const listDocumentVersions: (documentId: string) => Promise<DocumentVersionRecord[]>;
export declare const updateDocumentVersion: (documentVersionId: string, updates: Partial<Pick<DocumentVersionRecord, "storage_path" | "file_name" | "mime_type" | "size_bytes" | "is_final">>) => Promise<DocumentVersionRecord>;
export declare const updateDocument: (documentId: string, updates: Partial<Pick<DocumentRecord, "idn" | "status" | "document_type" | "jurisdiction">>) => Promise<DocumentRecord>;
export declare const getActiveNotarizationRequest: (documentId: string) => Promise<NotarizationRequestRecord | null>;
export declare const createNotarizationRequest: (input: {
    documentId: string;
    submittedAt: string;
}) => Promise<NotarizationRequestRecord>;
export declare const createNotarizationCode: (input: {
    requestId: string;
    code: string;
    expiresAt: string;
}) => Promise<NotarizationCodeRecord>;
export declare const getNotarizationCodeByValue: (code: string) => Promise<NotarizationCodeRecord | null>;
export declare const updateNotarizationCode: (codeId: string, updates: Partial<Pick<NotarizationCodeRecord, "status" | "consumed_at">>) => Promise<NotarizationCodeRecord>;
export declare const getNotarizationRequestById: (requestId: string) => Promise<NotarizationRequestRecord | null>;
export declare const updateNotarizationRequest: (requestId: string, updates: Partial<Pick<NotarizationRequestRecord, "assigned_notary_id" | "status">>) => Promise<NotarizationRequestRecord>;
export declare const createSignatureRecord: (input: {
    signatureId: string;
    documentId: string;
    signerId: string | null;
    storagePath: string;
}) => Promise<SignatureRecord>;
export declare const getSignatureById: (signatureId: string, documentId: string) => Promise<SignatureRecord | null>;
export declare const prepareDocumentForSigning: (documentId: string) => Promise<{
    documentId: string;
    status: string;
}>;
export declare const appendAcknowledgmentPage: (documentId: string) => Promise<{
    documentId: string;
    status: string;
}>;
export declare const watermarkWithNotice: (documentId: string) => Promise<{
    documentId: string;
    status: string;
}>;
export {};
//# sourceMappingURL=documentService.d.ts.map