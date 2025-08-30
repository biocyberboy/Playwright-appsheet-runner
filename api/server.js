// Minimal HTTP server to trigger Playwright test and serve report
// Usage: node api/server.js

const http = require('http');
const { spawn } = require('child_process');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 9323;
let CURRENT_PORT = DEFAULT_PORT;
const REPORT_DIR = path.resolve(process.cwd(), 'playwright-report');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
  };
  const contentType = types[ext] || 'application/octet-stream';
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  });
}

function runTestOld(callback) {
  const isWin = process.platform === 'win32';
  const bin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    isWin ? 'playwright.cmd' : 'playwright'
  );
  const args = ['test', '--project=chromium', '-g', 'homepage title is correct'];
  const startedAt = Date.now();
  const child = isWin
    ? spawn(`"${bin}" ${args[0]} ${args[1]} ${args[2]} "${args[3]}"`, {
        shell: true,
        stdio: 'pipe',
        cwd: process.cwd(),
        env: process.env,
      })
    : spawn(bin, args, {
        shell: false,
        stdio: 'pipe',
        cwd: process.cwd(),
        env: process.env,
      });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d.toString()))
  child.stderr.on('data', (d) => (stderr += d.toString()))
  child.on('error', (err) => {
    callback({ code: -1, passed: false, startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt, stdout, stderr: String(err) });
  });
  child.on('close', (code) => {
    const endedAt = Date.now();
    const passed = code === 0;
    callback({
      code,
      passed,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      stdout,
      stderr,
    });
  });
}

