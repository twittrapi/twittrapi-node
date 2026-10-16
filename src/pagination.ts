import { parseAccountResponse } from "./account-response.js";
import { isSimplePage } from "./simple.js";
import type { PageParams, RequestOptions } from "./types.js";

/** Cursors found in a raw X timeline response. */
export interface Cursors {
  /** Bottom cursor: pass it as `cursor` to get the next (older) page. */
  next?: string;
  /** Top cursor: points at newer items. */
  previous?: string;
}

const MAX_NODES = 500_000;

function cursorEntryValue(obj: Record<string, unknown>): string | undefined {
  // { entryId: "cursor-bottom-...", content: { value: "..." } } or content.itemContent.value
  const content = obj.content as Record<string, unknown> | undefined;
  if (!content || typeof content !== "object") return undefined;
  if (typeof content.value === "string") return content.value;
  const item = content.itemContent as Record<string, unknown> | undefined;
  if (item && typeof item === "object" && typeof item.value === "string") return item.value;
  return undefined;
}

/**
 * Finds pagination cursors in X's raw GraphQL JSON.
 *
 * X puts cursors in timeline entries shaped like `{ cursorType: "Bottom" | "Top", value }`, usually
 * inside an entry whose `entryId` starts with `cursor-bottom-` / `cursor-top-`. Later pages often
 * carry them in `TimelineReplaceEntry` instructions instead of the entry list; the walk covers both.
 * Plain `next_cursor` / `nextCursor` fields are used as a fallback. The first match in document
 * order wins. The `{ status_code, response }` wrapper of the account routes is parsed first.
 *
 * This is best-effort: it depends on X's response shape, which can change without notice.
 */
export function extractCursors(data: unknown): Cursors {
  const out: Cursors = {};
  let fallbackNext: string | undefined;
  const stack: unknown[] = [parseAccountResponse(data)];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_NODES) {
    const node = stack.pop();
    visited++;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    if (!node || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;

    const type = obj.cursorType ?? obj.cursor_type;
    if (typeof obj.value === "string" && obj.value) {
      if (type === "Bottom" && out.next === undefined) out.next = obj.value;
      if (type === "Top" && out.previous === undefined) out.previous = obj.value;
    }
    if (typeof obj.entryId === "string") {
      const value = cursorEntryValue(obj);
      if (value) {
        if (obj.entryId.startsWith("cursor-bottom-") && out.next === undefined) out.next = value;
        if (obj.entryId.startsWith("cursor-top-") && out.previous === undefined) out.previous = value;
      }
    }
    if (fallbackNext === undefined) {
      for (const key of ["next_cursor", "nextCursor"]) {
        const v = obj[key];
        if (typeof v === "string" && v && v !== "0") {
          fallbackNext = v;
          break;
        }
      }
    }
    if (out.next !== undefined && out.previous !== undefined) break;

    const values = Object.values(obj);
    for (let i = values.length - 1; i >= 0; i--) {
      const v = values[i];
      if (v && typeof v === "object") stack.push(v);
    }
  }
  if (out.next === undefined && fallbackNext !== undefined) out.next = fallbackNext;
  return out;
}

/** Returns the bottom ("next page") cursor of a raw X timeline response, or undefined. */
export function extractBottomCursor(data: unknown): string | undefined {
  return extractCursors(data).next;
}

/**
 * Counts timeline entries in a raw response, split into content entries and cursor entries.
 * Slice responses count each `items_results` element as an item and their `slice_info` as a cursor.
 * Used to stop paginating when X keeps returning a cursor but no more results.
 */
export function countTimelineEntries(data: unknown): { items: number; cursors: number } {
  let items = 0;
  let cursors = 0;
  const stack: unknown[] = [parseAccountResponse(data)];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_NODES) {
    const node = stack.pop();
    visited++;
    if (Array.isArray(node)) {
      for (const v of node) stack.push(v);
      continue;
    }
    if (!node || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    if (typeof obj.entryId === "string") {
      if (obj.entryId.startsWith("cursor-")) cursors++;
      else items++;
      continue; // entries do not nest other top-level entries
    }
    // Slice-based responses (community search/members/moderators, job search) list results in
    // `items_results` and page with `slice_info.next_cursor` instead of cursor entries.
    if (Array.isArray(obj.items_results)) {
      items += obj.items_results.length;
      if (obj.slice_info && typeof obj.slice_info === "object") cursors++;
      continue;
    }
    for (const v of Object.values(obj)) if (v && typeof v === "object") stack.push(v);
  }
  return { items, cursors };
}

function simpleNextCursor(page: { nextCursor: unknown; hasNextPage: boolean }): string | undefined {
  return page.hasNextPage && typeof page.nextCursor === "string" && page.nextCursor ? page.nextCursor : undefined;
}

/** One page yielded by {@link paginate}. */
export interface Page<T> {
  /** JSON of this page (raw, or the simple-format envelope when the format is "simple"). */
  data: T;
  /** 1-based page number within this iteration. */
  pageNumber: number;
  /** Cursor used to request this page (undefined for the first page unless one was passed in). */
  cursor: string | undefined;
  /**
   * Cursor of the next page, or undefined if there is none. Raw format: the bottom cursor found in
   * the page. Simple format: `nextCursor` when `hasNextPage` is true.
   */
  nextCursor: string | undefined;
}

export interface PaginateOptions extends RequestOptions {
  /**
   * Maximum number of pages to fetch. Every page is a billed API call, so this defaults to 10.
   * Pass `Infinity` to keep going until the cursor runs out.
   */
  maxPages?: number;
}

export const DEFAULT_MAX_PAGES = 10;

/** A method that takes page params and returns one page of JSON. */
export type PageMethod<P extends PageParams, T> = (params: P, options?: RequestOptions) => Promise<T>;

/**
 * Calls `method` repeatedly, following the cursor of each response.
 *
 * Simple-format pages (`{ data, nextCursor, hasNextPage }`) are followed by `nextCursor` until
 * `hasNextPage` is false; the API already ends those on empty pages and repeated cursors. Pass
 * `{ format: "simple" }` in the options, or use a client created with `format: "simple"`.
 *
 * Raw pages stop when any of these is true:
 * - `maxPages` pages have been fetched (default 10),
 * - no bottom cursor is found,
 * - the cursor repeats,
 * - a page contains timeline entries but none of them are results (only cursors).
 *
 * Raw cursor detection is best-effort: it relies on X's timeline JSON, which X can change at any time.
 */
export async function* paginate<P extends PageParams, T>(
  method: PageMethod<P, T>,
  params: P,
  options: PaginateOptions = {},
): AsyncGenerator<Page<T>, void, undefined> {
  const { maxPages = DEFAULT_MAX_PAGES, ...requestOptions } = options;
  if (!(maxPages >= 1)) return;
  const seen = new Set<string>();
  let cursor = params.cursor || undefined;
  if (cursor) seen.add(cursor);

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const data = await method({ ...params, cursor }, requestOptions);
    const simple = isSimplePage(data);
    const nextCursor = simple ? simpleNextCursor(data) : extractBottomCursor(data);
    yield { data, pageNumber, cursor, nextCursor };

    if (!nextCursor || seen.has(nextCursor)) return;
    if (!simple) {
      const { items, cursors } = countTimelineEntries(data);
      if (items === 0 && cursors > 0) return;
    }
    seen.add(nextCursor);
    cursor = nextCursor;
  }
}
