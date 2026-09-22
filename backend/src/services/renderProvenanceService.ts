import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export const sourceDigest=(source:string)=>createHash('sha256').update(Buffer.from(source,'utf8')).digest('hex');
export async function recordRenderProvenance(input:{runId:string;versionId:string;source:string;artifactId:string;ruleSnapshot:Record<string,unknown>}) {
  const db=createClient(process.env.SUPABASE_URL ?? '',process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',{auth:{persistSession:false}});
  const {error}=await db.rpc('record_document_render_provenance',{
    p_run_id:input.runId,p_version_id:input.versionId,p_artifact_id:input.artifactId,
    p_source:input.source,p_source_hash:sourceDigest(input.source),p_rule_snapshot:input.ruleSnapshot,
    p_renderer_revision:process.env.SENTRY_RELEASE ?? process.env.GIT_SHA ?? 'local-unversioned',
  });
  if(error)throw new Error('Required template provenance could not be recorded');
}
