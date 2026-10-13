import type DnsResolver from 'Types/DnsResolver';

/** Addresses to answer with, an error to reject with, or 'hang' to never settle. */
type FakeDnsAnswer = string[] | Error | 'hang';

type FakeDnsResolver = {
  resolver: DnsResolver;
  calls: string[];
};

const notFound = (hostname: string): Error =>
  Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
    code: 'ENOTFOUND',
  });

/** Hostname map stand-in for dns.lookup; unknown hosts reject with ENOTFOUND. */
const createFakeDnsResolver = (
  answers: Record<string, FakeDnsAnswer> = {}
): FakeDnsResolver => {
  const calls: string[] = [];

  const resolver: DnsResolver = hostname => {
    calls.push(hostname);
    const answer = answers[hostname];

    if (answer === undefined) return Promise.reject(notFound(hostname));
    if (answer === 'hang') return new Promise(() => {});
    if (answer instanceof Error) return Promise.reject(answer);

    return Promise.resolve(answer);
  };

  return { resolver, calls };
};

export default createFakeDnsResolver;
