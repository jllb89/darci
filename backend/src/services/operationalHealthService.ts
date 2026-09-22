import { createClient } from '@supabase/supabase-js';
import { readySafetyRedis } from '../middleware/productionSafety';
import { getStripeEnvironment } from '../config/stripe';
import { isProtectedIdentityConfigured } from './protectedIdentityService';

export const workerHeartbeatKey = () => `darci:health:${process.env.APP_ENV ?? 'local'}:worker`;
export async function publishWorkerHeartbeat() {
  const redis = await readySafetyRedis();
  await redis.set(workerHeartbeatKey(),JSON.stringify({at:new Date().toISOString(),release:process.env.SENTRY_RELEASE ?? 'unknown'}),'EX',90);
}

export async function checkOperationalReadiness() {
  const checks = { database:false, configuration:false, identityProtection:isProtectedIdentityConfigured(), redis:false, worker:false };
  await Promise.all([
    (async()=>{
      try {
        const db=createClient(process.env.SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',{auth:{persistSession:false}});
        const {data,error}=await db.from('billing_runtime_configuration').select('stripe_environment').eq('singleton',true)
          .abortSignal(AbortSignal.timeout(2500)).single();
        checks.database=!error;
        checks.configuration=!error && data?.stripe_environment===getStripeEnvironment();
      } catch { /* no dependency diagnostics in public responses */ }
    })(),
    (async()=>{
      try {
        const redis=await readySafetyRedis();
        checks.redis=(await redis.ping())==='PONG';
        const heartbeat=await redis.get(workerHeartbeatKey());
        const at=heartbeat ? Date.parse(JSON.parse(heartbeat).at) : NaN;
        checks.worker=Number.isFinite(at) && Date.now()-at >= 0 && Date.now()-at < 90_000;
      } catch { /* fail readiness closed */ }
    })(),
  ]);
  return { ready:Object.values(checks).every(Boolean), checks };
}
