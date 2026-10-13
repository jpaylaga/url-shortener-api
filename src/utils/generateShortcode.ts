import { randomInt } from 'node:crypto';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Random base62 code of the given length from a cryptographic source. */
const generateShortcode = (length: number): string =>
  Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export default generateShortcode;
