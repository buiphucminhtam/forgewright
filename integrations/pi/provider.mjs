/** Pinned Pi transport. No CLI wrapper, API-key fallback, token refresh or persistence. */
import { readFileSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { PiHostError, fail } from './contracts.mjs';

export function localEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { fail('pi_invalid_local_endpoint'); }
  // Literal addresses avoid DNS/rebinding; redirects are rejected by the fetch boundary.
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password ||
      url.search || url.hash || !/^\/v1\/?$/.test(url.pathname)) fail('pi_invalid_local_endpoint');
  return url.href.replace(/\/$/, '');
}

function readPrivateJson(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 262144) fail('pi_auth_required');
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { fail('pi_auth_required'); }
}

function unexpired(access, expiry) {
  try {
    const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString());
    const expires = Math.min(expiry ?? Infinity, claims.exp * 1000);
    if (!Number.isFinite(expires) || expires < Date.now() + 30000 ||
        typeof claims['https://api.openai.com/auth']?.chatgpt_account_id !== 'string') fail('pi_auth_required');
    return access;
  } catch { fail('pi_auth_required'); }
}

function readCurrentCodexSelection(authRoot) {
  // Python 3.11+ is already required by host admission. Its TOML parser handles
  // literal/escaped strings, comments, tables and duplicate-key rejection.
  // Only two non-secret fields leave this bounded, isolated process.
  const parser = `import json,sys,tomllib
try:
 data=tomllib.loads(sys.stdin.buffer.read(262145).decode('utf-8'))
 if 'profile' in data: raise ValueError('profile requires explicit provider selection')
 model=data.get('model'); provider=data.get('model_provider','openai')
 if not isinstance(provider,str) or (model is not None and not isinstance(model,str)): raise ValueError('invalid selection')
 print(json.dumps({'model':model,'provider':provider}))
except Exception:
 sys.exit(2)
`;
  try {
    const filename = join(authRoot, 'config.toml');
    const info = lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 262144) fail('pi_current_provider_unresolved');
    const input = readFileSync(filename); if (input.length > 262144) fail('pi_current_provider_unresolved');
    const result = spawnSync(process.env.FORGEWRIGHT_PYTHON || 'python3', ['-I', '-B', '-c', parser], {
      input, encoding: 'utf8', shell: false, timeout: 3000, maxBuffer: 8192,
      env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8' },
    });
    if (result.status !== 0 || result.error) fail('pi_current_provider_unresolved');
    const selected = JSON.parse(result.stdout);
    if (typeof selected.provider !== 'string') fail('pi_current_provider_unresolved');
    return selected;
  } catch { fail('pi_current_provider_unresolved'); }
}

