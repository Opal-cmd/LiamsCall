const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startServer(t) {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      ALLOWED_ORIGIN: '',
      RATE_LIMIT_MAX_REQUESTS: '1',
      RATE_LIMIT_WINDOW_MS: '60000',
      DAILY_LIMIT_PER_IP: '1000',
      PROVIDER_CHAIN: 'openai',
      OPENAI_API_KEY: '',
      GEMINI_API_KEY: '',
      GROQ_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      TURNSTILE_SITE_KEY: '',
      TURNSTILE_SECRET_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  t.after(() => {
    if (child.exitCode === null) child.kill('SIGTERM');
  });

  for (let i = 0; i < 50; i += 1) {
    if (/server running/i.test(output)) return { port };
    if (child.exitCode !== null) {
      throw new Error(`server exited ${child.exitCode}: ${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`server did not become ready: ${output}`);
}

async function postChat(port, forwardedFor) {
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'node-test',
      'X-Forwarded-For': forwardedFor,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'hello' }],
    }),
  });
  await res.text();
  return res;
}

test('rate limiting ignores spoofed leftmost X-Forwarded-For hops', async (t) => {
  const { port } = await startServer(t);

  const first = await postChat(port, '203.0.113.10, 198.51.100.77');
  assert.equal(first.status, 200);

  const second = await postChat(port, '203.0.113.11, 198.51.100.77');
  assert.equal(second.status, 429);
});
