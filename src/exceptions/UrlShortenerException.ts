import ErrorException from 'Exceptions/ErrorException';

export default class UrlShortenerException extends ErrorException {
  constructor(
    message: string,
    errorCode = 'URL_SHORTENER_EXCEPTION',
    statusCode = 500,
    extra: string | Record<string, unknown> = {}
  ) {
    super(message, errorCode, statusCode, extra);
    this.name = 'UrlShortenerException';
  }
}
