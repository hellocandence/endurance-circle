import { NextResponse } from "next/server";
import { privateJourney } from "@/server/privacy";
import type { Actor } from "@/server/rbac/can";
import type { DayResponse, TrackerError } from "./service";

const STATUS: Record<TrackerError, number> = {
  no_active_commitment: 404,
  invalid_date: 400,
  before_start: 400,
  in_future: 400,
  locked: 409,
};

/** Own-data payload: the log goes through the privateJourney projection (which re-checks permission). */
export function trackerPayload(actor: Actor, result: DayResponse) {
  if (!result.ok) return { status: STATUS[result.error], body: { error: result.error } as const };
  const { row, ...rest } = result.data;
  return { status: 200, body: { ...rest, log: row ? privateJourney(actor, actor.id, [row]).logs[0] : null } };
}

export type TrackerPayload = Extract<ReturnType<typeof trackerPayload>["body"], { dayNumber: unknown }>;

export function trackerResponse(actor: Actor, result: DayResponse) {
  const { status, body } = trackerPayload(actor, result);
  return NextResponse.json(body, { status });
}
