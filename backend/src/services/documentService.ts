export const prepareDocumentForSigning = async (documentId: string) => {
  return { documentId, status: "pending_signature" };
};

export const appendAcknowledgmentPage = async (documentId: string) => {
  return { documentId, status: "acknowledgment_appended" };
};

export const watermarkWithNotice = async (documentId: string) => {
  return { documentId, status: "watermarked" };
};
