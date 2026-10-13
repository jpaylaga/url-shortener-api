// lesgo names the table `${APP_NAME}-${APP_ENV}-${alias}` from the first alias.
const dynamodbConfig = {
  urlsTableAlias: (process.env.LESGO_AWS_DYNAMODB_TABLE_ALIASES ?? '').split(
    ','
  )[0],
  originalUrlIndexName: 'originalUrlIndex',
};

export default dynamodbConfig;
