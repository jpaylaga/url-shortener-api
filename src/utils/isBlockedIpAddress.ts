import { BlockList, isIP } from 'node:net';

// Private, loopback, link-local, CGNAT, multicast, documentation and reserved
// ranges. IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) match the IPv4 rules.
const IPV4_RANGES: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const IPV6_RANGES: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

const blockList = new BlockList();
IPV4_RANGES.forEach(([network, prefix]) =>
  blockList.addSubnet(network, prefix, 'ipv4')
);
IPV6_RANGES.forEach(([network, prefix]) =>
  blockList.addSubnet(network, prefix, 'ipv6')
);

/** True for an IP literal inside a blocked range. False for anything that is not an IP. */
const isBlockedIpAddress = (address: string): boolean => {
  const [bareAddress] = address.split('%');
  const family = isIP(bareAddress);

  if (family === 4) return blockList.check(bareAddress, 'ipv4');
  if (family === 6) return blockList.check(bareAddress, 'ipv6');

  return false;
};

export default isBlockedIpAddress;
