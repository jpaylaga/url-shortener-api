import type ErrorDescription from 'Types/ErrorDescription';

type CaughtError = {
  code?: string;
  message?: string;
  stack?: string;
  extra?: { error?: { name?: string; message?: string } };
};

/**
 * Builds the log payload for a caught error. The lesgo logger copies only
 * enumerable own keys, and an SDK error's message and stack are not, so the
 * values are read here explicitly. The lesgo DynamoDB wrappers keep the SDK
 * error under extra.error; its commandInput is never included.
 */
const describeError = (error: unknown): ErrorDescription => {
  const caught = (error ?? {}) as CaughtError;

  return {
    code: caught.code,
    message: caught.message,
    causeName: caught.extra?.error?.name,
    causeMessage: caught.extra?.error?.message,
    stack: caught.stack,
  };
};

export default describeError;
