import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { installProcessHandlers } from '../src/utils/processHandlers.js';
import { createLifecycle } from '../src/utils/lifecycle.js';

for (const [event, expectedCode] of [['uncaughtException', 1], ['SIGTERM', 0]]) {
  test(`${event} stops accepting work before its process handler returns`, async () => {
    const processObject = new EventEmitter();
    const logger = { log() {}, error() {} };
    let exitCode, accepted = false;
    processObject.exit = code => { exitCode = code; };
    const lifecycle = createLifecycle({ client: { destroy: async () => {} }, flushers: [], logger, exit: code => { exitCode = code; } });
    const uninstall = installProcessHandlers(lifecycle, { processObject, logger });
    processObject.emit(event, new Error('Expected test error'));
    const stoppedImmediately = lifecycle.stopping;
    await lifecycle.run(() => { accepted = true; });
    await lifecycle.shutdown('test-end');
    uninstall();
    assert.equal(stoppedImmediately, true);
    assert.equal(accepted, false);
    assert.equal(exitCode, expectedCode);
    assert.equal(processObject.listenerCount(event), 0);
  });
}
