import type HttpClient from 'Types/HttpClient';

/** The global fetch, acquired by the handler and passed down to core. */
const getHttpClient = (): HttpClient => globalThis.fetch;

export default getHttpClient;
