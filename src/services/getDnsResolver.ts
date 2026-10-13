import { lookup } from 'node:dns/promises';
import type DnsResolver from 'Types/DnsResolver';

/** System resolver returning every address for a hostname, in resolver order. */
const getDnsResolver = (): DnsResolver => {
  const resolve: DnsResolver = async hostname =>
    (await lookup(hostname, { all: true, verbatim: true })).map(
      ({ address }) => address
    );

  return resolve;
};

export default getDnsResolver;
