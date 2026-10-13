import { lookup } from 'node:dns/promises';
import getDnsResolver from 'Services/getDnsResolver';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

const mockLookup = lookup as unknown as jest.Mock;

describe('getDnsResolver', () => {
  it('looks up every address in resolver order and returns the addresses', async () => {
    mockLookup.mockResolvedValue([
      { address: '93.184.215.14', family: 4 },
      { address: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', family: 6 },
    ]);

    await expect(getDnsResolver()('site.example')).resolves.toEqual([
      '93.184.215.14',
      '2606:2800:21f:cb07:6820:80da:af6b:8b2c',
    ]);
    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(mockLookup).toHaveBeenCalledWith('site.example', {
      all: true,
      verbatim: true,
    });
  });

  it('propagates a resolver failure', async () => {
    const failure = Object.assign(new Error('getaddrinfo ENOTFOUND x'), {
      code: 'ENOTFOUND',
    });
    mockLookup.mockRejectedValue(failure);

    await expect(getDnsResolver()('missing.example')).rejects.toBe(failure);
  });
});
