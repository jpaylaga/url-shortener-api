// scripts/withStageEnv.sh exports a stage file the way lesgo-scripts does.
// A shell value for a runtime key, even an empty one, would win over the file
// in serverless-dotenv-plugin, so the script starts from a clean slate.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..', '..');
const environments = path.join(root, 'config', 'environments');
const stage = `guard-${process.pid}`;
const stageFile = path.join(environments, `.env.${stage}`);
const localFile = `${stageFile}.local`;

const run = (stageName: string, shellEnv: Record<string, string>) =>
  spawnSync(
    'sh',
    [
      path.join(root, 'scripts', 'withStageEnv.sh'),
      stageName,
      'sh',
      '-c',
      // eslint-disable-next-line no-template-curly-in-string
      'printf "%s|%s|%s" "${BYPASS_URL_EXISTS_DOMAINS-UNSET}" "$SHORT_URL_DOMAIN" "$AWS_APP_REGION"',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...shellEnv },
    }
  );

describe('withStageEnv.sh', () => {
  beforeAll(() => {
    fs.writeFileSync(
      stageFile,
      'AWS_APP_REGION=us-east-1\nSHORT_URL_DOMAIN=https://short.example\nBYPASS_URL_EXISTS_DOMAINS=a.example,b.example\n'
    );
  });

  afterAll(() => {
    fs.rmSync(stageFile, { force: true });
    fs.rmSync(localFile, { force: true });
  });

  it('exports the stage file to the command', () => {
    const result = run(stage, {});
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      'a.example,b.example|https://short.example|us-east-1'
    );
  });

  it('lets the file win over exported runtime keys, empty ones included', () => {
    const result = run(stage, {
      BYPASS_URL_EXISTS_DOMAINS: '',
      SHORT_URL_DOMAIN: 'https://leftover.example',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      'a.example,b.example|https://short.example|us-east-1'
    );
  });

  it('prefers the .local file and unsets runtime keys it does not carry', () => {
    // serverless-dotenv-plugin reads the key from .env.<stage> but lets a
    // shell value, even an empty one, win; the script must not leave it set.
    fs.writeFileSync(
      localFile,
      'AWS_APP_REGION=eu-west-1\nSHORT_URL_DOMAIN=https://local.example\n'
    );
    const result = run(stage, { BYPASS_URL_EXISTS_DOMAINS: '' });
    fs.rmSync(localFile);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('UNSET|https://local.example|eu-west-1');
  });

  it('exits 66 when the stage file is missing', () => {
    const result = run(`${stage}-missing`, {});
    expect(result.status).toBe(66);
    expect(result.stderr).toContain('missing');
  });
});
