import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser, requestMeta } from "@/lib/auth/session";
import type { Actor } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Route handler wrapper: authenticates and maps domain errors to HTTP responses. */
export function withApi<C>(handler: (req: Request, actor: Actor, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      const user = await getSessionUser();
      if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
      const actor: Actor = { ...user, ...(await requestMeta()) };
      return await handler(req, actor, ctx);
    } catch (err) {
      if (err instanceof AppError)
        return NextResponse.json({ error: err.message }, { status: err.status });
      logger.error("api.unhandled", { url: req.url, err });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export function contentDisposition(filename: string, inline = false) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
