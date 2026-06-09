import { describe, expect, it } from "vitest";

import {
  getNextOtpFocusIndexAfterInput,
  getOtpCodeForAutoSubmit,
  getOtpVerificationFailureMessage,
} from "./otpInput";

describe("otpInput", () => {
  it("does not move focus when a populated digit is cleared", () => {
    expect(getNextOtpFocusIndexAfterInput("", 3, 8)).toBeNull();
  });

  it("moves focus forward after typing or pasting digits", () => {
    expect(getNextOtpFocusIndexAfterInput("7", 3, 8)).toBe(4);
    expect(getNextOtpFocusIndexAfterInput("123", 3, 8)).toBe(6);
  });

  it("caps the focus target at the final OTP input", () => {
    expect(getNextOtpFocusIndexAfterInput("123456", 3, 8)).toBe(7);
  });

  it("auto-submits a complete code only once until the code changes", () => {
    expect(getOtpCodeForAutoSubmit(["1", "2", "3", "4"], null)).toBe("1234");
    expect(getOtpCodeForAutoSubmit(["1", "2", "3", "4"], "1234")).toBeNull();
    expect(getOtpCodeForAutoSubmit(["1", "2", "", "4"], "1234")).toBeNull();
  });

  it("uses a clear wrong-code message for bare 401 verification failures", () => {
    expect(getOtpVerificationFailureMessage({ status: 401 })).toBe(
      "Wrong code. Check the code and try again.",
    );
    expect(
      getOtpVerificationFailureMessage({
        status: 401,
        message: "Invalid or expired code",
      }),
    ).toBe("Wrong code. Check the code and try again.");
  });
});