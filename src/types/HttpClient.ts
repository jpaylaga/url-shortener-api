/** A fetch-compatible client: the global fetch in production, a fake in tests. */
type HttpClient = (url: string, init: RequestInit) => Promise<Response>;

export default HttpClient;
