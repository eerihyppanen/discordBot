import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle } from '../src/utils/lifecycle.js';

const logger = { log() {}, error() {} };

test('shutdown drains work, flushes every store, and disconnects before exit', async () => {
  const order = [];
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const lifecycle = createLifecycle({
    client: { destroy: async () => { order.push('disconnect'); } },
    stop: async () => { order.push('stop'); },
    flushers: [async () => { order.push('save'); }],
    exit: (code) => { order.push('exit:' + code); },
    logger,
  });
  const work = lifecycle.run(async () => { await gate; order.push('work'); });
  const shutdown = lifecycle.shutdown('SIGTERM');
  assert.equal(lifecycle.shutdown('SIGINT'), shutdown);
  await lifecycle.run(() => { throw new Error('New work accepted during shutdown'); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['stop', 'save']);
  finish();
  await Promise.all([work, shutdown]);
  assert.deepEqual(order, ['stop', 'save', 'work', 'save', 'disconnect', 'exit:0']);
});

test('one failed save still waits for other stores and exits with failure', async () => {
  const order = [];
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const lifecycle = createLifecycle({
    client: { destroy: async () => { order.push('disconnect'); } },
    flushers: [
      async () => { throw new Error('disk full'); },
      async () => { await gate; order.push('second save'); },
    ],
    exit: (code) => { order.push('exit:' + code); },
    logger,
  });
  const shutdown = lifecycle.shutdown('SIGINT');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, []);
  finish();
  await shutdown;
  assert.deepEqual(order, ['second save', 'second save', 'disconnect', 'exit:1']);
});

test('a worker stop failure still drains work and flushes all stores', async () => {
  const order = [];
  const lifecycle = createLifecycle({
    client: { destroy: async () => { order.push('disconnect'); } },
    stop: async () => { throw new Error('worker failed'); },
    flushers: [async () => { order.push('save'); }],
    exit: (code) => { order.push('exit:' + code); },
    logger,
  });
  await lifecycle.shutdown('SIGTERM');
  assert.deepEqual(order, ['save', 'save', 'disconnect', 'exit:1']);
});
