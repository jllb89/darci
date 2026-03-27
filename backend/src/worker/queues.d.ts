import { Queue } from "bullmq";
import IORedis from "ioredis";
export declare const connection: IORedis | undefined;
export declare const hashingQueue: Queue<any, any, string, any, any, string> | null;
export declare const ledgerQueue: Queue<any, any, string, any, any, string> | null;
export declare const webhookQueue: Queue<any, any, string, any, any, string> | null;
//# sourceMappingURL=queues.d.ts.map