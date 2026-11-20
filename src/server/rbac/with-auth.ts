import { NextResponse } from "next/server";
import { rejectCrossOrigin } from "@/server/http/guards";
import { can, type Action, type Actor, type Resource } from "./can";
import { ForbiddenError } from "./errors";
import { log } from "@/server/log";

export type AuthedUser = Actor & { name: string; email: string };
type Params = Record<string, string>;
type RouteCtx = { params: Promise<Params> };

export type GuardContext = { user: AuthedUser; params: Params };

type Options = {
  action: Action;
  /** The thing being accessed. May depend on the route params (e.g. the member id in the URL). */
  resource: (ctx: GuardContext, req: Request) => Resource | Promise<Resource>;
};

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wrap an API route handler so it cannot run without a session (401) and a passing can() check (403).
 * Default deny: a route only works if it declares the action and resource it touches.
 * Pass the session lookup in so tests can run without Auth.js.
 */
export function createWithAuth(getUser: () => Promise<AuthedUser | null>) {
  return function withAuth(opts: Options, handler: (req: Request, ctx: GuardContext) => Response | Promise<Response>) {
    // Next validates route signatures at build time: the second argument must be a required RouteContext.
    return async function route(req: Request, routeCtx: RouteCtx): Promise<Response> {
      const res = await run(req, routeCtx);
      // Authenticated responses are private: never stored by a browser cache or a proxy (routes that set their own policy keep it).
      if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store");
      return res;
    };

    async function run(req: Request, routeCtx: RouteCtx): Promise<Response> {
      try {
        const user = await getUser();
        if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

        // Cookies authenticate these requests, so state-changing ones must come from our own origin.
        if (BODY_METHODS.has(req.method)) {
          const crossOrigin = rejectCrossOrigin(req);
          if (crossOrigin) return crossOrigin;
        }

        const ctx: GuardContext = { user, params: (await routeCtx?.params) ?? {} };
        const resource = await opts.resource(ctx, req);
        if (!can(user, opts.action, resource)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

        return await handler(req, ctx);
      } catch (err) {
        if (err instanceof ForbiddenError) return NextResponse.json({ error: "forbidden" }, { status: 403 });
        log.error("route error", err); // safeError: name + scrubbed message only, never SQL parameters
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }
  };
}
