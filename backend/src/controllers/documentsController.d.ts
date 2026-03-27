import { Request, Response } from "express";
export declare const createDocument: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
export declare const finalizeDocumentUpload: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
export declare const getDocument: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const listDocuments: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const listDocumentVersions: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getDocumentTimeline: (req: Request, res: Response) => Promise<void>;
export declare const getSignatureFields: (req: Request, res: Response) => Promise<void>;
export declare const signDocument: (req: Request, res: Response) => Promise<void>;
export declare const requestSignatureUpload: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
export declare const finalizeSignatureUpload: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
export declare const submitNotarization: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
export declare const appendAcknowledgment: (req: Request, res: Response) => Promise<void>;
export declare const watermarkDocument: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=documentsController.d.ts.map