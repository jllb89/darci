// Keep disposable CI credentials out of Actions logs/artifacts. Never persist raw CLI output.
import {spawnSync} from 'node:child_process';
import {writeFileSync, appendFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripVTControlCharacters} from 'node:util';

export function sanitize(output) {
  return stripVTControlCharacters(output)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[REDACTED KEY]')
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
    .replace(/((?:anon[ _-]?key|service[ _-]?role(?:[ _-]?key)?|jwt[ _-]?secret|secret[ _-]?key|publishable[ _-]?key|password|authorization)["']?\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]');
}

export function retryableImageFailure(output) {
  // A SQL failure must never be retried or mistaken for a registry outage.
  if (/SQLSTATE|Applying migration|Initializing schema|migration.*(?:failed|error)/i.test(output)) return false;
  return /(?:ghcr\.io|public\.ecr\.aws|registry-1\.docker\.io|pull(?:ing)? (?:image|access)|failed to (?:pull|download))/i.test(output)
    && /(?:too many requests|toomanyrequests|\b429\b|\b50[234]\b|i\/o timeout|TLS handshake timeout|connection reset|unexpected EOF|temporary failure in name resolution)/i.test(output);
}

export function bootstrap(workdir, {
  run = args => spawnSync('supabase', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}),
  write = writeFileSync,
  log = console.log,
} = {}) {
  const diagnosticPath = join(workdir, 'bootstrap.sanitized.log');
  let transcript = '';
  const record = (label, result, includeStdout = true) => {
    transcript += sanitize(`\n${label}: exit ${result.status ?? 'unknown'}\n${includeStdout ? result.stdout ?? '' : ''}\n${result.stderr ?? ''}\n${result.error?.message ?? ''}\n`);
    write(diagnosticPath, transcript, {mode: 0o600});
  };
  const fail = result => {
    log(transcript.split('\n').slice(-160).join('\n'));
    log('Supabase bootstrap failed. Full sanitized diagnostics are saved in the database-bootstrap artifact.');
    return result.status || 1;
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    log(`Starting disposable Supabase (attempt ${attempt}/2).`);
    const result = run(['start', '--workdir', workdir, '-x', 'studio,imgproxy,logflare,vector,supavisor,realtime,edge-runtime']);
    record(`start attempt ${attempt}`, result);
    if (result.status === 0) break;
    if (attempt === 2 || !retryableImageFailure(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)) return fail(result);
    log('Transient container-image download failure; retrying once with the same CLI and migrations.');
  }
  const status = run(['status', '--workdir', workdir, '-o', 'json']);
  // stdout is credential-bearing JSON: keep it private for the API tests, never in diagnostics.
  record('status', status, false);
  if (status.status !== 0) return fail(status);
  try {
    JSON.parse(status.stdout);
  } catch {
    record('status validation', {status: 1, stderr: 'CLI did not return valid status JSON.'}, false);
    return fail({status: 1});
  }
  write(join(workdir, 'status.json'), status.stdout, {mode: 0o600});
  log('Disposable Supabase started; migrations installed. Continuing with mandatory database-security tests.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const workdir = process.argv[2];
  if (!workdir) throw new Error('Usage: node scripts/supabase-ci-bootstrap.mjs <disposable-workdir>');
  process.exitCode = bootstrap(workdir);
  if (process.exitCode && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n### Database bootstrap failed\nSee the startup step and `database-bootstrap` artifact for sanitized diagnostics. No security checks were bypassed.\n');
  }
}
