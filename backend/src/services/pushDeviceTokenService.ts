import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

export type PushPermissionStatus = "authorized" | "provisional" | "denied" | "unknown";
export type PushEnvironment = "sandbox" | "production";

type DeviceTokenRow = {
  id: string;
  user_id: string;
  installation_id: string;
  platform: "ios";
  provider: "apns";
  environment: PushEnvironment;
  app_bundle_id: string;
  device_token: string | null;
  permission_status: PushPermissionStatus;
  app_version: string | null;
  build_number: string | null;
  device_model: string | null;
  os_version: string | null;
  is_active: boolean;
  last_registered_at: string | null;
  last_seen_at: string | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DevicePushTokenResponse = {
  id: string;
  installationId: string;
  platform: "ios";
  provider: "apns";
  environment: PushEnvironment;
  appBundleId: string;
  permissionStatus: PushPermissionStatus;
  appVersion: string | null;
  buildNumber: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  isActive: boolean;
  lastRegisteredAt: string | null;
  lastSeenAt: string | null;
  invalidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class PushDeviceTokenServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PushDeviceTokenServiceError";
  }
}

const assertSupabaseConfigured = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new PushDeviceTokenServiceError(
      500,
      "provider_misconfigured",
      "Supabase service role is not configured",
    );
  }
};

const mapDeviceTokenRow = (row: DeviceTokenRow): DevicePushTokenResponse => ({
  id: row.id,
  installationId: row.installation_id,
  platform: row.platform,
  provider: row.provider,
  environment: row.environment,
  appBundleId: row.app_bundle_id,
  permissionStatus: row.permission_status,
  appVersion: row.app_version,
  buildNumber: row.build_number,
  deviceModel: row.device_model,
  osVersion: row.os_version,
  isActive: row.is_active,
  lastRegisteredAt: row.last_registered_at,
  lastSeenAt: row.last_seen_at,
  invalidatedAt: row.invalidated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const devicePushTokenSelect = [
  "id",
  "user_id",
  "installation_id",
  "platform",
  "provider",
  "environment",
  "app_bundle_id",
  "device_token",
  "permission_status",
  "app_version",
  "build_number",
  "device_model",
  "os_version",
  "is_active",
  "last_registered_at",
  "last_seen_at",
  "invalidated_at",
  "created_at",
  "updated_at",
].join(", ");

const handleSupabaseError = (error: { code?: string; message?: string } | null) => {
  if (!error) {
    return;
  }

  if (error.code === "23505") {
    throw new PushDeviceTokenServiceError(
      409,
      "device_token_conflict",
      "Device token is already registered to another installation",
    );
  }

  throw new PushDeviceTokenServiceError(
    500,
    "storage_error",
    error.message ?? "Unable to persist push device token",
  );
};

export const registerPushDeviceToken = async (input: {
  userId: string;
  installationId: string;
  environment: PushEnvironment;
  appBundleId: string;
  deviceToken: string;
  permissionStatus: PushPermissionStatus;
  appVersion?: string | null | undefined;
  buildNumber?: string | null | undefined;
  deviceModel?: string | null | undefined;
  osVersion?: string | null | undefined;
}) => {
  assertSupabaseConfigured();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .upsert(
      {
        user_id: input.userId,
        installation_id: input.installationId,
        platform: "ios",
        provider: "apns",
        environment: input.environment,
        app_bundle_id: input.appBundleId,
        device_token: input.deviceToken,
        permission_status: input.permissionStatus,
        app_version: input.appVersion ?? null,
        build_number: input.buildNumber ?? null,
        device_model: input.deviceModel ?? null,
        os_version: input.osVersion ?? null,
        is_active: input.permissionStatus !== "denied",
        last_registered_at: now,
        last_seen_at: now,
        invalidated_at: null,
        updated_at: now,
      },
      { onConflict: "user_id,installation_id,environment" },
    )
    .select(devicePushTokenSelect)
    .single();

  handleSupabaseError(error);
  if (!data) {
    throw new PushDeviceTokenServiceError(500, "storage_error", "Device token registration returned no row");
  }
  return mapDeviceTokenRow(data as unknown as DeviceTokenRow);
};

export const updatePushDevicePermission = async (input: {
  userId: string;
  installationId: string;
  environment: PushEnvironment;
  appBundleId: string;
  permissionStatus: PushPermissionStatus;
  appVersion?: string | null | undefined;
  buildNumber?: string | null | undefined;
}) => {
  assertSupabaseConfigured();
  const now = new Date().toISOString();

  const { data: existingData, error: existingError } = await supabaseAdmin
    .from("device_push_tokens")
    .select(devicePushTokenSelect)
    .eq("user_id", input.userId)
    .eq("installation_id", input.installationId)
    .eq("environment", input.environment)
    .limit(1)
    .maybeSingle();

  handleSupabaseError(existingError);

  const existing = existingData as unknown as DeviceTokenRow | null;
  if (!existing) {
    const { data, error } = await supabaseAdmin
      .from("device_push_tokens")
      .insert({
        user_id: input.userId,
        installation_id: input.installationId,
        platform: "ios",
        provider: "apns",
        environment: input.environment,
        app_bundle_id: input.appBundleId,
        permission_status: input.permissionStatus,
        app_version: input.appVersion ?? null,
        build_number: input.buildNumber ?? null,
        is_active: false,
        last_seen_at: now,
        invalidated_at: input.permissionStatus === "denied" ? now : null,
        updated_at: now,
      })
      .select(devicePushTokenSelect)
      .single();

    handleSupabaseError(error);
    if (!data) {
      throw new PushDeviceTokenServiceError(500, "storage_error", "Permission update returned no row");
    }
    return mapDeviceTokenRow(data as unknown as DeviceTokenRow);
  }

  const isDenied = input.permissionStatus === "denied";
  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .update({
      app_bundle_id: input.appBundleId,
      permission_status: input.permissionStatus,
      app_version: input.appVersion ?? existing.app_version,
      build_number: input.buildNumber ?? existing.build_number,
      is_active: isDenied ? false : existing.device_token !== null,
      last_seen_at: now,
      invalidated_at: isDenied ? now : null,
      updated_at: now,
    })
    .eq("id", existing.id)
    .select(devicePushTokenSelect)
    .single();

  handleSupabaseError(error);
  if (!data) {
    throw new PushDeviceTokenServiceError(500, "storage_error", "Permission update returned no row");
  }
  return mapDeviceTokenRow(data as unknown as DeviceTokenRow);
};

export const deactivatePushDeviceInstallation = async (input: {
  userId: string;
  installationId: string;
}) => {
  assertSupabaseConfigured();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .update({
      is_active: false,
      invalidated_at: now,
      updated_at: now,
    })
    .eq("user_id", input.userId)
    .eq("installation_id", input.installationId)
    .select(devicePushTokenSelect);

  handleSupabaseError(error);
  return {
    deactivated: ((data as DeviceTokenRow[] | null) ?? []).length > 0,
  };
};