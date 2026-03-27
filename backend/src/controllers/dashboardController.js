"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMemberDashboard = void 0;
const documentService_1 = require("../services/documentService");
const auditService_1 = require("../services/auditService");
const ACTIVITY_LIMIT = 20;
const resolveDocumentId = (event) => {
    const metadata = event.metadata ?? undefined;
    const fromMetadata = metadata?.document_id;
    if (fromMetadata) {
        return fromMetadata;
    }
    if (event.entity_type === "document") {
        return event.entity_id ?? null;
    }
    return null;
};
const getMemberDashboard = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            error: "unauthorized",
            message: "Missing user context",
        });
    }
    const memberIdParam = req.query.memberId;
    if (memberIdParam && typeof memberIdParam !== "string") {
        return res.status(400).json({
            error: "validation_error",
            message: "memberId must be a string",
            details: [
                {
                    path: "memberId",
                    message: "memberId must be a string",
                },
            ],
        });
    }
    const role = req.user.role ?? "member";
    const canImpersonate = role === "admin" || role === "service_role";
    if (memberIdParam && !canImpersonate) {
        return res.status(403).json({
            error: "forbidden",
            message: "Insufficient permissions",
        });
    }
    const ownerId = memberIdParam
        ? memberIdParam
        : await (0, documentService_1.getOrCreateUserId)(req.user.id, req.user.email, req.user.role);
    const documents = await (0, documentService_1.listDocuments)(ownerId);
    const documentIds = documents.map((doc) => doc.id);
    const counts = {
        draft: 0,
        pendingSignature: 0,
        pendingNotary: 0,
        completed: 0,
        total: documents.length,
    };
    for (const doc of documents) {
        if (doc.status === "draft") {
            counts.draft += 1;
        }
        else if (doc.status === "pending_signature") {
            counts.pendingSignature += 1;
        }
        else if (doc.status === "pending_notary") {
            counts.pendingNotary += 1;
        }
        else if (doc.status === "completed") {
            counts.completed += 1;
        }
    }
    const auditEvents = documentIds.length
        ? await (0, auditService_1.listRecentAuditEventsForDocumentIds)(documentIds, ACTIVITY_LIMIT, ownerId)
        : [];
    const activity = auditEvents.map((event) => ({
        action: event.action,
        timestamp: event.created_at,
        documentId: resolveDocumentId(event),
        entityType: event.entity_type,
        entityId: event.entity_id,
    }));
    res.status(200).json({
        documents: documents.map((doc) => ({
            id: doc.id,
            idn: doc.idn,
            status: doc.status,
            documentType: doc.document_type,
            jurisdiction: doc.jurisdiction,
            createdAt: doc.created_at,
        })),
        activity,
        counts,
    });
};
exports.getMemberDashboard = getMemberDashboard;
//# sourceMappingURL=dashboardController.js.map