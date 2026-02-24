export const anchorToLedger = async (idn: string, hash: string) => {
  return {
    idn,
    hash,
    status: "anchored",
    ledgerTxId: `ledger_${idn}`,
  };
};
