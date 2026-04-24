import { Request, Response } from "express";
import { z } from "zod";
import { recordAuditEvent } from "../services/auditService";
import {
  NotificationTemplateRenderError,
  renderNotificationTemplate,
} from "../services/notificationTemplateRenderService";
import {
  buildNotificationTemplatePreviewSource,
  getNotificationTemplateById,
  listNotificationTemplatesForAdmin,
  NotificationTemplateAdminServiceError,
  type PreviewNotificationTemplateInput,
  type NotificationTemplateAdminRecord,
  updateNotificationTemplate,
  type UpdateNotificationTemplateInput,
} from "../services/notificationTemplateAdminService";
import { sendValidationError } from "../utils/validation";

const templateIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const listTemplatesQuerySchema = z
  .object({
    channel: z.enum(["email", "sms", "in_app"]).optional(),
    locale: z.string().trim().min(1).optional(),
    templateKey: z.string().trim().min(1).optional(),
    includeInactive: z.enum(["true", "false"]).optional(),
  })
  .passthrough();

const variablesSchemaSchema = z
  .object({
    required: z.array(z.string().trim().min(1)).optional(),
    optional: z.array(z.string().trim().min(1)).optional(),
  })
  .passthrough();

const jsonObjectSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

const updateTemplateBodySchema = z
  .object({
    subjectTemplate: z.union([z.string().trim().min(1), z.null()]).optional(),
    bodyTemplate: z.string().trim().min(1).optional(),
    bodyFormat: z.enum(["text", "markdown", "html"]).optional(),
    variablesSchema: variablesSchemaSchema.optional(),
    isActive: z.boolean().optional(),
    sourceReference: z.union([z.string().trim().min(1), z.null()]).optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: "At least one update field is required",
      });
    }
  });

const previewTemplateBodySchema = z.object({
  subjectTemplate: z.union([z.string().trim().min(1), z.null()]).optional(),
  bodyTemplate: z.string().trim().min(1).optional(),
  bodyFormat: z.enum(["text", "markdown", "html"]).optional(),
  payload: jsonObjectSchema.default({}),
  recipientEmail: z.union([z.string().email(), z.null()]).optional(),
  recipientDisplayName: z.union([z.string().trim().min(1), z.null()]).optional(),
});

const hasOwn = <T extends object>(value: T, key: string) => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const toApiTemplate = (template: NotificationTemplateAdminRecord) => {
  return {
    id: template.id,
    templateKey: template.templateKey,
    templateVersion: template.templateVersion,
    locale: template.locale,
    channel: template.channel,
    templateKind: template.templateKind,
    audienceScope: template.audienceScope,
    triggerEvent: template.triggerEvent,
    inviteKind: template.inviteKind,
    subjectTemplate: template.subjectTemplate,
    bodyTemplate: template.bodyTemplate,
    bodyFormat: template.bodyFormat,
    variablesSchema: template.variablesSchema,
    isActive: template.isActive,
    sourceReference: template.sourceReference,
    metadata: template.metadata,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
};

const sendServiceError = (res: Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof NotificationTemplateRenderError) {
    return res.status(400).json({
      error: "bad_request",
      message: error.message,
    });
  }

  if (error instanceof NotificationTemplateAdminServiceError) {
    const errorCode = error.statusCode === 404 ? "not_found" : "bad_request";
    return res.status(error.statusCode).json({
      error: errorCode,
      message: error.message,
    });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return res.status(500).json({
    error: "internal_error",
    message,
  });
};

export const listNotificationTemplatesAdmin = async (
  req: Request,
  res: Response,
) => {
  const parsed = listTemplatesQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const options: {
      channel?: "email" | "sms" | "in_app";
      locale?: string;
      templateKey?: string;
      includeInactive?: boolean;
    } = {
      includeInactive: parsed.data.includeInactive === "true",
    };

    if (parsed.data.channel !== undefined) {
      options.channel = parsed.data.channel;
    }

    if (parsed.data.locale !== undefined) {
      options.locale = parsed.data.locale;
    }

    if (parsed.data.templateKey !== undefined) {
      options.templateKey = parsed.data.templateKey;
    }

    const templates = await listNotificationTemplatesForAdmin(options);

    return res.status(200).json({
      templates: templates.map(toApiTemplate),
    });
  } catch (error) {
    return sendServiceError(
      res,
      error,
      "Failed to list notification templates",
    );
  }
};

export const getNotificationTemplateAdmin = async (
  req: Request,
  res: Response,
) => {
  const parsed = templateIdParamsSchema.safeParse(req.params ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const template = await getNotificationTemplateById(parsed.data.id);
    if (!template) {
      return res.status(404).json({
        error: "not_found",
        message: "Notification template not found",
      });
    }

    return res.status(200).json({
      template: toApiTemplate(template),
    });
  } catch (error) {
    return sendServiceError(
      res,
      error,
      "Failed to fetch notification template",
    );
  }
};

