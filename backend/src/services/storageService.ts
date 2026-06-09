import { createClient } from "@supabase/supabase-js";
import { DomainError } from "../errors/domainError";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseStorage = createClient(supabaseUrl, supabaseKey);

export const documentsBucket =
  process.env.SUPABASE_STORAGE_BUCKET_DOCUMENTS ?? "documents";
export const signaturesBucket =
  process.env.SUPABASE_STORAGE_BUCKET_SIGNATURES ?? "signatures";
export const notarizedBucket =
  process.env.SUPABASE_STORAGE_BUCKET_NOTARIZED ?? "notarized-copies";

const throwStorageError = (
  code: string,
  message: string,
  details: Record<string, unknown>,
  cause?: unknown,
): never => {
  throw new DomainError({
    code,
    family: "storage",
    message,
    details,
    cause,
  });
};

export const createDocumentUploadUrl = async (storagePath: string) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(documentsBucket)
    .createSignedUploadUrl(storagePath);
  const payload = data;

  if (error) {
    throwStorageError(
      "STORAGE_CREATE_DOCUMENT_UPLOAD_URL_FAILED",
      error?.message ?? "Failed to create signed upload URL",
      {
        bucket: documentsBucket,
        storagePath,
      },
      error,
    );
  }

  if (!payload || !payload.signedUrl) {
    throwStorageError(
      "STORAGE_CREATE_DOCUMENT_UPLOAD_URL_FAILED",
      "Failed to create signed upload URL",
      {
        bucket: documentsBucket,
        storagePath,
      },
    );
  }

  return {
    bucket: documentsBucket,
    path: payload!.path,
    signedUrl: payload!.signedUrl,
    token: payload!.token,
  };
};

export const createDocumentDownloadUrl = async (
  storagePath: string,
  expiresInSeconds = 60 * 60,
) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(documentsBucket)
    .createSignedUrl(storagePath, expiresInSeconds);
  const payload = data;

  if (error) {
    throwStorageError(
      "STORAGE_CREATE_DOCUMENT_DOWNLOAD_URL_FAILED",
      error?.message ?? "Failed to create signed download URL",
      {
        bucket: documentsBucket,
        storagePath,
        expiresInSeconds,
      },
      error,
    );
  }

  if (!payload || !payload.signedUrl) {
    throwStorageError(
      "STORAGE_CREATE_DOCUMENT_DOWNLOAD_URL_FAILED",
      "Failed to create signed download URL",
      {
        bucket: documentsBucket,
        storagePath,
        expiresInSeconds,
      },
    );
  }

  return {
    bucket: documentsBucket,
    path: storagePath,
    signedUrl: payload!.signedUrl,
    expiresInSeconds,
  };
};

const toBuffer = async (value: Blob | ArrayBuffer | Uint8Array) => {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  return Buffer.from(await value.arrayBuffer());
};

export const downloadDocumentObject = async (storagePath: string) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(documentsBucket)
    .download(storagePath);
  const payload = data;

  if (error) {
    throwStorageError(
      "STORAGE_DOWNLOAD_DOCUMENT_OBJECT_FAILED",
      error?.message ?? "Failed to download document object",
      {
        bucket: documentsBucket,
        storagePath,
      },
      error,
    );
  }

  if (payload === null) {
    throwStorageError(
      "STORAGE_DOWNLOAD_DOCUMENT_OBJECT_FAILED",
      "Failed to download document object",
      {
        bucket: documentsBucket,
        storagePath,
      },
    );
  }

  return toBuffer(payload as Blob);
};

export const createSignatureUploadUrl = async (storagePath: string) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(signaturesBucket)
    .createSignedUploadUrl(storagePath);
  const payload = data;

  if (error) {
    throwStorageError(
      "STORAGE_CREATE_SIGNATURE_UPLOAD_URL_FAILED",
      error?.message ?? "Failed to create signed upload URL",
      {
        bucket: signaturesBucket,
        storagePath,
      },
      error,
    );
  }

  if (!payload || !payload.signedUrl) {
    throwStorageError(
      "STORAGE_CREATE_SIGNATURE_UPLOAD_URL_FAILED",
      "Failed to create signed upload URL",
      {
        bucket: signaturesBucket,
        storagePath,
      },
    );
  }

  return {
    bucket: signaturesBucket,
    path: payload!.path,
    signedUrl: payload!.signedUrl,
    token: payload!.token,
  };
};

export const createSignatureDownloadUrl = async (
  storagePath: string,
  expiresInSeconds = 60 * 60,
) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(signaturesBucket)
    .createSignedUrl(storagePath, expiresInSeconds);
  const payload = data;

  if (error) {
    throwStorageError(
      "STORAGE_CREATE_SIGNATURE_DOWNLOAD_URL_FAILED",
      error?.message ?? "Failed to create signed signature URL",
      {
        bucket: signaturesBucket,
        storagePath,
        expiresInSeconds,
      },
      error,
    );
  }

  if (!payload || !payload.signedUrl) {
    throwStorageError(
      "STORAGE_CREATE_SIGNATURE_DOWNLOAD_URL_FAILED",
      "Failed to create signed signature URL",
      {
        bucket: signaturesBucket,
        storagePath,
        expiresInSeconds,
      },
    );
  }

  return {
    bucket: signaturesBucket,
    path: storagePath,
    signedUrl: payload!.signedUrl,
    expiresInSeconds,
  };
};

