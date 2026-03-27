import { Request, Response } from "express";
export declare const resolveCode: (_req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
export declare const resendCode: (req: Request, res: Response) => Promise<void>;
export declare const regenerateCode: (req: Request, res: Response) => Promise<void>;
export declare const getNotaryContext: (req: Request, res: Response) => Promise<void>;
export declare const signRequest: (req: Request, res: Response) => Promise<void>;
export declare const submitRequest: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=notaryController.d.ts.map