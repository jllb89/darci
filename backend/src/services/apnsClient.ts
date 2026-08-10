import http2 from "node:http2";
import { SignJWT, importPKCS8 } from "jose";

export type ApnsEnvironment = "sandbox" | "production";

export type ApnsSendInput = {
  deviceToken: string;
  environment: ApnsEnvironment;
  topic: string;
  payload: Record<string, unknown>;
  collapseId?: string | null | undefined;
  expiration?: number | null | undefined;
  priority?: 10 | 5 | null | undefined;
  pushType?: "alert" | "background" | null | undefined;
};

export type ApnsSendResult = {
  apnsId: string | null;
  statusCode: number;
};

type ApnsTransportRequest = {
  host: string;
  path: string;
  headers: Record<string, string | number>;
  body: string;
  timeoutMs: number;
};

type ApnsTransportResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: string;
};

type ApnsTransport = (request: ApnsTransportRequest) => Promise<ApnsTransportResponse>;

export class ApnsClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly options: {
      statusCode?: number | undefined;
      apnsId?: string | null | undefined;
      reason?: string | null | undefined;
      retryable?: boolean | undefined;
      permanentTokenFailure?: boolean | undefined;
    } = {},
  ) {
    super(message);
    this.name = "ApnsClientError";
  }

  get statusCode() {
    return this.options.statusCode;
  }

  get apnsId() {
    return this.options.apnsId ?? null;
  }

  get reason() {
    return this.options.reason ?? null;
  }

  get retryable() {
    return this.options.retryable === true;
  }

  get permanentTokenFailure() {
    return this.options.permanentTokenFailure === true;
  }
}

const APNS_MAX_PAYLOAD_BYTES = 4096;
const DEFAULT_TOKEN_TTL_SECONDS = 50 * 60;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;

const permanentTokenFailureReasons = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);
const retryableStatusCodes = new Set([429, 500, 503]);

let cachedProviderToken: {
  token: string;
  expiresAtMs: number;
  keyId: string;
  teamId: string;
  privateKey: string;
} | null = null;

let transport: ApnsTransport | null = null;

const normalizePrivateKey = (value: string) => value.replace(/\\n/g, "\n").trim();

const getRequiredEnv = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new ApnsClientError("provider_misconfigured", `${key} is not configured`);
  }
  return value;
};

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildProviderToken = async () => {
  const keyId = getRequiredEnv("APNS_KEY_ID");
  const teamId = getRequiredEnv("APNS_TEAM_ID");
  const privateKey = normalizePrivateKey(getRequiredEnv("APNS_PRIVATE_KEY"));
  const ttlSeconds = Math.min(
    parsePositiveInteger(process.env.APNS_PROVIDER_TOKEN_TTL_SECONDS, DEFAULT_TOKEN_TTL_SECONDS),
    DEFAULT_TOKEN_TTL_SECONDS,
  );
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (
    cachedProviderToken &&
    cachedProviderToken.keyId === keyId &&
    cachedProviderToken.teamId === teamId &&
    cachedProviderToken.privateKey === privateKey &&
    cachedProviderToken.expiresAtMs > Date.now() + 60_000
  ) {
    return cachedProviderToken.token;
  }

  const signingKey = await importPKCS8(privateKey, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttlSeconds)
    .sign(signingKey);

  cachedProviderToken = {
    token,
    keyId,
    teamId,
    privateKey,
    expiresAtMs: (nowSeconds + ttlSeconds) * 1000,
  };

  return token;
};

