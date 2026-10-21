import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GROQ_MODEL, getGroqReply, groqErrorMessage } from '../src/utils/groqClient.js';

test('Groq sends a supported default, supports model configuration, and has a timeout', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = options;
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'hello' } }] }) };
  };
  assert.equal(await getGroqReply('hi', { apiKey: 'test', fetchImpl }), 'hello');
  assert.equal(JSON.parse(request.body).model, DEFAULT_GROQ_MODEL);
  assert.equal(DEFAULT_GROQ_MODEL, 'openai/gpt-oss-20b');
  assert.ok(request.signal instanceof AbortSignal);
  await getGroqReply('hi', { model: 'configured-model', fetchImpl });
  assert.equal(JSON.parse(request.body).model, 'configured-model');
});

for (const [status, payload, code] of [
  [401, { error: {} }, 'unauthorized'],
  [429, { error: {} }, 'rate_limit'],
  [400, { error: { code: 'model_decommissioned' } }, 'model'],
  [404, { error: { code: 'model_not_found' } }, 'model'],
  [503, { error: {} }, 'unavailable'],
  [200, {}, 'invalid_response'],
]) {
  test('Groq maps HTTP ' + status + ' to ' + code, async () => {
    await assert.rejects(getGroqReply('hi', {
      fetchImpl: async () => ({ ok: status === 200, status, json: async () => payload }),
    }), (error) => {
      assert.equal(error.code, code);
      if (code === 'model') {
        assert.match(groqErrorMessage(error), /GROQ_MODEL/);
        assert.doesNotMatch(groqErrorMessage(error), /API key/);
      }
      return true;
    });
  });
}

test('Groq handles invalid JSON and timeouts without reading missing choices', async () => {
  await assert.rejects(getGroqReply('hi', {
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('HTML response'); } }),
  }), { code: 'invalid_response' });
  await assert.rejects(getGroqReply('hi', {
    fetchImpl: async () => { throw Object.assign(new Error('slow'), { name: 'TimeoutError' }); },
  }), { code: 'timeout' });
});

test('HTTP authentication errors remain actionable even with a non-JSON body', async () => {
  await assert.rejects(getGroqReply('hi', {
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => { throw new SyntaxError('HTML'); } }),
  }), { code: 'unauthorized' });
});
