export const duplicatePhoneMessage =
  "This phone number is already linked to another account. Please use a different phone number or sign in with the account already associated with this number.";

export const normalizePhoneDigits = (value: string | null | undefined) => {
  return value?.replace(/\D/g, "") ?? "";
};

export const normalizePhoneForComparison = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const digits = normalizePhoneDigits(trimmed);
  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `1${digits}`;
  }

  return digits;
};

export const normalizePhoneForStorage = (value: string | null | undefined) => {
  const normalized = normalizePhoneForComparison(value);
  if (!normalized) {
    return undefined;
  }

  const e164 = `+${normalized}`;
  return /^\+[1-9][0-9]{6,14}$/.test(e164) ? e164 : undefined;
};

export const isDuplicatePhoneUniqueConstraintError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /ux_users_phone_not_null/i.test(message) ||
    (/duplicate key value/i.test(message) && /phone/i.test(message))
  );
};