export const downloadSignatureAsset = async (storagePath: string) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(signaturesBucket)
    .download(storagePath);
  const payload = data;

  if (error) {
    throwStorageError(
      "STORAGE_DOWNLOAD_SIGNATURE_ASSET_FAILED",
      error?.message ?? "Failed to download signature asset",
      {
        bucket: signaturesBucket,
        storagePath,
      },
      error,
    );
  }

  if (payload === null) {
    throwStorageError(
      "STORAGE_DOWNLOAD_SIGNATURE_ASSET_FAILED",
      "Failed to download signature asset",
      {
        bucket: signaturesBucket,
        storagePath,
      },
    );
  }

  return toBuffer(payload as Blob);
};

export const getDocumentObjectMetadata = async (storagePath: string) => {
  const segments = storagePath.split("/");
  const fileName = segments.pop();
  const directory = segments.join("/");

  if (!fileName) {
    return null;
  }

  const { data, error } = await supabaseStorage
    .storage
    .from(documentsBucket)
    .list(directory, { limit: 200 });

  if (error) {
    throwStorageError(
      "STORAGE_LIST_DOCUMENT_OBJECT_METADATA_FAILED",
      error.message,
      {
        bucket: documentsBucket,
        storagePath,
        directory,
      },
      error,
    );
  }

  const match = data?.find((item) => item.name === fileName);
  if (!match) {
    return null;
  }

  const metadata = match.metadata ?? {};
  const rawSize =
    metadata.size ?? metadata.contentLength ?? metadata.content_length ?? null;
  const parsedSize =
    typeof rawSize === "number"
      ? rawSize
      : typeof rawSize === "string" && rawSize.trim().length > 0
        ? Number(rawSize)
        : null;

  return {
    sizeBytes:
      typeof parsedSize === "number" && Number.isFinite(parsedSize)
        ? parsedSize
        : null,
    mimeType:
      typeof metadata.mimetype === "string"
        ? metadata.mimetype
        : typeof metadata.contentType === "string"
          ? metadata.contentType
          : typeof metadata.content_type === "string"
            ? metadata.content_type
            : null,
  };
};

export const uploadGeneratedDocument = async (input: {
  storagePath: string;
  content: Buffer;
  contentType: string;
}) => {
  const { error } = await supabaseStorage.storage.from(documentsBucket).upload(
    input.storagePath,
    input.content,
    {
      contentType: input.contentType,
      upsert: true,
    },
  );

  if (error) {
    throwStorageError(
      "STORAGE_UPLOAD_GENERATED_DOCUMENT_FAILED",
      error.message,
      {
        bucket: documentsBucket,
        storagePath: input.storagePath,
        contentType: input.contentType,
      },
      error,
    );
  }

  return {
    bucket: documentsBucket,
    path: input.storagePath,
    sizeBytes: input.content.byteLength,
    mimeType: input.contentType,
  };
};

export const getSignatureObjectMetadata = async (storagePath: string) => {
  const segments = storagePath.split("/");
  const fileName = segments.pop();
  const directory = segments.join("/");

  if (!fileName) {
    return null;
  }

  const { data, error } = await supabaseStorage
    .storage
    .from(signaturesBucket)
    .list(directory, { limit: 200 });

  if (error) {
    throwStorageError(
      "STORAGE_LIST_SIGNATURE_OBJECT_METADATA_FAILED",
      error.message,
      {
        bucket: signaturesBucket,
        storagePath,
        directory,
      },
      error,
    );
  }

  const match = data?.find((item) => item.name === fileName);
  if (!match) {
    return null;
  }

  const metadata = match.metadata ?? {};

  return {
    sizeBytes: typeof metadata.size === "number" ? metadata.size : null,
    mimeType:
      typeof metadata.mimetype === "string"
        ? metadata.mimetype
        : typeof metadata.contentType === "string"
          ? metadata.contentType
          : null,
  };
};

export const uploadSignatureAsset = async (input: {
  storagePath: string;
  content: Buffer;
  contentType: string;
}) => {
  const { error } = await supabaseStorage.storage.from(signaturesBucket).upload(
    input.storagePath,
    input.content,
    {
      contentType: input.contentType,
      upsert: true,
    },
  );

  if (error) {
    throwStorageError(
      "STORAGE_UPLOAD_SIGNATURE_ASSET_FAILED",
      error.message,
      {
        bucket: signaturesBucket,
        storagePath: input.storagePath,
        contentType: input.contentType,
      },
      error,
    );
  }

  return {
    bucket: signaturesBucket,
    path: input.storagePath,
    sizeBytes: input.content.byteLength,
    mimeType: input.contentType,
  };
};
