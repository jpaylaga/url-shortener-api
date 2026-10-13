// The unit, contract and integration suites and the offline run must never
// reach AWS. The AWS SDK ignores AWS_ENDPOINT_URL_DYNAMODB when
// AWS_IGNORE_CONFIGURED_ENDPOINT_URLS is set (or ignore_configured_endpoint_urls
// is in the shared config), so the setup files and the npm scripts neutralize
// both before any client is built.
import fs from 'node:fs';
import path from 'node:path';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const root = path.join(__dirname, '..', '..');

const readText = (relativePath: string): string =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const { scripts } = JSON.parse(readText('package.json')) as {
  scripts: Record<string, string>;
};

describe('local-only DynamoDB endpoint guards', () => {
  it('runs with the SDK bypass switch and the shared AWS files neutralized', () => {
    expect(process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS).toBeUndefined();
    expect(process.env.AWS_CONFIG_FILE).toBe('/dev/null');
    expect(process.env.AWS_SHARED_CREDENTIALS_FILE).toBe('/dev/null');
    expect(process.env.AWS_PROFILE).toBeUndefined();
  });

  it.each(['jest.setup.ts', 'jest.integration.setup.ts'])(
    '%s deletes the bypass switch before any import',
    file => {
      const setup = readText(file);
      expect(setup).toContain(
        'delete process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS;'
      );
      expect(setup).toContain("process.env.AWS_CONFIG_FILE = '/dev/null';");
      expect(setup).toContain(
        "process.env.AWS_SHARED_CREDENTIALS_FILE = '/dev/null';"
      );
    }
  );

  it('sends DynamoDB requests to the configured local endpoint', async () => {
    const targets: string[] = [];
    const requestHandler = {
      metadata: { handlerProtocol: 'http/1.1' },
      handle: async (request: {
        protocol: string;
        hostname: string;
        port?: number;
      }) => {
        targets.push(
          `${request.protocol}//${request.hostname}:${request.port}`
        );
        throw new Error('request intercepted before any network I/O');
      },
    };
    const client = new DynamoDBClient({
      requestHandler: requestHandler as never,
    });

    await expect(client.send(new ListTablesCommand({}))).rejects.toThrow(
      'request intercepted'
    );
    expect(targets).toEqual(['http://127.0.0.1:9']);
  });

  it.each(['start', 'test:integration'])(
    '%s unsets the bypass switch and points the shared AWS files at /dev/null',
    script => {
      expect(scripts[script]).toContain('-u AWS_PROFILE');
      expect(scripts[script]).toContain(
        '-u AWS_IGNORE_CONFIGURED_ENDPOINT_URLS'
      );
      expect(scripts[script]).toContain('AWS_CONFIG_FILE=/dev/null');
      expect(scripts[script]).toContain(
        'AWS_SHARED_CREDENTIALS_FILE=/dev/null'
      );
    }
  );
});
