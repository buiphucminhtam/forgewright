// Executable reference workloads. These are benchmark fixtures, not product code.
import assert from 'node:assert/strict';

export function saveGame(state) {
  if (!Number.isSafeInteger(state.coins) || state.coins < 0) throw new Error('invalid coins');
  return JSON.stringify({ version: 2, coins: state.coins, rewards: [...state.rewards].sort() });
}
export function resumeGame(serialized) {
  const value = JSON.parse(serialized);
  if (value.version !== 2 || !Number.isSafeInteger(value.coins) || value.coins < 0 || !Array.isArray(value.rewards) || value.rewards.some(id => typeof id !== 'string')) throw new Error('unsupported save');
  return { coins: value.coins, rewards: new Set(value.rewards) };
}
export function reward(state, id, amount, { duplicateCredit = false } = {}) {
  if (!Number.isSafeInteger(amount) || amount < 0 || typeof id !== 'string' || !id) throw new Error('invalid reward');
  if (state.rewards.has(id) && !duplicateCredit) return false;
  state.rewards.add(id);
  state.coins += amount;
  return true;
}
export function verifyGame({ mutate = false } = {}) {
  const state = { coins: 80, rewards: new Set() };
  assert.equal(reward(state, 'level-one', 10), true);
  const saved = saveGame(state);
  const resumed = resumeGame(saved);
  reward(resumed, 'level-one', 10, { duplicateCredit: mutate });
  assert.equal(resumed.coins, 90, 'Duplicate completion after resume must not credit again');
  assert.equal(reward(resumed, 'level-two', 20), true);
  assert.equal(resumeGame(saveGame(resumed)).coins, 110);
  assert.throws(() => reward(resumed, 'negative', -1));
  assert.throws(() => resumeGame('{"version":999,"coins":0,"rewards":[]}'));
  return { checks: 5, retries: 0, productInteractions: 6 };
}

export function responseFor(id, database) {
  const value = database.get(id);
  return value ? { status: 200, body: structuredClone(value) } : { status: 404, body: { code: 'not-found' } };
}
export function layout(width, { overflow = false } = {}) {
  if (!Number.isFinite(width) || width < 320 || width > 4096) throw new Error('unsupported viewport');
  const margin = 16;
  const columns = width >= 768 ? 3 : 1;
  const gap = 12;
  const cardWidth = overflow ? width : (width - margin * 2 - gap * (columns - 1)) / columns;
  return Array.from({ length: columns }, (_, index) => ({ left: margin + index * (cardWidth + gap), width: cardWidth }));
}
export function verifyWeb({ mutate = false } = {}) {
  const db = new Map([['one', { title: 'Fixture', revision: 1 }]]);
  const reference = responseFor('one', db);
  for (const width of [320, 390, 768, 1024]) {
    assert.deepEqual(responseFor('one', db), reference);
    for (const card of layout(width, { overflow: mutate })) {
      assert.ok(card.left >= 0 && card.width > 0 && card.left + card.width <= width, 'Layout must remain within the viewport');
    }
  }
  const copy = responseFor('one', db);
  copy.body.title = 'changed';
  assert.equal(responseFor('one', db).body.title, 'Fixture');
  assert.equal(responseFor('missing', db).status, 404);
  return { checks: 10, retries: 0, productInteractions: 7 };
}

export async function sync(transport, cache, { ignoreFailure = false } = {}) {
  let result = await transport.fetch('initial');
  if (result.status === 401) {
    const token = await transport.refresh();
    result = await transport.fetch(token);
  }
  if (result.status !== 200) {
    if (ignoreFailure) cache.value = result.body;
    throw new Error('sync failed');
  }
  cache.value = structuredClone(result.body);
  return cache.value;
}
export async function verifyApp({ mutate = false } = {}) {
  const cache = { value: { revision: 1 } };
  let calls = 0;
  let refreshes = 0;
  const transport = {
    async fetch() { calls++; return calls === 1 ? { status: 401 } : { status: 200, body: { revision: 2 } }; },
    async refresh() { refreshes++; return 'local-fixture-token'; },
  };
  assert.deepEqual(await sync(transport, cache), { revision: 2 });
  assert.equal(calls, 2);
  assert.equal(refreshes, 1);
  const lastValid = structuredClone(cache.value);
  let failedCalls = 0;
  await assert.rejects(sync({ async fetch() { failedCalls++; return { status: 401, body: { invalid: true } }; }, async refresh() { return 'rejected-fixture'; } }, cache, { ignoreFailure: mutate }));
  assert.equal(failedCalls, 2);
  assert.deepEqual(cache.value, lastValid, 'A failed retry must preserve the last valid cache');
  return { checks: 6, retries: 2, productInteractions: 5 };
}
export const scenarios = Object.freeze({ 'game-save-idempotency': verifyGame, 'web-api-layout-contract': verifyWeb, 'app-refresh-cache': verifyApp });
