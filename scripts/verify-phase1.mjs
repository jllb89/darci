// One consolidated local gate; no hosted writes, provider fixtures or deployments.
// Real staging/recovery acceptance receipts remain separate, explicitly scoped evidence.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const folder=await mkdtemp(path.join(tmpdir(),'darci-phase1-gate-'));
const report={startedAt:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),diffSha256:createHash('sha256').update(execFileSync('git',['diff','HEAD'],{cwd:root})).digest('hex'),checks:[],scope:'Local engineering validation. Not device, legal, live-money or deployed acceptance.'};
const checks=[
 ['types-build','packages/types',['npm','run','build']],
 ['backend-build','backend',['npm','run','build']],
 ['backend-tests','backend',['npm','test','--','--reporter=dot']],
 ['observability-catalog','backend',['npm','run','observability:validate']],
 ['observability-kpis','backend',['npm','run','observability:kpis']],
 ['recovery-monitoring-workflows','.',[process.execPath,'--test','infra/recovery/stack.test.mjs','infra/recovery/drill.test.mjs','infra/monitoring/stack.test.mjs','scripts/workflow-gates.test.mjs','scripts/workflow-structure.test.mjs']],
 ['web-tests','apps/web',['npm','test','--','--reporter=dot']],
 ['web-types','apps/web',['npx','tsc','--noEmit']],
 ['diff-check','.', ['git','diff','--check']],
];
for(const [name,cwd,[command,...args]] of checks){
 const started=Date.now(),logPath=path.join(folder,name+'.log'),file=await open(logPath,'w',0o600);
 console.log(JSON.stringify({stage:name,status:'running'}));
 const code=await new Promise(resolve=>{
  const child=spawn(command,args,{cwd:path.join(root,cwd),env:{...process.env,NODE_OPTIONS:'',OTEL_SDK_DISABLED:'1'},stdio:['ignore',file.fd,file.fd]});
  const timer=setTimeout(()=>child.kill('SIGTERM'),10*60_000);
  child.on('error',()=>{clearTimeout(timer);resolve(-1);});child.on('exit',n=>{clearTimeout(timer);resolve(n??-1);});
 });
 await file.close();report.checks.push({name,passed:code===0,exitCode:code,seconds:(Date.now()-started)/1000,logPath});
 await writeFile(path.join(folder,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify(report.checks.at(-1)));
}
report.completedAt=new Date().toISOString();report.passed=report.checks.every(c=>c.passed);
await writeFile(path.join(folder,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({passed:report.passed,report:path.join(folder,'report.json')}));
process.exitCode=report.passed?0:1;
