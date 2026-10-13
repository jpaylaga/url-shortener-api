import isBlockedIpAddress from 'Utils/isBlockedIpAddress';

const PUBLIC_V4 = '93.184.215.14';
const PUBLIC_V6 = '2606:2800:21f:cb07:6820:80da:af6b:8b2c';

describe('isBlockedIpAddress', () => {
  describe('IPv4 ranges', () => {
    it.each([
      ['0.0.0.0/8', '0.0.0.0', '0.255.255.255', '1.0.0.0'],
      ['10.0.0.0/8', '10.0.0.0', '10.255.255.255', '11.0.0.0'],
      ['100.64.0.0/10', '100.64.0.0', '100.127.255.255', '100.128.0.0'],
      ['127.0.0.0/8', '127.0.0.0', '127.255.255.255', '128.0.0.0'],
      ['169.254.0.0/16', '169.254.0.0', '169.254.255.255', '169.255.0.0'],
      ['172.16.0.0/12', '172.16.0.0', '172.31.255.255', '172.32.0.0'],
      ['192.0.0.0/24', '192.0.0.0', '192.0.0.255', '192.0.1.0'],
      ['192.0.2.0/24', '192.0.2.0', '192.0.2.255', '192.0.3.0'],
      ['192.88.99.0/24', '192.88.99.0', '192.88.99.255', '192.88.100.0'],
      ['192.168.0.0/16', '192.168.0.0', '192.168.255.255', '192.169.0.0'],
      ['198.18.0.0/15', '198.18.0.0', '198.19.255.255', '198.20.0.0'],
      ['198.51.100.0/24', '198.51.100.0', '198.51.100.255', '198.51.101.0'],
      ['203.0.113.0/24', '203.0.113.0', '203.0.113.255', '203.0.114.0'],
      ['224.0.0.0/4', '224.0.0.0', '239.255.255.255', '223.255.255.255'],
      ['240.0.0.0/4', '240.0.0.0', '255.255.255.255', PUBLIC_V4],
    ])('blocks %s', (_range, first, last, outside) => {
      expect(isBlockedIpAddress(first)).toBe(true);
      expect(isBlockedIpAddress(last)).toBe(true);
      expect(isBlockedIpAddress(outside)).toBe(false);
    });
  });

  describe('IPv6 ranges', () => {
    it.each([
      ['::/128', '::', '::', '::2'],
      ['::1/128', '::1', '::1', '::2'],
      ['64:ff9b::/96', '64:ff9b::', '64:ff9b::ffff:ffff', '64:ff9b::1:0:0'],
      [
        '64:ff9b:1::/48',
        '64:ff9b:1::',
        '64:ff9b:1:ffff:ffff:ffff:ffff:ffff',
        '64:ff9b:2::',
      ],
      ['100::/64', '100::', '100::ffff:ffff:ffff:ffff', '100:0:0:1::'],
      [
        '2001::/23',
        '2001::',
        '2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff',
        '2001:200::',
      ],
      [
        '2001:db8::/32',
        '2001:db8::',
        '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        '2001:db9::',
      ],
      [
        '2002::/16',
        '2002::',
        '2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        '2003::',
      ],
      [
        '3fff::/20',
        '3fff::',
        '3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff',
        '3fff:1000::',
      ],
      [
        'fc00::/7',
        'fc00::',
        'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        'fe00::',
      ],
      [
        'fe80::/10',
        'fe80::',
        'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        'fe7f::',
      ],
      [
        'fec0::/10',
        'fec0::',
        'feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        PUBLIC_V6,
      ],
      [
        'ff00::/8',
        'ff00::',
        'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        'fe00::',
      ],
    ])('blocks %s', (_range, first, last, outside) => {
      expect(isBlockedIpAddress(first)).toBe(true);
      expect(isBlockedIpAddress(last)).toBe(true);
      expect(isBlockedIpAddress(outside)).toBe(false);
    });
  });

  it('applies the IPv4 rules to IPv4-mapped IPv6 addresses', () => {
    expect(isBlockedIpAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('::ffff:7f00:1')).toBe(true);
    expect(isBlockedIpAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('ignores an IPv6 zone identifier', () => {
    expect(isBlockedIpAddress('fe80::1%eth0')).toBe(true);
    expect(isBlockedIpAddress('fd00::1%25')).toBe(true);
    expect(isBlockedIpAddress(`${PUBLIC_V6}%en0`)).toBe(false);
  });

  it('allows public addresses', () => {
    expect(isBlockedIpAddress('1.1.1.1')).toBe(false);
    expect(isBlockedIpAddress(PUBLIC_V4)).toBe(false);
    expect(isBlockedIpAddress(PUBLIC_V6)).toBe(false);
  });

  it('is false for anything that is not an IP address', () => {
    expect(isBlockedIpAddress('localhost')).toBe(false);
    expect(isBlockedIpAddress('example.com')).toBe(false);
    expect(isBlockedIpAddress('1.2.3')).toBe(false);
    expect(isBlockedIpAddress('')).toBe(false);
  });
});
