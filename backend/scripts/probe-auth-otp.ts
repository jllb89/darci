import request from "supertest";
import { app } from "../src/index";

type ProbeOptions = {
  email: string;
  origin: string;
  returnTo: string;
  send: boolean;
};

const getArgValue = (name: string) => {
  const prefix = `${name}=`;
  const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
  if (inlineArg) {
    return inlineArg.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
};

const getProbeOptions = (): ProbeOptions => {
  const send = process.argv.includes("--send");
  const email = getArgValue("--email") ?? (send ? "" : "not-an-email");

  if (send && !email) {
    throw new Error("Pass --email you@example.com when using --send");
  }

  return {
    email,
    origin: getArgValue("--origin") ?? "http://localhost:3000",
    returnTo: getArgValue("--returnTo") ?? "/app",
    send,
  };
};

const otpSenderEnvKeys = [
  "AUTH_OTP_FROM_ADDRESS",
  "RESEND_FROM_ADDRESS",
  "NOTIFICATION_FROM_ADDRESS",
] as const;

const getOtpSenderProbeConfig = () => {
  for (const key of otpSenderEnvKeys) {
    const value = process.env[key]?.trim();
    if (value) {
      return { configured: true, source: key, from: value };
    }
  }

  return { configured: false, source: null, from: null };
};

const main = async () => {
  const options = getProbeOptions();
  const senderConfig = getOtpSenderProbeConfig();

  console.info("[auth.email_otp.probe] starting", {
    origin: options.origin,
    returnTo: options.returnTo,
    email: options.send ? options.email : "invalid-probe-email",
    sendsProviderEmail: options.send,
    resendFailureMode: process.env.RESEND_FAILURE_MODE ?? null,
    resendApiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    otpFromAddressConfigured: senderConfig.configured,
    otpFromAddressSource: senderConfig.source,
    otpFromAddress: senderConfig.from,
  });

  const response = await request(app)
    .post("/auth/otp/start")
    .set("Origin", options.origin)
    .set("Content-Type", "application/json")
    .send({
      email: options.email,
      returnTo: options.returnTo,
    });

  const headers = response.headers as Record<string, string | string[] | undefined>;
  const darciHeaders = Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase().startsWith("x-darci")),
  );

  console.info("[auth.email_otp.probe] response", {
    status: response.status,
    headers: darciHeaders,
    body: response.body,
  });
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[auth.email_otp.probe] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });