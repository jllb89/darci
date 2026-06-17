import { Request, Response } from "express";
import { z } from "zod";
import {
  approveNotaryApplication,
  getMyNotaryProfile,
  listMyNotaryApplication,
  listNotaryApplications,
  rejectNotaryApplication,
  submitNotaryApplication,
  upsertMyNotaryProfile,
  type NotaryServiceAreaKind,
} from "../services/notaryProfileService";
import {
  queueNotaryApplicationApprovedNotification,
  queueNotaryApplicationRejectedNotification,
  queueNotaryApplicationSubmittedAdminNotification,
} from "../services/notificationService";
import { runDueNotificationJobs } from "../services/notificationOutboxService";
import { sendValidationError } from "../utils/validation";

const serviceAreaKindSchema = z.enum([
  "county",
  "parish",
  "borough",
  "district",
  "city",
  "metro",
  "region",
  "state",
  "other",
]);

const notaryAssetDataUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_000_000)
  .refine(
    (value) => /^data:image\/(?:png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(value),
    "Signature and seal images must be PNG or JPEG data URLs",
  )
  .optional()
  .nullable();

const notaryApplicationSchema = z.object({
  jurisdiction: z.string().trim().min(1).max(120),
  serviceAreaKind: serviceAreaKindSchema,
  serviceAreaName: z.string().trim().min(1).max(120),
  commissionNumber: z.string().trim().min(1).max(120),
  commissionExpiresAt: z.string().datetime(),
  signatureDataUrl: notaryAssetDataUrlSchema,
  sealDataUrl: notaryAssetDataUrlSchema,
});

const notaryProfileSchema = z.object({
  jurisdiction: z.string().trim().min(1).max(120),
  serviceAreaKind: serviceAreaKindSchema,
  serviceAreaName: z.string().trim().min(1).max(120),
  commissionNumber: z.string().trim().min(1).max(120),
  commissionExpiresAt: z.string().datetime(),
  signatureDataUrl: notaryAssetDataUrlSchema,
  sealDataUrl: notaryAssetDataUrlSchema,
});

const applicationReviewSchema = z.object({
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
});

const getUserSupabaseId = (req: Request) => req.user?.id ?? null;

const ensureAuthenticated = (req: Request, res: Response) => {
  const supabaseUserId = getUserSupabaseId(req);
  if (!supabaseUserId) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
    return null;
  }

  return supabaseUserId;
};

const handleServiceError = (res: Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && "statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number") {
    return res.status((error as { statusCode: number }).statusCode).json({
      error: (error as { statusCode: number }).statusCode >= 500 ? "internal_error" : "validation_error",
      message: error.message,
    });
  }

  return res.status(500).json({
    error: "internal_error",
    message: error instanceof Error ? error.message : fallbackMessage,
  });
};

const processNotaryDecisionNotification = async (input: {
  applicationId: string;
  notificationType: "approved" | "rejected";
  notificationResult: { jobId: string } | null;
}) => {
  if (!input.notificationResult?.jobId) {
    return;
  }

  try {
    const result = await runDueNotificationJobs({
      limit: 1,
      workerId: `notary-application-${input.notificationType}-inline`,
      notificationJobIds: [input.notificationResult.jobId],
    });

    if (result.processedCount === 0) {
      console.warn("Notary application decision notification was queued but not processed", {
        applicationId: input.applicationId,
        notificationType: input.notificationType,
        notificationJobId: input.notificationResult.jobId,
        scannedCount: result.scannedCount,
        claimedCount: result.claimedCount,
      });
    }
  } catch (error) {
    console.error("Failed to process notary application decision notification", {
      applicationId: input.applicationId,
      notificationType: input.notificationType,
      notificationJobId: input.notificationResult.jobId,
      error: error instanceof Error ? error.message : error,
    });
  }
};

