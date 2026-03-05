export type UserRole = "member" | "notary" | "admin";
export type DocumentStatus = "draft" | "pending_signature" | "pending_notary" | "notarized";
export type NotarizationStatus = "pending" | "in_review" | "completed" | "rejected";
export type User = {
    id: string;
    email?: string;
    role: UserRole;
    status: "active" | "suspended";
    createdAt: string;
};
export type Document = {
    id: string;
    ownerId: string;
    idn: string;
    status: DocumentStatus;
    createdAt: string;
};
export type DocumentVersion = {
    id: string;
    documentId: string;
    version: number;
    storagePath?: string;
    createdAt: string;
};
export type NotarizationRequest = {
    id: string;
    documentId: string;
    assignedNotaryId?: string;
    status: NotarizationStatus;
    submittedAt?: string;
    createdAt: string;
};
export type IlluminotarizationCode = {
    id: string;
    requestId: string;
    code: string;
    expiresAt?: string;
    consumedAt?: string;
    createdAt: string;
};
export type Signature = {
    id: string;
    documentId: string;
    signerId?: string;
    signatureType: "member" | "notary";
    storagePath?: string;
    createdAt: string;
};
export type AcknowledgmentPage = {
    id: string;
    documentId: string;
    jurisdiction?: string;
    content?: string;
    createdAt: string;
};
export type LedgerEntry = {
    id: string;
    documentId: string;
    idn: string;
    hash: string;
    ledgerTxId?: string;
    anchoredAt?: string;
    createdAt: string;
};
export type AuditEvent = {
    id: string;
    actorId?: string;
    entityType: string;
    entityId?: string;
    action: string;
    metadata: Record<string, unknown>;
    createdAt: string;
};
