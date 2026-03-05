import { Request, Response } from "express";
import { getOrCreateUserId, listDocuments } from "../services/documentService";
import { listRecentAuditEventsForDocumentIds } from "../services/auditService";

const ACTIVITY_LIMIT = 20;

const resolveDocumentId = (event: {
  entity_type: string;
  entity_id: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const metadata = event.metadata ?? undefined;
  const fromMetadata = metadata?.document_id as string | undefined;
  if (fromMetadata) {
    return fromMetadata;
  }
  if (event.entity_type === "document") {
    return event.entity_id ?? null;
  }
  return null;
};

export const getMemberDashboard = async (req: Request, res: Response) => {
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
    : await getOrCreateUserId(req.user.id, req.user.email, req.user.role);

  const documents = await listDocuments(ownerId);
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
    } else if (doc.status === "pending_signature") {
      counts.pendingSignature += 1;
    } else if (doc.status === "pending_notary") {
      counts.pendingNotary += 1;
    } else if (doc.status === "completed") {
      counts.completed += 1;
    }
  }

  const auditEvents = documentIds.length
    ? await listRecentAuditEventsForDocumentIds(
        documentIds,
        ACTIVITY_LIMIT,
        ownerId
      )
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
