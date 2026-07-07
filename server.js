require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const path = require('path');

const app = express();
// Required so rate limiting sees real client IPs behind Render/nginx/Cloudflare
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const CHAT_API_TOKEN = process.env.CHAT_API_TOKEN || '';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 30;
const DAILY_LIMIT_PER_IP = Number(process.env.DAILY_LIMIT_PER_IP) || 50;
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 1024;

// Provider chain: comma-separated list of providers to try in order.
// e.g. PROVIDER_CHAIN=groq,gemini,openai
// Falls back to legacy AI_PROVIDER / FALLBACK_PROVIDER if not set.
const PROVIDER_CHAIN = process.env.PROVIDER_CHAIN
  ? process.env.PROVIDER_CHAIN.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean)
  : [
      (process.env.AI_PROVIDER || 'groq').toLowerCase(),
      ...(process.env.FALLBACK_PROVIDER ? [process.env.FALLBACK_PROVIDER.toLowerCase()] : []),
    ];
const PUBLIC_DIR = path.join(__dirname, 'public');

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  [
    'You are Liams Call AI, a supportive assistant for caregivers and families.',
    'Use warm, clear, practical language.',
    'Do not diagnose medical conditions, prescribe medication, or provide legal directives.',
    'If users mention self-harm or immediate danger, advise contacting local emergency services immediately and suggest a trusted human contact.',
    'Keep responses concise by default and ask a clarifying question when intent is ambiguous.',
  ].join(' ');

// Per-minute rate limit buckets
const requestBuckets = new Map();
// Per-day limit buckets  { date: 'YYYY-MM-DD', count: number }
const dailyBuckets = new Map();

app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID().slice(0, 8);
  next();
});

app.use((req, res, next) => {
  if (!ALLOWED_ORIGIN) return next();
  const origin = req.headers.origin || '';
  if (origin && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-chat-token');
    return res.sendStatus(204);
  }
  return next();
});


app.use((req, res, next) => {
  if (req.path !== '/api/chat') return next();
  const now = Date.now();
  const key =
    req.ip ||
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    'unknown';
  const bucket = requestBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: `Rate limit exceeded. Try again in ${Math.ceil(
        RATE_LIMIT_WINDOW_MS / 1000,
      )} seconds.`,
    });
  }
  return next();
});

// Daily message limit per IP
app.use((req, res, next) => {
  if (req.path !== '/api/chat') return next();
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const bucket = dailyBuckets.get(key) || { date: today, count: 0 };
  if (bucket.date !== today) { bucket.date = today; bucket.count = 0; }
  bucket.count += 1;
  dailyBuckets.set(key, bucket);
  if (bucket.count > DAILY_LIMIT_PER_IP) {
    return res.status(429).json({ error: 'Daily message limit reached. Please try again tomorrow.' });
  }
  return next();
});

app.use((req, res, next) => {
  if (!CHAT_API_TOKEN || req.path !== '/api/chat') return next();
  const token = req.headers['x-chat-token'];
  if (token !== CHAT_API_TOKEN) {
    return res.status(401).json({ error: 'Invalid chat token.' });
  }
  return next();
});

// Serve ONLY the public folder — server code, env files, and backups
// live outside the web root and can never be downloaded.
app.use(express.static(PUBLIC_DIR));

function modelForProvider(provider) {
  if (provider === 'groq')     return process.env.GROQ_MODEL    || 'llama-3.3-70b-versatile';
  if (provider === 'gemini')   return process.env.GEMINI_MODEL  || 'gemini-2.0-flash';
  if (provider === 'anthropic') return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

// Returns the ordered list of providers to try, skipping any with no API key configured.
function getProviderCandidates() {
  return PROVIDER_CHAIN
    .map((provider) => ({ provider, model: modelForProvider(provider) }))
    .filter(({ provider }) => {
      if (provider === 'groq')      return !!process.env.GROQ_API_KEY;
      if (provider === 'gemini')    return !!process.env.GEMINI_API_KEY;
      if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
      if (provider === 'openai')    return !!process.env.OPENAI_API_KEY;
      return false;
    });
}

function getApiConfig(provider, modelOverride) {
  const model = modelOverride || modelForProvider(provider);

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('Missing GROQ_API_KEY in environment variables.');
    return {
      provider,
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      buildBody: (messages) => ({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        stream: true,
        max_tokens: MAX_TOKENS,
      }),
    };
  }

  // Gemini via Google's OpenAI-compatible endpoint — same streaming format as Groq/OpenAI
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY in environment variables.');
    return {
      provider,
      url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      buildBody: (messages) => ({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        stream: true,
        max_tokens: MAX_TOKENS,
      }),
    };
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY in environment variables.');
    return {
      provider,
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      buildBody: (messages) => ({
        model,
        system: SYSTEM_PROMPT,
        messages,
        stream: true,
        max_tokens: MAX_TOKENS,
      }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY in environment variables.');
  return {
    provider: 'openai',
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    buildBody: (messages) => ({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      max_tokens: MAX_TOKENS,
    }),
  };
}

function sanitizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) throw new Error('messages must be an array.');
  const cleaned = rawMessages
    .filter((item) => item && typeof item.content === 'string')
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content.trim().slice(0, 4000),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-20);
  if (!cleaned.length) throw new Error('At least one non-empty message is required.');
  return cleaned;
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseOpenAiDelta(line) {
  const payload = line.replace(/^data:\s*/, '').trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const parsed = JSON.parse(payload);
    return parsed.choices?.[0]?.delta?.content || '';
  } catch {
    return null;
  }
}

