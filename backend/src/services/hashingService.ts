import crypto from "crypto";

export const hashDocument = async (documentId: string, content?: string) => {
  const source = content ?? documentId;
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  return { documentId, hash };
};
