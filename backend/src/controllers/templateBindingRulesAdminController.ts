import { Request, Response } from "express";
import { z } from "zod";
import {
  type CreateTemplateBindingRuleInput,
  type ListTemplateBindingRulesForAdminOptions,
  type UpdateTemplateBindingRuleInput,
  createTemplateBindingRule,
  deactivateTemplateBindingRule,
  getTemplateBindingRuleById,
  listTemplateBindingRulesForAdmin,
  templateBindingRuleSources,
  updateTemplateBindingRule,
  type TemplateBindingRuleRecord,
} from "../services/templateBindingRulesService";
import { sendValidationError } from "../utils/validation";

const pathIdSchema = z.object({
  id: z.string().uuid(),
});

const documentKeySchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9_]+$/);

const keyFieldSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9_]+$/);

const listQuerySchema = z
  .object({
    documentKey: documentKeySchema.optional(),
    includeInactive: z.enum(["true", "false"]).optional(),
  })
  .passthrough();

const createRuleBodySchema = z
  .object({
    documentKey: documentKeySchema,
    placeholder: z.string().trim().min(1),
    description: z.string().trim().min(1),
    required: z.boolean(),
    source: z.enum(templateBindingRuleSources),
    canonicalKey: z.union([keyFieldSchema, z.null()]).optional(),
    sourceFieldKey: z.union([keyFieldSchema, z.null()]).optional(),
    notes: z.union([z.string().trim().min(1), z.null()]).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.source === "member_form" &&
      !value.canonicalKey &&
      !value.sourceFieldKey
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canonicalKey"],
        message:
          "canonicalKey or sourceFieldKey is required when source is member_form",
      });
    }
  });

