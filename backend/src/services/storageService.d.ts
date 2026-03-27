export declare const supabaseStorage: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const documentsBucket: string;
export declare const signaturesBucket: string;
export declare const notarizedBucket: string;
export declare const createDocumentUploadUrl: (storagePath: string) => Promise<{
    bucket: string;
    path: string;
    signedUrl: string;
    token: string;
}>;
export declare const createSignatureUploadUrl: (storagePath: string) => Promise<{
    bucket: string;
    path: string;
    signedUrl: string;
    token: string;
}>;
export declare const getDocumentObjectMetadata: (storagePath: string) => Promise<{
    sizeBytes: number | null;
    mimeType: string | null;
} | null>;
export declare const getSignatureObjectMetadata: (storagePath: string) => Promise<{
    sizeBytes: number | null;
    mimeType: string | null;
} | null>;
//# sourceMappingURL=storageService.d.ts.map