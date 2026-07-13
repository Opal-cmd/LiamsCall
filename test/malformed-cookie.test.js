const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const test = require('node:test');

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for server startup.'));
    }, 5000);

    function cleanup() {
      clearTimeout(timer);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    }

    function onStdout(chunk) {
      if (chunk.toString().includes('Liams Call AI server running')) {
        cleanup();
        resolve();
      }
    }

    function onStderr(chunk) {
      const message = chunk.toString();
      if (/EADDRINUSE|SyntaxError|TypeError/.test(message)) {
        cleanup();
        reject(new Error(message));
      }
    }

    function onExit(code, signal) {
      cleanup();
      reject(new Error(`Server exited before startup: ${code ?? signal}`));
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 1000).unref();
  });
}

test('malformed captcha cookie is rejected without crashing the server', async (t) => {
  const port = await getOpenPort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      TURNSTILE_SITE_KEY: 'test-site-key',
      TURNSTILE_SECRET_KEY: 'test-secret-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => stopServer(child));

  await waitForServer(child);

  const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'lc_captcha=%E0%A4%A',
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'I need caregiver support.' }] }),
  });

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.captchaRequired, true);

  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
});
