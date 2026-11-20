import { sessionActor } from "@/server/auth/session-user";
import { createWithAuth } from "./with-auth";

/** The route guard every non-public API route uses. */
export const withAuth = createWithAuth(sessionActor);