const mapNotaryProfile = (profile: Awaited<ReturnType<typeof getMyNotaryProfile>>) => {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    userId: profile.userId,
    jurisdiction: profile.jurisdiction,
    serviceAreaKind: profile.serviceAreaKind,
    serviceAreaName: profile.serviceAreaName,
    commissionNumber: profile.commissionNumber,
    commissionExpiresAt: profile.commissionExpiresAt,
    sealStoragePath: profile.sealStoragePath,
    signatureDataUrl: profile.signatureDataUrl,
    sealDataUrl: profile.sealDataUrl,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

const mapNotaryApplication = (application: Awaited<ReturnType<typeof listMyNotaryApplication>>) => {
  if (!application) {
    return null;
  }

  return {
    id: application.id,
    userId: application.userId,
    jurisdiction: application.jurisdiction,
    serviceAreaKind: application.serviceAreaKind,
    serviceAreaName: application.serviceAreaName,
    commissionNumber: application.commissionNumber,
    commissionExpiresAt: application.commissionExpiresAt,
    signatureDataUrl: application.signatureDataUrl,
    sealDataUrl: application.sealDataUrl,
    status: application.status,
    reviewNotes: application.reviewNotes,
    reviewedByUserId: application.reviewedByUserId,
    reviewedAt: application.reviewedAt,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
};

export const getMyNotaryApplication = async (req: Request, res: Response) => {
  const supabaseUserId = ensureAuthenticated(req, res);
  if (!supabaseUserId) {
    return;
  }

  try {
    const application = await listMyNotaryApplication(supabaseUserId);
    return res.status(200).json({ application: mapNotaryApplication(application) });
  } catch (error) {
    return handleServiceError(res, error, "Failed to load notary application");
  }
};

export const submitMyNotaryApplication = async (req: Request, res: Response) => {
  const supabaseUserId = ensureAuthenticated(req, res);
  if (!supabaseUserId) {
    return;
  }

  const parsed = notaryApplicationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const application = await submitNotaryApplication({
      supabaseUserId,
      jurisdiction: parsed.data.jurisdiction,
      serviceAreaKind: parsed.data.serviceAreaKind,
      serviceAreaName: parsed.data.serviceAreaName,
      commissionNumber: parsed.data.commissionNumber,
      commissionExpiresAt: parsed.data.commissionExpiresAt,
      signatureDataUrl: parsed.data.signatureDataUrl ?? null,
      sealDataUrl: parsed.data.sealDataUrl ?? null,
    });

    await queueNotaryApplicationSubmittedAdminNotification({
      applicationId: application.id,
      applicantUserId: application.userId,
      jurisdiction: application.jurisdiction,
      serviceAreaKind: application.serviceAreaKind,
      serviceAreaName: application.serviceAreaName,
      submittedAt: application.updatedAt,
      requestedBySupabaseUserId: supabaseUserId,
    });

    return res.status(200).json({ application: mapNotaryApplication(application) });
  } catch (error) {
    return handleServiceError(res, error, "Failed to submit notary application");
  }
};

export const getMyNotaryProfileHandler = async (req: Request, res: Response) => {
  const supabaseUserId = ensureAuthenticated(req, res);
  if (!supabaseUserId) {
    return;
  }

  try {
    const profile = await getMyNotaryProfile(supabaseUserId);
    return res.status(200).json({ profile: mapNotaryProfile(profile) });
  } catch (error) {
    return handleServiceError(res, error, "Failed to load notary profile");
  }
};

export const updateMyNotaryProfileHandler = async (req: Request, res: Response) => {
  const supabaseUserId = ensureAuthenticated(req, res);
  if (!supabaseUserId) {
    return;
  }

  const parsed = notaryProfileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const profile = await upsertMyNotaryProfile({
      supabaseUserId,
      jurisdiction: parsed.data.jurisdiction,
      serviceAreaKind: parsed.data.serviceAreaKind,
      serviceAreaName: parsed.data.serviceAreaName,
      commissionNumber: parsed.data.commissionNumber,
      commissionExpiresAt: parsed.data.commissionExpiresAt,
      signatureDataUrl: parsed.data.signatureDataUrl ?? null,
      sealDataUrl: parsed.data.sealDataUrl ?? null,
    });

    return res.status(200).json({ profile: mapNotaryProfile(profile) });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update notary profile");
  }
};

const mapAdminApplicationRow = (row: Awaited<ReturnType<typeof listNotaryApplications>>[number]) => ({
  id: row.application.id,
  userId: row.application.userId,
  status: row.application.status,
  jurisdiction: row.application.jurisdiction,
  serviceAreaKind: row.application.serviceAreaKind,
  serviceAreaName: row.application.serviceAreaName,
  commissionNumber: row.application.commissionNumber,
  commissionExpiresAt: row.application.commissionExpiresAt,
  signatureDataUrl: row.application.signatureDataUrl,
  sealDataUrl: row.application.sealDataUrl,
  reviewNotes: row.application.reviewNotes,
  reviewedByUserId: row.application.reviewedByUserId,
  reviewedAt: row.application.reviewedAt,
  createdAt: row.application.createdAt,
  updatedAt: row.application.updatedAt,
  user: row.user,
});

export const listNotaryApplicationsAdminHandler = async (_req: Request, res: Response) => {
  try {
    const applications = await listNotaryApplications();
    return res.status(200).json({
      applications: applications.map(mapAdminApplicationRow),
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to load notary applications");
  }
};

export const approveNotaryApplicationAdminHandler = async (req: Request, res: Response) => {
  const supabaseUserId = ensureAuthenticated(req, res);
  if (!supabaseUserId) {
    return;
  }

  const parsed = applicationReviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await approveNotaryApplication({
      applicationId: String(req.params.id),
      reviewedBySupabaseUserId: supabaseUserId,
      reviewNotes: parsed.data.reviewNotes ?? null,
    });

    const notificationResult = await queueNotaryApplicationApprovedNotification({
      applicationId: result.application.id,
      userId: result.applicant.id,
      reviewedBySupabaseUserId: supabaseUserId,
      reviewNotes: parsed.data.reviewNotes ?? null,
    });

    await processNotaryDecisionNotification({
      applicationId: result.application.id,
      notificationType: "approved",
      notificationResult,
    });

    return res.status(200).json({
      application: mapAdminApplicationRow({
        application: result.application,
        user: {
          id: result.applicant.id,
          supabaseUserId: result.applicant.supabaseUserId,
          email: result.applicant.email,
          phone: result.applicant.phone,
          firstName: result.applicant.firstName,
          lastName: result.applicant.lastName,
        },
      }),
      profile: mapNotaryProfile(result.profile),
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to approve notary application");
  }
};

export const rejectNotaryApplicationAdminHandler = async (req: Request, res: Response) => {
  const supabaseUserId = ensureAuthenticated(req, res);
  if (!supabaseUserId) {
    return;
  }

  const parsed = applicationReviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const application = await rejectNotaryApplication({
      applicationId: String(req.params.id),
      reviewedBySupabaseUserId: supabaseUserId,
      reviewNotes: parsed.data.reviewNotes ?? null,
    });

    const notificationResult = await queueNotaryApplicationRejectedNotification({
      applicationId: application.id,
      userId: application.userId,
      reviewedBySupabaseUserId: supabaseUserId,
      reviewNotes: parsed.data.reviewNotes ?? null,
    });

    await processNotaryDecisionNotification({
      applicationId: application.id,
      notificationType: "rejected",
      notificationResult,
    });

    return res.status(200).json({ application: mapNotaryApplication(application) });
  } catch (error) {
    return handleServiceError(res, error, "Failed to reject notary application");
  }
};