const updateRuleBodySchema = z
  .object({
    documentKey: documentKeySchema.optional(),
    placeholder: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    required: z.boolean().optional(),
    source: z.enum(templateBindingRuleSources).optional(),
    canonicalKey: z.union([keyFieldSchema, z.null()]).optional(),
    sourceFieldKey: z.union([keyFieldSchema, z.null()]).optional(),
    notes: z.union([z.string().trim().min(1), z.null()]).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
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

const toApiRule = (rule: TemplateBindingRuleRecord) => {
  return {
    id: rule.id,
    documentKey: rule.documentKey,
    placeholder: rule.placeholder,
    description: rule.description,
    required: rule.required,
    source: rule.source,
    canonicalKey: rule.canonicalKey,
    sourceFieldKey: rule.sourceFieldKey,
    notes: rule.notes,
    sortOrder: rule.sortOrder,
    isActive: rule.isActive,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
};

const hasOwn = <T extends object>(value: T, key: string) => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const handleRuleError = (res: Response, error: unknown, fallbackMessage: string) => {
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (/duplicate key value/i.test(message)) {
    return res.status(409).json({
      error: "conflict",
      message,
    });
  }

  if (/violates check constraint|violates not-null constraint|invalid input/i.test(message)) {
    return res.status(400).json({
      error: "validation_error",
      message,
    });
  }

  return res.status(500).json({
    error: "internal_error",
    message,
  });
};

export const listTemplateBindingRulesAdmin = async (
  req: Request,
  res: Response,
) => {
  const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    return sendValidationError(res, parsedQuery.error);
  }

  try {
    const listOptions: ListTemplateBindingRulesForAdminOptions = {
      includeInactive: parsedQuery.data.includeInactive === "true",
    };

    if (parsedQuery.data.documentKey) {
      listOptions.documentKey = parsedQuery.data.documentKey;
    }

    const rules = await listTemplateBindingRulesForAdmin(listOptions);

    return res.status(200).json({
      rules: rules.map(toApiRule),
    });
  } catch (error) {
    return handleRuleError(
      res,
      error,
      "Failed to list template binding rules",
    );
  }
};

export const createTemplateBindingRuleAdmin = async (
  req: Request,
  res: Response,
) => {
  const parsedBody = createRuleBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const createInput: CreateTemplateBindingRuleInput = {
      documentKey: parsedBody.data.documentKey,
      placeholder: parsedBody.data.placeholder,
      description: parsedBody.data.description,
      required: parsedBody.data.required,
      source: parsedBody.data.source,
    };

    if (hasOwn(parsedBody.data, "canonicalKey")) {
      createInput.canonicalKey = parsedBody.data.canonicalKey ?? null;
    }

    if (hasOwn(parsedBody.data, "sourceFieldKey")) {
      createInput.sourceFieldKey = parsedBody.data.sourceFieldKey ?? null;
    }

    if (hasOwn(parsedBody.data, "notes")) {
      createInput.notes = parsedBody.data.notes ?? null;
    }

    if (
      hasOwn(parsedBody.data, "sortOrder") &&
      parsedBody.data.sortOrder !== undefined
    ) {
      createInput.sortOrder = parsedBody.data.sortOrder;
    }

    if (
      hasOwn(parsedBody.data, "isActive") &&
      parsedBody.data.isActive !== undefined
    ) {
      createInput.isActive = parsedBody.data.isActive;
    }

    const created = await createTemplateBindingRule(createInput);

    return res.status(201).json({
      rule: toApiRule(created),
    });
  } catch (error) {
    return handleRuleError(
      res,
      error,
      "Failed to create template binding rule",
    );
  }
};

export const updateTemplateBindingRuleAdmin = async (
  req: Request,
  res: Response,
) => {
  const parsedParams = pathIdSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = updateRuleBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const existing = await getTemplateBindingRuleById(parsedParams.data.id);
    if (!existing) {
      return res.status(404).json({
        error: "not_found",
        message: "Template binding rule not found",
      });
    }

    const hasCanonicalKey = hasOwn(parsedBody.data, "canonicalKey");
    const hasSourceFieldKey = hasOwn(parsedBody.data, "sourceFieldKey");

    const nextSource = parsedBody.data.source ?? existing.source;
    const nextCanonicalKey = hasCanonicalKey
      ? (parsedBody.data.canonicalKey ?? null)
      : existing.canonicalKey;
    const nextSourceFieldKey = hasSourceFieldKey
      ? (parsedBody.data.sourceFieldKey ?? null)
      : existing.sourceFieldKey;

    if (nextSource === "member_form" && !nextCanonicalKey && !nextSourceFieldKey) {
      return res.status(400).json({
        error: "validation_error",
        message:
          "canonicalKey or sourceFieldKey is required when source is member_form",
      });
    }

    const updateInput: UpdateTemplateBindingRuleInput = {};

    if (
      hasOwn(parsedBody.data, "documentKey") &&
      parsedBody.data.documentKey !== undefined
    ) {
      updateInput.documentKey = parsedBody.data.documentKey;
    }

    if (
      hasOwn(parsedBody.data, "placeholder") &&
      parsedBody.data.placeholder !== undefined
    ) {
      updateInput.placeholder = parsedBody.data.placeholder;
    }

    if (
      hasOwn(parsedBody.data, "description") &&
      parsedBody.data.description !== undefined
    ) {
      updateInput.description = parsedBody.data.description;
    }

    if (
      hasOwn(parsedBody.data, "required") &&
      parsedBody.data.required !== undefined
    ) {
      updateInput.required = parsedBody.data.required;
    }

    if (
      hasOwn(parsedBody.data, "source") &&
      parsedBody.data.source !== undefined
    ) {
      updateInput.source = parsedBody.data.source;
    }

    if (hasCanonicalKey) {
      updateInput.canonicalKey = parsedBody.data.canonicalKey ?? null;
    }

    if (hasSourceFieldKey) {
      updateInput.sourceFieldKey = parsedBody.data.sourceFieldKey ?? null;
    }

    if (hasOwn(parsedBody.data, "notes")) {
      updateInput.notes = parsedBody.data.notes ?? null;
    }

    if (
      hasOwn(parsedBody.data, "sortOrder") &&
      parsedBody.data.sortOrder !== undefined
    ) {
      updateInput.sortOrder = parsedBody.data.sortOrder;
    }

    if (
      hasOwn(parsedBody.data, "isActive") &&
      parsedBody.data.isActive !== undefined
    ) {
      updateInput.isActive = parsedBody.data.isActive;
    }

    const updated = await updateTemplateBindingRule(parsedParams.data.id, updateInput);

    if (!updated) {
      return res.status(404).json({
        error: "not_found",
        message: "Template binding rule not found",
      });
    }

    return res.status(200).json({
      rule: toApiRule(updated),
    });
  } catch (error) {
    return handleRuleError(
      res,
      error,
      "Failed to update template binding rule",
    );
  }
};

export const deactivateTemplateBindingRuleAdmin = async (
  req: Request,
  res: Response,
) => {
  const parsedParams = pathIdSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  try {
    const updated = await deactivateTemplateBindingRule(parsedParams.data.id);

    if (!updated) {
      return res.status(404).json({
        error: "not_found",
        message: "Template binding rule not found",
      });
    }

    return res.status(200).json({
      rule: toApiRule(updated),
    });
  } catch (error) {
    return handleRuleError(
      res,
      error,
      "Failed to deactivate template binding rule",
    );
  }
};
