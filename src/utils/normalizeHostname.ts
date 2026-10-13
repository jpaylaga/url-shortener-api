/** Lowercase, strip IPv6 brackets and trailing dots, for deny-list checks only. */
const normalizeHostname = (hostname: string): string =>
  hostname
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.+$/, '');

export default normalizeHostname;
