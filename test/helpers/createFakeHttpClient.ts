import type HttpClient from 'Types/HttpClient';

/** A status to answer with, an error to reject with, or 'hang' to never settle. */
export type FakeHttpStep = number | Error | 'hang';

export type FakeHttpCall = { url: string; init: RequestInit };

export type FakeHttpResponse = {
  ok: boolean;
  status: number;
  body: { cancel: jest.Mock<Promise<void>, []> };
};

export type FakeHttpClient = {
  client: HttpClient;
  calls: FakeHttpCall[];
  responses: FakeHttpResponse[];
};

/** Scripted fetch stand-in: one step per call, in order; records every call. */
const createFakeHttpClient = (script: FakeHttpStep[]): FakeHttpClient => {
  const steps = [...script];
  const calls: FakeHttpCall[] = [];
  const responses: FakeHttpResponse[] = [];

  const client: HttpClient = (url, init) => {
    calls.push({ url, init });
    const step = steps.shift();

    if (step === undefined) {
      return Promise.reject(new Error('fake http client: no step scripted'));
    }
    if (step === 'hang') return new Promise(() => {});
    if (step instanceof Error) return Promise.reject(step);

    const response: FakeHttpResponse = {
      ok: step >= 200 && step < 300,
      status: step,
      body: { cancel: jest.fn().mockResolvedValue(undefined) },
    };
    responses.push(response);

    return Promise.resolve(response as unknown as Response);
  };

  return { client, calls, responses };
};

export default createFakeHttpClient;
