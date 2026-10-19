import { ValidationError } from "../errors.js";
import type { ResponseFormat, SpaceResponse } from "../types.js";
import { APIResource, formatMethod } from "./shared.js";

const SPACE_ID = /^[A-Za-z0-9]{1,32}$/;

/** Validates a Space ID as it appears in x.com/i/spaces/<id>: letters and digits only. */
function spaceId(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : value;
  if (typeof s !== "string" || !SPACE_ID.test(s)) {
    throw new ValidationError(
      `spaceId must be 1 to 32 letters and digits (from x.com/i/spaces/<id>), got ${JSON.stringify(String(value))}`,
    );
  }
  return s;
}

/** X Spaces (live audio). */
export class Spaces<F extends ResponseFormat = "raw"> extends APIResource<F> {
  /**
   * Gets a Space: title, state, host and participants, replay availability. Pass the ID from
   * x.com/i/spaces/<id>. Raw only: the simple format returns the same JSON.
   */
  get = formatMethod<F, string, SpaceResponse, SpaceResponse>(async (id, options) =>
    this.client.get({ path: `/spaces/${spaceId(id)}` }, options),
  );
}