// New runner supporting options like headed/debug and dynamic pattern/spec/project
function runTest(options, callback) {
  const isWin = process.platform === 'win32';
  const bin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    isWin ? 'playwright.cmd' : 'playwright'
  );
  const safeProject = (() => {
    const p = (options && options.project) || 'chromium';
    return ['chromium', 'firefox', 'webkit'].includes(String(p)) ? String(p) : 'chromium';
  })();
  const args = ['test', `--project=${safeProject}`];
  if (options && options.spec) {
    // Whitelist spec path to tests/* and safe chars
    const specRaw = String(options.spec).replace(/\\/g, '/');
    if (/^tests\/[A-Za-z0-9_\-/.]+\.ts$/.test(specRaw) && !specRaw.includes('..')) {
      args.push(specRaw);
    }
  }
  if (options && options.pattern) {
    // Basic sanitize for -g pattern (no quotes or shell metachars)
    const pat = String(options.pattern);
    if (!/["'`|&;<>]/.test(pat)) {
      args.push('-g');
      args.push(pat);
    }
  } else if (!options || (!options.spec && !options.pattern)) {
    // Default to TA88 test pattern
    args.push('-g');
    args.push('homepage title is correct');
  }
  if (options && options.headed === true) {
    args.push('--headed');
    args.push('--workers=1');
  }
  if (options && options.debug === true) {
    args.push('--debug');
  }
  const startedAt = Date.now();
  const cmdStr = `"${bin}" ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;
  const child = isWin
    ? spawn(cmdStr, { shell: true, stdio: 'pipe', cwd: process.cwd(), env: process.env })
    : spawn(bin, args, { shell: false, stdio: 'pipe', cwd: process.cwd(), env: process.env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d.toString()))
  child.stderr.on('data', (d) => (stderr += d.toString()))
  child.on('error', (err) => {
    callback({ code: -1, passed: false, startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt, stdout, stderr: String(err) });
  });
  child.on('close', (code) => {
    const endedAt = Date.now();
    const passed = code === 0;
    callback({
      code,
      passed,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      stdout,
      stderr,
    });
  });
}

function createServer() {
  return http.createServer((req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    const { pathname, query } = parse(req.url || '/', true);
    if (pathname === '/health') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true }));
    }

    if (pathname === '/api/run-ta88-test' || pathname === '/api/run-ta88-test/') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const headed = query && (query.headed === '1' || query.headed === 'true');
      const debug = query && (query.debug === '1' || query.debug === 'true');
      runTest({ headed, debug }, (result) => {
      const host = req.headers.host || `localhost:${CURRENT_PORT}`;
      const reportUrl = `http://${host}/report/index.html`;
        const payload = {
          status: result.passed ? 'passed' : 'failed',
          reportUrl,
          durationMs: result.durationMs,
          startedAt: new Date(result.startedAt).toISOString(),
          endedAt: new Date(result.endedAt).toISOString(),
        };
        if (query && (query.logs === '1' || query.logs === 'true')) {
          payload.stdout = result.stdout;
          payload.stderr = result.stderr;
        }
        res.end(JSON.stringify(payload));
      });
      return;
    }

    // Generic endpoint: run arbitrary test by file or grep pattern
    if (pathname === '/api/run-test' || pathname === '/api/run-test/') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const headed = query && (query.headed === '1' || query.headed === 'true');
      const debug = query && (query.debug === '1' || query.debug === 'true');
      const project = query && typeof query.project === 'string' ? query.project : 'chromium';
      const spec = query && typeof query.spec === 'string' ? query.spec : undefined;
      const pattern = query && typeof query.g === 'string' ? query.g : undefined;
      runTest({ headed, debug, project, spec, pattern }, (result) => {
        const host = req.headers.host || `localhost:${CURRENT_PORT}`;
        const reportUrl = `http://${host}/report/index.html`;
        const payload = {
          status: result.passed ? 'passed' : 'failed',
          reportUrl,
          durationMs: result.durationMs,
          startedAt: new Date(result.startedAt).toISOString(),
          endedAt: new Date(result.endedAt).toISOString(),
        };
        if (query && (query.logs === '1' || query.logs === 'true')) {
          payload.stdout = result.stdout;
          payload.stderr = result.stderr;
        }
        res.end(JSON.stringify(payload));
      });
      return;
    }

    // Convenience endpoint for SauceDemo login spec
    if (pathname === '/api/run-login-test' || pathname === '/api/run-login-test/') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const headed = query && (query.headed === '1' || query.headed === 'true');
      const debug = query && (query.debug === '1' || query.debug === 'true');
      runTest({ headed, debug, spec: 'tests/login.spec.ts', project: 'chromium' }, (result) => {
        const host = req.headers.host || `localhost:${CURRENT_PORT}`;
        const reportUrl = `http://${host}/report/index.html`;
        const payload = {
          status: result.passed ? 'passed' : 'failed',
          reportUrl,
          durationMs: result.durationMs,
          startedAt: new Date(result.startedAt).toISOString(),
          endedAt: new Date(result.endedAt).toISOString(),
        };
        if (query && (query.logs === '1' || query.logs === 'true')) {
          payload.stdout = result.stdout;
          payload.stderr = result.stderr;
        }
        res.end(JSON.stringify(payload));
      });
      return;
    }

    // Serve static report under /report
    if (pathname && pathname.startsWith('/report')) {
      const rel = pathname.replace(/^\/report/, '') || '/index.html';
      const filePath = path.join(REPORT_DIR, rel);
      return serveFile(filePath, res);
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not Found' }));
  });
}

function start(port, attemptsLeft = 20) {
  const server = createServer();
  server.on('listening', () => {
    const addr = server.address();
    const chosenPort = typeof addr === 'object' && addr && 'port' in addr ? addr.port : port;
    CURRENT_PORT = chosenPort;
    console.log(`API server listening on http://localhost:${CURRENT_PORT}`);
    console.log(`- TA88 test:     http://localhost:${CURRENT_PORT}/api/run-ta88-test`);
    console.log(`- Login test:    http://localhost:${CURRENT_PORT}/api/run-login-test`);
    console.log(`- Generic:       http://localhost:${CURRENT_PORT}/api/run-test?spec=tests/login.spec.ts`);
    console.log(`- Report (last): http://localhost:${CURRENT_PORT}/report/index.html`);
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const next = port + 1;
      console.warn(`Port ${port} in use, trying ${next}...`);
      setTimeout(() => start(next, attemptsLeft - 1), 200);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
  server.listen(port);
}

start(CURRENT_PORT);
