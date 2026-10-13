import { isEmpty, validateFields } from 'lesgo/utils';
import ErrorException from 'Exceptions/ErrorException';
import type PingQuery from 'Types/PingQuery';
import type PingResponse from 'Types/PingResponse';

const FILE = 'core.utils.ping';

const validateInput = (input: PingQuery): PingQuery =>
  validateFields(input, [
    { key: 'sample-error', type: 'string', required: false },
  ]);

/**
 * Pong with no query. `sample-error=<n>` throws a sample error with status n
 * (lesgo turns 0 into 500); any other query is a 400.
 */
const ping = (qs: PingQuery = {}): PingResponse => {
  const input = validateInput({ ...qs });

  if (isEmpty(qs)) {
    return { message: 'Pong' };
  }

  if (!isEmpty(input['sample-error'])) {
    const httpStatusCode = parseInt(input['sample-error'] as string, 10);

    if (!Number.isNaN(httpStatusCode)) {
      throw new ErrorException(
        'Sample Error exception',
        `${FILE}::SAMPLE_ERROR`,
        httpStatusCode,
        { qs }
      );
    }
  }

  throw new ErrorException(
    'Invalid parameters provided',
    `${FILE}::INVALID_PARAMETERS`,
    400,
    { qs }
  );
};

export default ping;