export async function resolveProvider(config, { home = homedir(), codexHome = process.env.CODEX_HOME } = {}) {
  if (!['current', 'openai-codex', 'local'].includes(config?.provider)) fail('pi_provider_required');
  const authRoot = codexHome ? resolve(codexHome) : join(home, '.codex');
  let modelId = config.model;
  if (config.provider === 'local') {
    const baseUrl = localEndpoint(config.endpoint);
    if (typeof modelId !== 'string' || !/^[\w./:-]{1,128}$/.test(modelId)) fail('pi_model_required');
    const { stream } = await import('@earendil-works/pi-ai/api/openai-completions');
    return { provider: 'local', authSource: 'local', costBasis: 'local-unpriced',
      model: { id: modelId, name: modelId, provider: 'local', api: 'openai-completions', baseUrl,
        reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
      stream, getApiKey: () => 'local-no-key' };
  }
  if (!['codex', 'pi'].includes(config.authSource)) fail('pi_auth_source_required');
  const { openaiCodexProvider } = await import('@earendil-works/pi-ai/providers/openai-codex');
  const provider = openaiCodexProvider();
  if (config.provider === 'current' && config.authSource === 'codex') {
    const selected = readCurrentCodexSelection(authRoot);
    // A custom route or provider-prefixed external model must not become a
    // different subscription destination just because model_provider is absent.
    if (selected.provider !== 'openai' ||
        (selected.model != null && (typeof selected.model !== 'string' || selected.model.includes('/'))))
      fail('pi_current_provider_incompatible');
    modelId ??= selected.model;
  }
  if (!modelId) fail('pi_model_required');
  const catalog = provider.getModels();
  // Exact host-selected IDs may be newer than the pinned catalog. Use the pinned
  // provider's protocol metadata without changing/falling back from the selected ID.
  if (typeof modelId !== 'string' || !/^[\w./:-]{1,128}$/.test(modelId)) fail('pi_model_required');
  const model = catalog.find((item) => item.id === modelId) ??
    { ...catalog[0], id: modelId, name: modelId };
  const getApiKey = () => {
    if (config.authSource === 'codex') {
      const auth = readPrivateJson(join(authRoot, 'auth.json'));
      if (auth.auth_mode && auth.auth_mode !== 'chatgpt') fail('pi_auth_required');
      return unexpired(auth.tokens?.access_token);
    }
    const credential = readPrivateJson(join(home, '.pi/agent/auth.json'))['openai-codex'];
    if (credential?.type !== 'oauth') fail('pi_auth_required');
    return unexpired(credential.access, credential.expires);
  };
  getApiKey(); // Read-only readiness; never refresh another application's tokens.
  return { provider: 'openai-codex', authSource: config.authSource, model,
    costBasis: 'subscription-quota', stream: provider.stream.bind(provider), getApiKey };
}

/** One stream = at most one request, strict destination and no redirects. Native
 * SSE usage is observed separately because Pi initializes absent usage to zero. */
export function createProviderRequest(provider, { signal, maxTokens, timeoutMs, onUsage, onHttp }) {
  let requests = 0;
  let nativeUsage = null;
  let transportError = null;
  const inspect = (line) => {
    if (!line.startsWith('data:')) return;
    try {
      const data = JSON.parse(line.slice(5).trim());
      const usage = data.response?.usage ?? data.usage;
      if (usage && typeof usage === 'object' && !Array.isArray(usage)) {
        const counts = {};
        for (const key of ['input_tokens', 'output_tokens', 'prompt_tokens', 'completion_tokens', 'total_tokens']) {
          if (Number.isSafeInteger(usage[key]) && usage[key] >= 0) counts[key] = usage[key];
        }
        for (const key of ['input_tokens_details', 'output_tokens_details', 'prompt_tokens_details', 'completion_tokens_details']) {
          const details = {};
          for (const field of ['cached_tokens', 'reasoning_tokens', 'audio_tokens'])
            if (Number.isSafeInteger(usage[key]?.[field]) && usage[key][field] >= 0) details[field] = usage[key][field];
          if (Object.keys(details).length) counts[key] = details;
        }
        if (Object.keys(counts).length) nativeUsage = counts;
      }
    } catch { /* SSE framing, not model text, is the usage source. */ }
  };
  const guardedFetch = async (input, init) => {
    signal.throwIfAborted();
    if (++requests > 1) fail('pi_hidden_retry_denied');
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const base = new URL(provider.model.baseUrl);
    const expectedPath = provider.provider === 'local' ? `${base.pathname.replace(/\/$/, '')}/chat/completions` : '/backend-api/codex/responses';
    if (url.origin !== base.origin || url.pathname !== expectedPath || url.search || url.hash || url.username || url.password)
      fail('pi_provider_destination_denied');
    let response;
    try { response = await fetch(input, { ...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]), redirect: 'manual' }); }
    catch (error) {
      const code = error?.cause?.code ?? error?.code;
      transportError = signal.aborted ? 'pi_cancelled' : `pi_provider_network_${typeof code === 'string' && /^[A-Z_0-9]{1,40}$/.test(code) ? code.toLowerCase() : 'failed'}`;
      fail(transportError);
    }
    onHttp?.(response.status);
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); transportError = 'pi_provider_redirect_denied'; fail(transportError); }
    if (!response.ok) {
      await response.body?.cancel();
      // Do not allow remote error bodies to echo credentials or project data.
      transportError = response.status === 401 || response.status === 403 ? 'pi_auth_required' : response.status === 429 ? 'pi_quota_exhausted' : `pi_provider_http_${response.status}`;
      fail(transportError);
    }
    if (!response.body) fail('pi_provider_empty_response');
    const decoder = new TextDecoder(); let buffer = ''; let bytes = 0;
    const body = response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > 4 * 1024 * 1024) fail('pi_provider_response_too_large');
        buffer += decoder.decode(chunk, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) { inspect(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
        if (buffer.length > 262144) fail('pi_provider_frame_too_large');
        controller.enqueue(chunk);
      },
      flush() { inspect(buffer + decoder.decode()); },
    }));
    return new Response(body, { status: response.status, headers: response.headers });
  };
  return {
    stream(context) {
      return provider.stream(provider.model, context, { apiKey: provider.getApiKey(), signal,
        maxTokens, timeoutMs, maxRetries: 0, transport: 'sse', reasoningEffort: 'low',
        fetch: guardedFetch, env: {}, cacheRetention: 'none' });
    },
    get errorCode() { return transportError; },
    settle() { const receipt = { requests, nativeUsage, costUsd: null, costBasis: provider.costBasis, transportError,
      outputTokenLimit: provider.provider === 'local' ? 'requested' : 'unsupported-by-pinned-codex-api' }; onUsage?.(receipt); return receipt; },
  };
}

export function safeRuntimeError(error) {
  return error instanceof PiHostError ? error.code : 'pi_runtime_failed';
}
