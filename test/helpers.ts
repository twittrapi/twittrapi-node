import { readFileSync } from "node:fs";
import { TwittrAPI, type ClientOptions, type ResponseFormat } from "../src/index.js";

export interface RecordedCall {
  url: URL;
  headers: Record<string, string>;
  method: string | undefined;
  signal: AbortSignal | undefined;
}

type Responder = Response | Error | ((call: RecordedCall) => Response | Promise<Response>);

/** A fetch stand-in that records calls and replays queued responses (the last one repeats). */
export function mockFetch(...responses: Responder[]) {
  const calls: RecordedCall[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const call: RecordedCall = {
      url: new URL(String(input)),
      headers,
      method: init?.method,
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    const r = responses.length > 1 ? responses.shift()! : responses[0] ?? json({});
    if (r instanceof Error) throw r;
    if (typeof r === "function") return r(call);
    return r.clone();
  };
  return { fetch: fn as typeof fetch, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function makeClient<F extends ResponseFormat = "raw">(
  responses: Responder[] = [json({ ok: true })],
  options: ClientOptions<F> = {},
) {
  const mock = mockFetch(...responses);
  const client = new TwittrAPI<F>({ apiKey: "test-key", retryDelayMs: 0, fetch: mock.fetch, ...options });
  return { client, calls: mock.calls };
}

/** Minimal X timeline response with result entries and top/bottom cursors. */
export function timeline(ids: string[], bottom?: string, top = "top-cursor") {
  const entries: unknown[] = ids.map((id) => ({
    entryId: `user-${id}`,
    content: { itemContent: { user_results: { result: { rest_id: id } } } },
  }));
  entries.unshift({ entryId: `cursor-top-1`, content: { cursorType: "Top", value: top } });
  if (bottom) entries.push({ entryId: `cursor-bottom-1`, content: { cursorType: "Bottom", value: bottom } });
  return {
    data: {
      user: {
        result: {
          timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries }] } },
        },
      },
    },
  };
}

/**
 * Simple-format response bodies from test/fixtures/simple, copied from the API's normalize testdata
 * (twitter-ts go/internal/normalize/testdata/simple): real captures converted by the API's own code.
 */
export function simpleFixture<T = unknown>(name: string): T {
  const url = new URL(`../../test/fixtures/simple/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as T;
}
