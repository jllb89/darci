// Executed inside the exact production worker image. No customer fixtures,
// persisted objects, messages or provider calls. Temporary files die with task.
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
let stage='configuration';
async function main() {
  assert.equal(process.env.APP_ENV,'production');
  assert.equal(process.env.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  stage='dependency-readiness';
  const {checkOperationalReadiness}=require('/app/dist/services/operationalHealthService');
  const readiness=await checkOperationalReadiness(); assert.equal(readiness.ready,true);
  stage='billing-gates';
  const {createClient}=require('/app/node_modules/@supabase/supabase-js');
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const config=await db.from('billing_runtime_configuration').select('stripe_environment,live_activation_approved').single();
  assert(!config.error); assert.deepEqual(config.data,{stripe_environment:'live',live_activation_approved:false});
  const blocked=await db.rpc('assert_stripe_runtime_environment',{p_environment:'live'});
  assert(blocked.error?.message.includes('STRIPE_LIVE_ACTIVATION_DISABLED'));
  assert.throws(()=>require('/app/dist/config/stripe').getStripeClient());
  assert.equal(process.env.STRIPE_LIVE_MODE_ENABLED,'false');
  stage='pdf-generation';
  const PDFDocument=require('/app/node_modules/pdfkit');
  const doc=new PDFDocument(); const parts=[];
  const pdf=await new Promise((resolve,reject)=>{doc.on('data',p=>parts.push(p));doc.on('end',()=>resolve(Buffer.concat(parts)));doc.on('error',reject);doc.text('DARCi isolated production runtime smoke. No legal document.');doc.end();});
  const parsed=await require('/app/node_modules/pdf-lib').PDFDocument.load(pdf);
  assert.equal(parsed.getPageCount(),1);
  stage='pdf-temp-write';
  fs.writeFileSync('/tmp/production-runtime-smoke.pdf',pdf);
  stage='qpdf-check';
  execFileSync('qpdf',['--check','/tmp/production-runtime-smoke.pdf'],{stdio:'pipe'});
  execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','200','-png','/tmp/production-runtime-smoke.pdf','/tmp/production-runtime-smoke'],{stdio:'pipe'});
  assert(fs.statSync('/tmp/production-runtime-smoke.png').size>100);
  // The production NAT address is intentionally NOT the approved operator IP.
  stage='non-operator-edge';
  const target='darci-production-1695242078.us-east-1.elb.amazonaws.com';
  await require('node:dns').promises.lookup(target);
  await assert.rejects(fetch(`http://${target}`,{signal:AbortSignal.timeout(6000)}),error=>error.name==='TimeoutError');
  console.log(JSON.stringify({passed:true,scope:'Exact production image/private network smoke; no persisted fixtures or customer workflow acceptance',readiness:readiness.checks,
    liveWritesBlocked:true,stripeClientDisabled:true,pdfParseQpdfRender:true,nonOperatorEdgeAccessBlocked:true}));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(JSON.stringify({passed:false,stage,kind:error.name,code:error.code,reason:error instanceof assert.AssertionError?error.message:'Runtime smoke operation failed'}));process.exit(1);});
