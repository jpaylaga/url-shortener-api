import { randomInt } from 'node:crypto';
import generateShortcode from 'Utils/generateShortcode';

jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomInt: jest.fn(),
}));

const mockRandomInt = randomInt as unknown as jest.Mock;
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

describe('generateShortcode', () => {
  beforeEach(() => {
    mockRandomInt.mockImplementation((max: number) => Math.floor(max / 2));
  });

  it('returns a code of the requested length', () => {
    expect(generateShortcode(5)).toHaveLength(5);
    expect(generateShortcode(8)).toHaveLength(8);
  });

  it('draws every character from crypto.randomInt over the base62 alphabet', () => {
    [0, 25, 26, 51, 52, 61].forEach(index =>
      mockRandomInt.mockReturnValueOnce(index)
    );

    expect(generateShortcode(6)).toBe('AZaz09');
    expect(mockRandomInt).toHaveBeenCalledTimes(6);
    expect(mockRandomInt).toHaveBeenCalledWith(ALPHABET.length);
  });

  it('only ever produces alphanumeric characters', () => {
    const { randomInt: realRandomInt } = jest.requireActual('node:crypto');
    mockRandomInt.mockImplementation(realRandomInt);

    expect(generateShortcode(200)).toMatch(/^[A-Za-z0-9]{200}$/);
  });
});
