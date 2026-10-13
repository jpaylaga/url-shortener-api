type CreateLocalTableOptions = {
  stage: string;
  recreate?: boolean;
  endpoint?: string;
  appName?: string;
};

/** Creates (or recreates) the urls table in DynamoDB Local; resolves with the table name. */
declare const createLocalTable: (
  options: CreateLocalTableOptions
) => Promise<string>;

export = createLocalTable;
