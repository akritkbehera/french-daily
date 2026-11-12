import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'french-daily-protocol-test', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['packages/mcp-server/dist/index.js'] }));
const payload = result => JSON.parse(result.content[0].text);
try {
  assert.equal((await client.listTools()).tools.length, 8);
  const noun = payload(await client.callTool({ name: 'lookup_word', arguments: { query: 'lunettes' } }));
  assert.equal(noun[0].definitePlural, 'les lunettes');
  for (const [section, kind] of [['nouns', 'multiple-choice'], ['sentences', 'word-order']]) {
    const exercise = payload(await client.callTool({ name: 'generate_exercise', arguments: { section, kind, seed: 'audit', includeAnswer: false } }));
    for (const key of ['expected', 'accepted', 'explanation', 'correctIndex', 'correctOrder']) assert.equal(key in exercise, false, `quiz disclosed ${key}`);
  }
  const easy = payload(await client.callTool({ name: 'schedule_review', arguments: { rating: 4 } }));
  assert.equal(easy.intervalDays, 14);
  console.log('MCP stdio: tool discovery, plural output, answer privacy and Easy scheduling passed.');
} finally { await client.close(); }
