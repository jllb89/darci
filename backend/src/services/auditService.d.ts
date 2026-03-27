type AuditEventInput = {
    actorSupabaseId?: string;
    actorRole?: string;
    entityType: string;
    entityId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
};
export declare const recordAuditEvent: (input: AuditEventInput) => Promise<void>;
type AuditEventRecord = {
    id: string;
    actor_id: string | null;
    entity_type: string;
    entity_id: string | null;
    action: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
};
export declare const listRecentAuditEventsForDocumentIds: (documentIds: string[], limit?: number, actorId?: string) => Promise<AuditEventRecord[]>;
export {};
//# sourceMappingURL=auditService.d.ts.map