import { createClient } from '@supabase/supabase-js';
import { AuthDependencyError, readAuthDependency } from '../auth/readAuthDependency';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function isAuthSessionActive(userId: string, sessionId: unknown): Promise<boolean> {
  if (!uuid.test(userId) || typeof sessionId !== 'string' || !uuid.test(sessionId)) return false;
  const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await readAuthDependency('session_liveness', signal =>
    db.rpc('is_auth_session_active', { p_user_id: userId, p_session_id: sessionId }).abortSignal(signal));
  if (typeof data !== 'boolean') throw new AuthDependencyError('session_liveness', 'AUTH_READ_INVALID_RESPONSE', false, 1, 0, null);
  return data;
}
