// Runs a checked-in acceptance scenario only inside an existing quarantined clone.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const [workArg, scenario]=process.argv.slice(2);
assert(process.argv.includes('--confirm-isolated'));
assert(['payment-crash','finalization-crash','source-failures','continuity','notification-delivery'].includes(scenario));
process.umask(0o077);
const work=path.resolve(workArg),runtime=JSON.parse(await readFile(path.join(work,'runtime.json'),'utf8'));
assert(runtime.success && /^darci-app-recovery-[a-f0-9]{8}$/.test(runtime.name));
const execute=promisify(execFile);
const docker=async args=>(await execute('docker',args,{maxBuffer:4*1024*1024})).stdout;
assert.equal(JSON.parse(await docker(['network','inspect',runtime.name]))[0].Internal,true);
const container=JSON.parse(await docker(['inspect',runtime.name+'-api']))[0];
assert.deepEqual(Object.keys(container.NetworkSettings.Networks),[runtime.name]);
assert.equal(Object.keys(container.HostConfig.PortBindings??{}).length,0);
const source=await readFile(new URL('./phase1-'+scenario+'.cjs',import.meta.url),'utf8');
const result=await new Promise((resolve,reject)=>{
 const child=spawn('docker',['exec','-i',runtime.name+'-api','node'],{stdio:['pipe','pipe','pipe']});let out='',err='';
 const timer=setTimeout(()=>child.kill('SIGKILL'),12*60_000);
 child.stdout.on('data',chunk=>{out+=chunk;for(const line of chunk.toString().split('\n'))if(line.startsWith('PROGRESS '))console.log(line);});
 child.stderr.on('data',chunk=>err+=chunk);
 child.on('error',reject);child.on('exit',async code=>{
  clearTimeout(timer);await writeFile(path.join(work,scenario+'-private.log'),out+'\n'+err,{mode:0o600});
  const line=out.split('\n').find(line=>line.startsWith('RESULT '));
  if(code===0&&line)resolve(JSON.parse(line.slice(7)));else reject(new Error('Isolated '+scenario+' failed; inspect private log in recovery directory'));
 });child.stdin.end(source);
});
const report={...result,snapshotId:runtime.snapshotId,completedAt:new Date().toISOString()};
await writeFile(path.join(work,scenario+'-report.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));
