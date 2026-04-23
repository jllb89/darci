export type LedgerAnchorResultStatus = "anchored" | "failed";
export type LedgerProviderName = "stub" | "unconfigured";

export type LedgerAnchorResult = {
  idn: string;
  hash: string;
  status: LedgerAnchorResultStatus;
  ledgerTxId: string | null;
  anchoredAt: string | null;
  errorMessage: string | null;
  provider: LedgerProviderName;
};

type LedgerAnchorInput = {
  idn: string;
  hash: string;
};

type LedgerProviderResponse = Omit<LedgerAnchorResult, "provider">;

type LedgerProvider = {
  name: Exclude<LedgerProviderName, "unconfigured">;
  anchor: (input: LedgerAnchorInput) => Promise<LedgerProviderResponse>;
};

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

const parseBooleanEnv = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const getExecutionEnvironment = () => {
  const explicitEnvironment = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();

  if (explicitEnvironment) {
    return explicitEnvironment;
  }

  const dotenvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim().toLowerCase();
  if (dotenvPath.includes("staging")) {
    return "staging";
  }

  return "development";
};

const isStubProviderAllowed = () => {
  if (parseBooleanEnv(process.env.LEDGER_ALLOW_STUB_PROVIDER)) {
    return true;
  }

  const environment = getExecutionEnvironment();
  return (
    environment === "development" ||
    environment === "dev" ||
    environment === "test" ||
    environment === "local"
  );
};

const getLedgerAnchorMode = () => {
  return (process.env.LEDGER_ANCHOR_MODE ?? "stub").trim().toLowerCase();
};

const buildFailedLedgerResult = (input: {
  idn: string;
  hash: string;
  errorMessage: string;
  provider: LedgerProviderName;
}): LedgerAnchorResult => {
  return {
    idn: input.idn,
    hash: input.hash,
    status: "failed",
    ledgerTxId: null,
    anchoredAt: null,
    errorMessage: input.errorMessage,
    provider: input.provider,
  };
};

const stubLedgerProvider: LedgerProvider = {
  name: "stub",
  anchor: async ({ idn, hash }) => {
    if (getLedgerAnchorMode() === "fail") {
      return {
        idn,
        hash,
        status: "failed",
        ledgerTxId: null,
        anchoredAt: null,
        errorMessage: "Ledger anchoring is configured to fail in this environment",
      };
    }

    const anchoredAt = new Date().toISOString();
    return {
      idn,
      hash,
      status: "anchored",
      ledgerTxId: `ledger_${idn}`,
      anchoredAt,
      errorMessage: null,
    };
  },
};

const resolveLedgerProvider = () => {
  const ledgerAnchorMode = getLedgerAnchorMode();

  if (ledgerAnchorMode === "stub" || ledgerAnchorMode === "fail") {
    return isStubProviderAllowed() ? stubLedgerProvider : null;
  }

  return null;
};

export const anchorToLedger = async (
  idn: string,
  hash: string,
): Promise<LedgerAnchorResult> => {
  const normalizedIdn = idn.trim();
  const normalizedHash = hash.trim().toLowerCase();
  const defaultProvider: LedgerProviderName =
    getLedgerAnchorMode() === "stub" || getLedgerAnchorMode() === "fail"
      ? "stub"
      : "unconfigured";

  if (!normalizedIdn) {
    return buildFailedLedgerResult({
      idn: normalizedIdn,
      hash: normalizedHash,
      errorMessage: "Ledger anchoring requires a final IDN",
      provider: defaultProvider,
    });
  }

  if (!SHA256_HEX_PATTERN.test(normalizedHash)) {
    return buildFailedLedgerResult({
      idn: normalizedIdn,
      hash: normalizedHash,
      errorMessage: "Ledger anchoring requires a completed SHA-256 hash",
      provider: defaultProvider,
    });
  }

  const provider = resolveLedgerProvider();
  if (!provider) {
    return buildFailedLedgerResult({
      idn: normalizedIdn,
      hash: normalizedHash,
      errorMessage: `Ledger provider mode "${getLedgerAnchorMode()}" is not configured for environment "${getExecutionEnvironment()}". Set a real provider or explicitly allow the stub provider.`,
      provider: "unconfigured",
    });
  }

  const result = await provider.anchor({
    idn: normalizedIdn,
    hash: normalizedHash,
  });

  return {
    ...result,
    provider: provider.name,
  };
};
