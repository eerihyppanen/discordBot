export const createLifecycle = ({
  client,
  flushers,
  stop = async () => {},
  exit = (code) => process.exit(code),
  timeoutMs = 8000,
  logger = console,
}) => {
  const active = new Set();
  let stopping = false;
  let shutdownPromise;
  let fatalRequested = false;

  const run = (task) => {
    if (stopping) return Promise.resolve();
    const result = Promise.resolve().then(task);
    active.add(result);
    result.then(() => active.delete(result), () => active.delete(result));
    return result;
  };

  const shutdown = (signal, { fatal = false } = {}) => {
    fatalRequested ||= fatal;
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    shutdownPromise = (async () => {
      logger.log(`Received ${signal}; finishing pending work and saving data...`);
      const deadline = setTimeout(() => {
        logger.error('Shutdown timed out before all work could finish.');
        exit(1);
      }, timeoutMs);
      const errors = [];
      const saveAll = async () => {
        const results = await Promise.allSettled(flushers.map((flush) => Promise.resolve().then(flush)));
        errors.push(...results.filter((result) => result.status === 'rejected').map((result) => result.reason));
      };
      const stopped = Promise.resolve().then(stop).catch((error) => { errors.push(error); });
      // Protect already-acknowledged changes even if an API call takes too long to drain.
      await saveAll();
      await stopped;
      await Promise.allSettled([...active]);
      // Include changes made by work that was in flight when shutdown began.
      await saveAll();
      try {
        await client.destroy();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) logger.error('Shutdown failed:', new AggregateError(errors));
      clearTimeout(deadline);
      exit(errors.length || fatalRequested ? 1 : 0);
    })();
    return shutdownPromise;
  };

  return { run, shutdown, get stopping() { return stopping; } };
};