export const updateNotificationTemplateAdmin = async (
  req: Request,
  res: Response,
) => {
  const parsedParams = templateIdParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = updateTemplateBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const existing = await getNotificationTemplateById(parsedParams.data.id);
    if (!existing) {
      return res.status(404).json({
        error: "not_found",
        message: "Notification template not found",
      });
    }

    const updateInput: UpdateNotificationTemplateInput = {};

    if (hasOwn(parsedBody.data, "subjectTemplate")) {
      updateInput.subjectTemplate = parsedBody.data.subjectTemplate ?? null;
    }

    if (
      hasOwn(parsedBody.data, "bodyTemplate") &&
      parsedBody.data.bodyTemplate !== undefined
    ) {
      updateInput.bodyTemplate = parsedBody.data.bodyTemplate;
    }

    if (
      hasOwn(parsedBody.data, "bodyFormat") &&
      parsedBody.data.bodyFormat !== undefined
    ) {
      updateInput.bodyFormat = parsedBody.data.bodyFormat;
    }

    if (
      hasOwn(parsedBody.data, "variablesSchema") &&
      parsedBody.data.variablesSchema !== undefined
    ) {
      updateInput.variablesSchema = parsedBody.data.variablesSchema;
    }

    if (
      hasOwn(parsedBody.data, "isActive") &&
      parsedBody.data.isActive !== undefined
    ) {
      updateInput.isActive = parsedBody.data.isActive;
    }

    if (hasOwn(parsedBody.data, "sourceReference")) {
      updateInput.sourceReference = parsedBody.data.sourceReference ?? null;
    }

    if (
      hasOwn(parsedBody.data, "metadata") &&
      parsedBody.data.metadata !== undefined
    ) {
      updateInput.metadata = parsedBody.data.metadata;
    }

    const updated = await updateNotificationTemplate(parsedParams.data.id, updateInput);
    if (!updated) {
      return res.status(404).json({
        error: "not_found",
        message: "Notification template not found",
      });
    }

    const auditInput: {
      actorSupabaseId?: string;
      actorRole?: string;
      entityType: string;
      entityId: string;
      action: string;
      metadata: Record<string, unknown>;
    } = {
      entityType: "notification_template",
      entityId: updated.id,
      action: "notification_template.updated",
      metadata: {
        template_key: updated.templateKey,
        template_version: updated.templateVersion,
        previous: {
          subject_template: existing.subjectTemplate,
          body_template: existing.bodyTemplate,
          body_format: existing.bodyFormat,
          variables_schema: existing.variablesSchema,
          is_active: existing.isActive,
          source_reference: existing.sourceReference,
          metadata: existing.metadata,
        },
        current: {
          subject_template: updated.subjectTemplate,
          body_template: updated.bodyTemplate,
          body_format: updated.bodyFormat,
          variables_schema: updated.variablesSchema,
          is_active: updated.isActive,
          source_reference: updated.sourceReference,
          metadata: updated.metadata,
        },
      },
    };

    if (req.user?.id) {
      auditInput.actorSupabaseId = req.user.id;
    }

    if (req.user?.role) {
      auditInput.actorRole = req.user.role;
    }

    await recordAuditEvent(auditInput);

    return res.status(200).json({
      template: toApiTemplate(updated),
    });
  } catch (error) {
    return sendServiceError(
      res,
      error,
      "Failed to update notification template",
    );
  }
};

export const previewNotificationTemplateAdmin = async (
  req: Request,
  res: Response,
) => {
  const parsedParams = templateIdParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = previewTemplateBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const existing = await getNotificationTemplateById(parsedParams.data.id);
    if (!existing) {
      return res.status(404).json({
        error: "not_found",
        message: "Notification template not found",
      });
    }

    const previewInput: PreviewNotificationTemplateInput = {
      payload: parsedBody.data.payload,
    };

    if (hasOwn(parsedBody.data, "subjectTemplate")) {
      previewInput.subjectTemplate = parsedBody.data.subjectTemplate ?? null;
    }

    if (
      hasOwn(parsedBody.data, "bodyTemplate") &&
      parsedBody.data.bodyTemplate !== undefined
    ) {
      previewInput.bodyTemplate = parsedBody.data.bodyTemplate;
    }

    if (
      hasOwn(parsedBody.data, "bodyFormat") &&
      parsedBody.data.bodyFormat !== undefined
    ) {
      previewInput.bodyFormat = parsedBody.data.bodyFormat;
    }

    if (hasOwn(parsedBody.data, "recipientEmail")) {
      previewInput.recipientEmail = parsedBody.data.recipientEmail ?? null;
    }

    if (hasOwn(parsedBody.data, "recipientDisplayName")) {
      previewInput.recipientDisplayName = parsedBody.data.recipientDisplayName ?? null;
    }

    const renderInput: {
      template: ReturnType<typeof buildNotificationTemplatePreviewSource>;
      payload: Record<string, unknown>;
      recipientEmail?: string | null;
      recipientDisplayName?: string | null;
    } = {
      template: buildNotificationTemplatePreviewSource(existing, previewInput),
      payload: previewInput.payload,
    };

    if (Object.prototype.hasOwnProperty.call(previewInput, "recipientEmail")) {
      renderInput.recipientEmail = previewInput.recipientEmail ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(previewInput, "recipientDisplayName")) {
      renderInput.recipientDisplayName =
        previewInput.recipientDisplayName ?? null;
    }

    const rendered = renderNotificationTemplate(renderInput);

    return res.status(200).json({
      preview: {
        templateId: existing.id,
        templateKey: existing.templateKey,
        templateVersion: existing.templateVersion,
        locale: existing.locale,
        channel: existing.channel,
        from: rendered.from,
        replyTo: rendered.replyTo,
        to: rendered.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        missingVariables: rendered.missingVariables,
      },
    });
  } catch (error) {
    return sendServiceError(
      res,
      error,
      "Failed to preview notification template",
    );
  }
};