function parseAnthropicEvent(eventName, dataLine) {
  if (!dataLine.startsWith('data:')) return null;
  const payload = dataLine.replace(/^data:\s*/, '').trim();
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    if (eventName === 'content_block_delta') return parsed.delta?.text || '';
  } catch {
    return null;
  }
  return null;
}

function parseUpstreamError(errorText, statusCode) {
  let message = errorText || `Upstream API returned ${statusCode}`;
  try {
    const parsed = JSON.parse(errorText);
    message = parsed.error?.message || parsed.message || message;
  } catch {
    // Keep raw error body.
  }
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function streamProviderResponse(provider, upstream, res) {
  if (!upstream.ok) {
    throw parseUpstreamError(await upstream.text(), upstream.status);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let tokensSent = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (provider === 'anthropic' && line.startsWith('event:')) {
          currentEvent = line.replace('event:', '').trim();
          continue;
        }
        if (!line.startsWith('data:')) continue;
        const delta =
          provider === 'anthropic'
            ? parseAnthropicEvent(currentEvent, line)
            : parseOpenAiDelta(line);
        if (delta) {
          writeSse(res, 'token', { text: delta });
          tokensSent += 1;
        }
      }
    }
  } catch (error) {
    // Mark mid-stream failures so the caller doesn't append a duplicate
    // response from a fallback provider after partial output was sent.
    error.tokensSent = tokensSent;
    throw error;
  }
}

function logInfo(req, message, extra = {}) {
  console.log(
    `[${new Date().toISOString()}] [${req.requestId}] ${message} ${JSON.stringify(
      extra,
    )}`,
  );
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Public health check: intentionally minimal so internal configuration
// (models, rate limits, auth setup) is not disclosed.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: PRIMARY_PROVIDER });
});

app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const startedAt = Date.now();

  try {
    const messages = sanitizeMessages(req.body?.messages);
    const candidates = getProviderCandidates();

    let lastError = null;
    let providerUsed = null;
    let modelUsed = null;

    for (const candidate of candidates) {
      const { provider, model } = candidate;
      try {
        const config = getApiConfig(provider, model);
        const upstream = await fetch(config.url, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify(config.buildBody(messages)),
        });
        await streamProviderResponse(provider, upstream, res);
        providerUsed = provider;
        modelUsed = model;
        break;
      } catch (error) {
        lastError = error;
        logInfo(req, 'provider_failed', {
          provider,
          model,
          message: error.message,
          statusCode: error.statusCode || null,
          tokensSent: error.tokensSent || 0,
        });
        // If this provider already streamed partial output to the client,
        // trying another candidate would append a second full response.
        if (error.tokensSent > 0) break;
      }
    }

    if (!providerUsed) throw lastError || new Error('No providers available.');

    writeSse(res, 'done', { ok: true, provider: providerUsed, model: modelUsed });
    logInfo(req, 'chat_ok', {
      provider: providerUsed,
      model: modelUsed,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    writeSse(res, 'error', {
      message: error.message || 'Unable to complete the chat request.',
    });
    logInfo(req, 'chat_error', {
      message: error.message,
      durationMs: Date.now() - startedAt,
    });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Liams Call AI server running at http://localhost:${PORT}`);
  const configured = getProviderCandidates();
  console.log(`Provider chain: ${configured.map((c) => `${c.provider}(${c.model})`).join(' → ')}`);
  if (configured.length === 0) console.warn('WARNING: No AI providers configured — chat will fail.');
});
