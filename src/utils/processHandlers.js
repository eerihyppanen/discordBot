export const installProcessHandlers = (lifecycle, { processObject = process, logger = console } = {}) => {
  const handlers = new Map();
  const failed = error => {
    logger.error('Shutdown failed unexpectedly:', error);
    processObject.exit(1);
  };
  const stop = (reason, fatal = false) => {
    try { void Promise.resolve(lifecycle.shutdown(reason, { fatal })).catch(failed); }
    catch (error) { failed(error); }
  };
  for (const signal of ['SIGINT', 'SIGTERM']) handlers.set(signal, () => stop(signal));
  for (const event of ['uncaughtException', 'unhandledRejection']) {
    handlers.set(event, error => { logger.error(`Fatal ${event}:`, error); stop(event, true); });
  }
  for (const [event, handler] of handlers) processObject.on(event, handler);
  return () => { for (const [event, handler] of handlers) processObject.off(event, handler); };
};
