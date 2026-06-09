export const getOtpDigitsOnly = (value: string) => value.replace(/\D/g, "");

export const isCompleteOtpDigits = (digits: string[]) => {
  return digits.length > 0 && digits.every((digit) => digit.length === 1);
};

export const getOtpCodeForAutoSubmit = (
  digits: string[],
  lastAutoSubmittedCode: string | null,
) => {
  if (!isCompleteOtpDigits(digits)) {
    return null;
  }

  const code = digits.join("");
  return code === lastAutoSubmittedCode ? null : code;
};

export const getOtpVerificationFailureMessage = (input: {
  status: number;
  message?: string | null;
  validationMessage?: string | null;
}) => {
  if (input.status === 401) {
    return "Wrong code. Check the code and try again.";
  }

  if (input.message?.trim()) {
    return input.message.trim();
  }

  if (input.validationMessage?.trim()) {
    return input.validationMessage.trim();
  }

  return "Invalid or expired code.";
};

export const getNextOtpFocusIndexAfterInput = (
  value: string,
  index: number,
  otpLength: number,
) => {
  const digitsOnly = getOtpDigitsOnly(value);
  if (!digitsOnly || otpLength <= 0) {
    return null;
  }

  return Math.min(index + digitsOnly.length, otpLength - 1);
};