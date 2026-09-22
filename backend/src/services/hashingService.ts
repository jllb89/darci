import crypto from "crypto";

export const hashDocument = async (documentId: string, content?: string | Buffer) => {
  if (content === undefined || content.length === 0) throw new Error("Document bytes are required for hashing");
  const source = content;
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  return { documentId, hash };
};
