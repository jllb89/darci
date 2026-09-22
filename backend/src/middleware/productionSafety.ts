import { createHmac, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { captureMessage } from '../utils/sentry';

export const safeRequestPath = (path: string) => path.split('?')[0]!
  .replace(/(\/invites\/public\/)[^/]+/g, '$1[redacted]')
  .replace(/(\/verify\/)[^/]+/g, '$1[idn]');

export const safeRequestId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.:;=\-]{1,128}$/.test(value)
  ? value : randomUUID();

export function apiSecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Cache-Control','no-store');
  if (process.env.APP_ENV === 'production') res.setHeader('Strict-Transport-Security','max-age=31536000');
  next();
}

export function abusePolicy(method: string, path: string) {
  if (/^\/auth\//.test(path)) return { name: 'auth', limit: 20 };
  if (/^\/(verify|verification)(\/|$)/.test(path)) return { name: 'verification', limit: 60 };
  if (/^\/invites\/public\//.test(path)) return { name: 'invite', limit: 30 };
  if (['GET','HEAD','OPTIONS'].includes(method)) return null;
  if (/^\/billing\//.test(path)) return { name: 'billing', limit: 15 };
  if (/^\/documents\//.test(path)) return { name: 'document_mutation', limit: 30 };
  if (/^\/(notary|requests)\//.test(path)) return { name: 'session_mutation', limit: 90 };
  return null;
}

let redis: Redis | null = null;
export function getSafetyRedis() {
  if (!process.env.REDIS_URL) throw new Error('Safety Redis is not configured');
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, commandTimeout: 2000,
      connectTimeout: 2000, enableOfflineQueue: false, lazyConnect: true });
    redis.on('error', () => { /* reported by the operation, without URL/credentials */ });
  }
  return redis;
}
let connecting: Promise<void> | null = null;
export async function readySafetyRedis() {
  const client = getSafetyRedis();
  if (client.status === 'wait' || client.status === 'end') {
    connecting ??= client.connect().finally(() => { connecting = null; });
  }
  if (connecting) await connecting;
  return client;
}

// Atomic across API replicas; keys contain neither IP nor account identifiers.
export const RATE_LIMIT_SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count`;
let lastFailureAlert = 0;
export async function enforceAbuseLimits(req: Request, res: Response, next: NextFunction) {
  const enabled = process.env.ABUSE_CONTROLS_ENABLED === 'true' || process.env.APP_ENV === 'production';
  const policy = abusePolicy(req.method, req.path);
  if (!enabled || !policy) { next(); return; }
  try {
    const secret = process.env.ABUSE_RATE_KEY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error('Rate-limit key is missing');
    // req.ip is derived only from the explicit trusted proxy configuration.
    const digest = createHmac('sha256',secret).update(req.ip ?? req.socket.remoteAddress ?? 'unknown').digest('hex');
    const key = `darci:safety:${process.env.APP_ENV ?? 'local'}:${policy.name}:${digest}`;
    const client = await readySafetyRedis();
    const count = Number(await client.eval(RATE_LIMIT_SCRIPT,1,key,'60000'));
    if (!Number.isFinite(count)) throw new Error('Rate-limit response invalid');
    if (count > policy.limit) {
      res.setHeader('Retry-After','60');
      res.status(429).json({error:'rate_limited',message:'Too many attempts. Please wait a minute and try again.',requestId:req.requestId});
      return;
    }
    next();
  } catch {
    if (Date.now()-lastFailureAlert > 60_000) {
      lastFailureAlert=Date.now();
      captureMessage('security.abuse_control_unavailable',{level:'error',tags:{operation:'abuse_control'},fingerprint:['abuse_control_unavailable']});
    }
    res.status(503).json({error:'temporarily_unavailable',message:'Please try again shortly.',requestId:req.requestId});
  }
}
