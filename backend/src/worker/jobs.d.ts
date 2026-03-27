type HashingJobInput = {
    documentId: string;
    content?: string;
    idn?: string;
};
type LedgerJobInput = {
    idn: string;
    hash: string;
};
type WebhookJobInput = {
    url: string;
    payload: Record<string, unknown>;
};
export declare const enqueueHashing: (input: HashingJobInput) => Promise<string | undefined>;
export declare const enqueueLedgerAnchor: (input: LedgerJobInput) => Promise<string | undefined>;
export declare const enqueueWebhook: (input: WebhookJobInput) => Promise<string | undefined>;
export {};
//# sourceMappingURL=jobs.d.ts.map