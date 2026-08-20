import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMcpPolicy, exposedMcpToolName, isPrivateNetworkAddress, selectAccount } from './connector-security.js';
import { safeArgumentSummary } from './connector-privacy.js';

test('normalizes MCP names to provider-safe stable identifiers', () => {
  assert.equal(exposedMcpToolName('google-drive', 'drive.search/files'), 'google-drive__drive_search_files');
  assert.ok(exposedMcpToolName('x'.repeat(80), 'tool').length <= 64);
});

test('classifies reads, writes and centrally blocked operations', () => {
  assert.equal(defaultMcpPolicy({ name: 'search_threads', readOnly: true, destructive: false }), 'automatic');
  assert.equal(defaultMcpPolicy({ name: 'create_draft', readOnly: false, destructive: false }), 'approval');
  assert.equal(defaultMcpPolicy({ name: 'wire_transfer', readOnly: false, destructive: true }), 'blocked');
});

test('requires an account selector only when multiple accounts are eligible', () => {
  const accounts = [{ label: 'Support' }, { label: 'Direction' }];
  assert.equal(selectAccount(accounts, 'Support')?.label, 'Support');
  assert.equal(selectAccount(accounts), null);
  assert.equal(selectAccount([accounts[0]])?.label, 'Support');
  assert.equal(selectAccount(accounts, 'Missing'), null);
});

test('blocks private network targets', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(isPrivateNetworkAddress(address), true);
  assert.equal(isPrivateNetworkAddress('8.8.8.8'), false);
});

test('audit summaries retain keys but not values', () => {
  const summary = safeArgumentSummary({ recipient: 'secret@example.com', body: 'private', count: 2 });
  assert.deepEqual(summary.argumentKeys, ['recipient', 'body', 'count']);
  assert.ok(!JSON.stringify(summary).includes('secret@example.com'));
  assert.deepEqual(summary.sensitiveKeys, ['body']);
});