const defaultTransport: ApnsTransport = (request) =>
  new Promise((resolve, reject) => {
    const client = http2.connect(`https://${request.host}`);
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
      client.close();
    };

    client.on("error", (error) => {
      finish(() => reject(error));
    });

    const stream = client.request({
      [http2.constants.HTTP2_HEADER_METHOD]: "POST",
      [http2.constants.HTTP2_HEADER_PATH]: request.path,
      ...request.headers,
    });
    const chunks: Buffer[] = [];
    let responseHeaders: Record<string, string | string[] | number | undefined> = {};

    stream.setEncoding("utf8");
    stream.setTimeout(request.timeoutMs, () => {
      stream.close();
      finish(() => reject(new ApnsClientError("apns_timeout", "APNs request timed out", { retryable: true })));
    });
    stream.on("response", (headers) => {
      responseHeaders = headers as Record<string, string | string[] | number | undefined>;
    });
    stream.on("data", (chunk) => {
      chunks.push(Buffer.from(String(chunk)));
    });
    stream.on("error", (error) => {
      finish(() => reject(error));
    });
    stream.on("end", () => {
      const statusHeader = responseHeaders[http2.constants.HTTP2_HEADER_STATUS];
      const statusCode = typeof statusHeader === "number" ? statusHeader : Number(statusHeader);
      finish(() =>
        resolve({
          statusCode,
          headers: responseHeaders,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });

    stream.end(request.body);
  });

const apnsHostForEnvironment = (environment: ApnsEnvironment) =>
  environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";

const normalizeCollapseId = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const bytes = Buffer.byteLength(trimmed, "utf8");
  return bytes <= 64 ? trimmed : trimmed.slice(0, 64);
};

const normalizeExpiration = (value: number | null | undefined) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(value ?? Number.NaN)) {
    return nowSeconds + 60 * 60;
  }

  const seconds = Math.trunc(value as number);
  if (seconds <= 0) {
    return 0;
  }

  return Math.min(seconds, nowSeconds + MAX_EXPIRATION_SECONDS);
};

const parseApnsReason = (body: string) => {
  if (!body.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : null;
  } catch {
    return null;
  }
};

const firstHeaderValue = (value: string | string[] | number | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]) : null;
  }
  if (value === undefined) {
    return null;
  }
  return String(value);
};

export const sendApnsNotification = async (input: ApnsSendInput): Promise<ApnsSendResult> => {
  const body = JSON.stringify(input.payload);
  const payloadBytes = Buffer.byteLength(body, "utf8");
  if (payloadBytes > APNS_MAX_PAYLOAD_BYTES) {
    throw new ApnsClientError(
      "apns_payload_too_large",
      `APNs payload exceeds ${APNS_MAX_PAYLOAD_BYTES} bytes`,
      { retryable: false },
    );
  }

  const providerToken = await buildProviderToken();
  const collapseId = normalizeCollapseId(input.collapseId);
  const headers: Record<string, string | number> = {
    authorization: `bearer ${providerToken}`,
    "apns-topic": input.topic,
    "apns-push-type": input.pushType ?? "alert",
    "apns-priority": input.priority ?? 10,
    "apns-expiration": normalizeExpiration(input.expiration),
  };
  if (collapseId) {
    headers["apns-collapse-id"] = collapseId;
  }

  const response = await (transport ?? defaultTransport)({
    host: apnsHostForEnvironment(input.environment),
    path: `/3/device/${input.deviceToken}`,
    headers,
    body,
    timeoutMs: parsePositiveInteger(process.env.APNS_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
  });
  const apnsId = firstHeaderValue(response.headers["apns-id"]);

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return {
      apnsId,
      statusCode: response.statusCode,
    };
  }

  const reason = parseApnsReason(response.body);
  const retryable = retryableStatusCodes.has(response.statusCode) || response.statusCode >= 500;
  const permanentTokenFailure = reason ? permanentTokenFailureReasons.has(reason) : false;
  throw new ApnsClientError(
    reason ? `apns_${reason}` : `apns_http_${response.statusCode}`,
    reason ? `APNs rejected notification: ${reason}` : `APNs rejected notification with HTTP ${response.statusCode}`,
    {
      statusCode: response.statusCode,
      apnsId,
      reason,
      retryable,
      permanentTokenFailure,
    },
  );
};

export const __testUtils = {
  resetProviderTokenCache: () => {
    cachedProviderToken = null;
  },
  setTransport: (nextTransport: ApnsTransport | null) => {
    transport = nextTransport;
  },
};
