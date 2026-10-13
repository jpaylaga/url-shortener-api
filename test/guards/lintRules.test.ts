// The layer rules in docs/contributing.md are enforced by ESLint. This suite
// lints probe snippets through the real configuration so that every form of
// a violation (direct, destructured, through globalThis) stays an error.
import path from 'node:path';
import { createRequire } from 'node:module';

type LintMessage = { ruleId: string | null; message: string };
type LintResult = { messages: LintMessage[] };
type ESLintInstance = {
  lintText: (
    code: string,
    options: { filePath: string }
  ) => Promise<LintResult[]>;
};
type ESLintModule = {
  ESLint: new (options: { cwd: string }) => ESLintInstance;
};

const root = path.join(__dirname, '..', '..');
// eslint 8 ships no type declarations; the API surface used here is typed above.
const { ESLint } = createRequire(__filename)('eslint') as ESLintModule;
const eslint = new ESLint({ cwd: root });

const RULES = [
  'no-restricted-syntax',
  'no-restricted-properties',
  'import/no-named-export',
];

const lint = async (relativePath: string, code: string): Promise<string[]> => {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(root, relativePath),
  });

  return result.messages
    .filter(message => RULES.includes(message.ruleId ?? ''))
    .map(message => `${message.ruleId}: ${message.message}`);
};

const expectRestricted = async (
  relativePath: string,
  code: string,
  needle: string
): Promise<void> => {
  const messages = await lint(relativePath, code);
  expect(messages.length).toBeGreaterThan(0);
  expect(messages.join('\n')).toContain(needle);
};

const ENV_MESSAGE = 'Read process.env only in src/config.';
const SEQUENTIAL_MESSAGE = 'Orchestration stays sequential';

describe('lint rules for the layer boundaries', () => {
  describe('process.env outside src/config', () => {
    it.each([
      ['direct member', 'export default () => process.env.FOO;'],
      [
        'destructured',
        'const { env } = process;\nexport default () => env.FOO;',
      ],
      [
        'through globalThis',
        'export default () => globalThis.process.env.FOO;',
      ],
    ])('%s is an error in core', async (_label, code) => {
      await expectRestricted('src/core/probe/probe.ts', code, ENV_MESSAGE);
    });

    it('is allowed in src/config', async () => {
      await expect(
        lint('src/config/probe.ts', 'export default process.env.FOO;')
      ).resolves.toEqual([]);
    });
  });

  describe('Promise combinators', () => {
    it.each([
      ['Promise.all', 'export default () => Promise.all([]);'],
      ['Promise.allSettled', 'export default () => Promise.allSettled([]);'],
      ['Promise.any', 'export default () => Promise.any([]);'],
      ['Promise.race', 'export default () => Promise.race([]);'],
      [
        'destructured',
        'const { all } = Promise;\nexport default () => all([]);',
      ],
      [
        'through globalThis',
        'export default () => globalThis.Promise.all([]);',
      ],
    ])('%s is an error in core', async (_label, code) => {
      await expectRestricted(
        'src/core/probe/probe.ts',
        code,
        SEQUENTIAL_MESSAGE
      );
    });

    it('stays an error in src/config and tests', async () => {
      await expectRestricted(
        'src/config/probe.ts',
        'export default () => Promise.all([]);',
        SEQUENTIAL_MESSAGE
      );
      await expectRestricted(
        'test/helpers/probe.ts',
        'const { race } = Promise;\nexport default () => race([]);',
        SEQUENTIAL_MESSAGE
      );
    });

    it('leaves Promise.resolve and Promise.reject alone', async () => {
      await expect(
        lint(
          'src/core/probe/probe.ts',
          'export default () => Promise.resolve(Promise.reject(new Error()));'
        )
      ).resolves.toEqual([]);
    });
  });

  describe('named exports', () => {
    it('are an error outside handlers', async () => {
      await expectRestricted(
        'test/helpers/probe.ts',
        'export type Probe = string;\nconst probe = (): Probe => "x";\nexport default probe;',
        'import/no-named-export'
      );
    });

    it('allow `handler` in src/handlers', async () => {
      await expect(
        lint(
          'src/handlers/app/probe.ts',
          'export const handler = () => "x";\nexport default handler;'
        )
      ).resolves.toEqual([]);
    });
  });
});
