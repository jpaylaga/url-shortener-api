import type DnsResolver from 'Types/DnsResolver';
import type HttpClient from 'Types/HttpClient';

/** External effects the handler acquires and core uses for the reachability check. */
export default interface UrlShortenerDependencies {
  httpClient: HttpClient;
  dnsResolver: DnsResolver;
}
