export default interface UrlRecord {
  shortcode: string;
  originalUrl: string;
  creatorIpAddress: string;
  creatorUserId?: string;
  createdAt?: number;
  updatedAt?: number;
}
