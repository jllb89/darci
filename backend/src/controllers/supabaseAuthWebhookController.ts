import { Request, Response } from "express";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import {
  sendSupabaseAuthSms,
  SupabaseAuthSmsHookError,
} from "../services/supabaseAuthSmsHookService";
import { captureException } from "../utils/sentry";

const sendSmsHookPayloadSchema = z.object({
  user: z.object({
    id: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1),
  }).passthrough(),
  sms: z.object({
    otp: z.string().trim().min(1).max(32),
  }).passthrough(),
}).passthrough();

const getHeader = (req: Request, name: string) => req.get(name)?.trim() ?? "";

const getRawBody = (req: Request) => {
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  return "";
};

const getStandardWebhookHeaders = (req: Request) => {
  const id = getHeader(req, "webhook-id");
  const timestamp = getHeader(req, "webhook-timestamp");
  const signature = getHeader(req, "webhook-signature");

  if (!id || !timestamp || !signature) {
    return null;
  }

  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": signature,
  };
};

const getSupabaseHookSecret = () => {
  const secret = process.env.SUPABASE_AUTH_SMS_HOOK_SECRET?.trim();
  return secret ? secret.replace(/^v\d+,/, "") : "";
};

const sendHookError = (res: Response, statusCode: number, message: string) => {
  return res.status(statusCode).json({
    error: {
      http_code: statusCode,
      message,
    },
  });
};

export const receiveSupabaseAuthSmsHook = async (req: Request, res: Response) => {
  const hookSecret = getSupabaseHookSecret();
  if (!hookSecret) {
    return sendHookError(res, 500, "SUPABASE_AUTH_SMS_HOOK_SECRET is not configured");
  }

  const headers = getStandardWebhookHeaders(req);
  if (!headers) {
    return sendHookError(res, 400, "Missing Supabase Auth hook signature headers");
  }

  const rawBody = getRawBody(req);
  if (!rawBody) {
    return sendHookError(res, 400, "Webhook body must be provided as raw JSON");
  }

  let verifiedPayload: unknown;
  try {
    verifiedPayload = new Webhook(hookSecret).verify(rawBody, headers);
  } catch (_error) {
    return sendHookError(res, 401, "Invalid Supabase Auth hook signature");
  }

  const parsed = sendSmsHookPayloadSchema.safeParse(verifiedPayload);
  if (!parsed.success) {
    return sendHookError(res, 400, "Supabase Auth SMS hook payload is invalid");
  }

  try {
    await sendSupabaseAuthSms({
      phone: parsed.data.user.phone,
      otp: parsed.data.sms.otp,
      userId: parsed.data.user.id ?? null,
    });

    return res.status(200).send();
  } catch (error) {
    if (error instanceof SupabaseAuthSmsHookError) {
      captureException(error, {
        tags: {
          source: "supabase_auth_sms_hook",
          error_code: error.code,
        },
        contexts: {
          smsHook: {
            userId: parsed.data.user.id ?? null,
          },
        },
      });

      return sendHookError(res, error.statusCode, error.message);
    }

    captureException(error, {
      tags: { source: "supabase_auth_sms_hook" },
    });

    return sendHookError(res, 500, "Supabase Auth SMS hook failed");
  }
};