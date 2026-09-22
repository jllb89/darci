// Isolated recovery only. No arbitrary upstream/proxying and no request logging.
const http = require('node:http');
const routes = { '/auth/v1': ['auth', 9999], '/rest/v1': ['rest', 3000], '/storage/v1': ['storage', 5000] };
http.createServer((req, res) => {
  const prefix = Object.keys(routes).find(p => req.url === p || req.url.startsWith(p + '/') || req.url.startsWith(p + '?'));
  if (!prefix) { res.writeHead(404).end(); return; }
  const [host, port] = routes[prefix];
  const headers = { ...req.headers, host: `${host}:${port}` };
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  const proxy = http.request({ host, port, path: req.url.slice(prefix.length) || '/', method: req.method, headers }, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
  });
  proxy.setTimeout(15000, () => proxy.destroy());
  proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(proxy);
}).listen(8000, '0.0.0.0');
