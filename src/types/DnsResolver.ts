/** Every address the system resolver returns for a hostname. Rejects when resolution fails. */
type DnsResolver = (hostname: string) => Promise<string[]>;

export default DnsResolver;
