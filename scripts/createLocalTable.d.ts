type CreateLocalTableOptions = {
  stage: string;
  recreate?: boolean;
};

/**
 * Creates (or recreates) the urls table in DynamoDB Local; resolves with the
 * table name. Reads AWS_ENDPOINT_URL_DYNAMODB and APP_NAME from the environment.
 */
declare const createLocalTable: (
  options: CreateLocalTableOptions
) => Promise<string>;

export = createLocalTable;
