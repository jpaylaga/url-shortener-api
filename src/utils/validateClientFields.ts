import { validateFields } from 'lesgo/utils';
import ErrorException from 'Exceptions/ErrorException';

type FieldRule = Parameters<typeof validateFields>[1][number];

// What lesgo validateFields throws: the failing field rule sits in extra.field.
type ValidationFailure = {
  message: string;
  code?: string;
  extra?: { field?: { key?: string } } & Record<string, unknown>;
};

const CLIENT_INPUT_STATUS = 400;

/**
 * lesgo validateFields, with a failure on a field the client sends rethrown as
 * a 400. The code, message and details stay exactly what lesgo produced; only
 * the status changes. A failure on any other field (a value the server
 * supplies) and anything that is not a field failure are rethrown untouched,
 * so they keep lesgo's 500. Field order and first-failing-field semantics are
 * lesgo's own.
 */
const validateClientFields = <T extends Record<string, unknown>>(
  input: T,
  fields: FieldRule[],
  clientKeys: string[] = fields.map(field => field.key)
): T => {
  try {
    return validateFields(input, fields);
  } catch (error) {
    const failure = error as ValidationFailure;
    const key = failure.extra?.field?.key;

    if (key === undefined || !clientKeys.includes(key)) throw error;

    throw new ErrorException(
      failure.message,
      failure.code,
      CLIENT_INPUT_STATUS,
      failure.extra
    );
  }
};

export default validateClientFields;
