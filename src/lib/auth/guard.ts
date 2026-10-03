import "server-only";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import type { Permission } from "./permissions";
import { getSessionUser } from "./session";
import type { SessionUser } from "./session-user";

/** For server components / pages: redirect to login when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: render 404-equivalent forbidden when lacking all of the permissions. */
export async function requirePagePermission(...perms: Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  if (perms.length && !perms.some((p) => user.permissions.has(p))) redirect("/forbidden");
  return user;
}

export { notFound };
