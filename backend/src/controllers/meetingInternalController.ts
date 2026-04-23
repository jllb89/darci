import { Request, Response } from "express";
import { z } from "zod";
import { enforceMeetingArtifactRetention } from "../services/meetingService";
import { sendValidationError } from "../utils/validation";

const enforceMeetingArtifactRetentionSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const enforceMeetingArtifactRetentionInternal = async (
  req: Request,
  res: Response,
) => {
  const parsed = enforceMeetingArtifactRetentionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const result = await enforceMeetingArtifactRetention({
    limit: parsed.data.limit,
    workerUserId: req.user?.dbUserId ?? req.user?.id ?? null,
  });

  return res.status(200).json(result);
};
