const sensitiveKey = /authorization|cookie|password|secret|token|email|phone|masked.?identifier|document.?number|document.?last4|signature.?data|seal.?data|latitude|longitude|gps|address|notes|subject.?name|recipient.?name|first.?name|last.?name|^body$|^payload$|^content$|^template.?source$/i;

export function redactTelemetryString(value: string) {
  return value
    .replace(/(\/invites\/public\/)[^/?\s]+/g,'$1[redacted]')
    .replace(/https?:\/\/[^\s"<>]+/g,raw=>{
      try { const url=new URL(raw);url.username='';url.password='';url.search='';url.hash='';return url.toString(); }
      catch { return '[redacted-url]'; }
    })
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_]+|\bwhsec_[A-Za-z0-9+/=_-]+/g,'[redacted-key]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted-jwt]')
    .replace(/[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[redacted-email]');
}

export function redactTelemetry<T>(input:T,depth=0):T {
  if(depth>16)return '[depth-limit]' as T;
  if(typeof input==='string')return redactTelemetryString(input) as T;
  if(Array.isArray(input))return input.slice(0,500).map(value=>redactTelemetry(value,depth+1)) as T;
  if(input && typeof input==='object') {
    return Object.fromEntries(Object.entries(input).map(([key,value])=>[
      key,sensitiveKey.test(key)?'[redacted]':redactTelemetry(value,depth+1),
    ])) as T;
  }
  return input;
}

export function redactSentryEvent<T extends {request?:unknown;user?:unknown}>(event:T):T {
  const safe=redactTelemetry(event);
  if(safe.request && typeof safe.request==='object') {
    const request=safe.request as Record<string,unknown>;
    delete request.data;delete request.cookies;delete request.query_string;
    // Only retain the non-sensitive correlation headers, never request credentials.
    const headers=request.headers as Record<string,unknown>|undefined;
    request.headers=headers?Object.fromEntries(Object.entries(headers).filter(([key])=>['content-type','x-request-id'].includes(key.toLowerCase()))):{};
  }
  if(safe.user && typeof safe.user==='object')safe.user={id:(safe.user as {id?:unknown}).id};
  return safe;
}
