/** The validated shorten request. */
export default interface UrlShortenerInput {
  url: string;
  creatorIpAddress: string;
  creatorUserId?: string;
}
