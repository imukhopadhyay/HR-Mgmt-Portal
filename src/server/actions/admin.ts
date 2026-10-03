"use server";

import { z } from "zod";
import { runAction } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import { verifyAuditChain } from "@/lib/audit";
import { ROLE_KEYS } from "@/lib/auth/permissions";
import * as svc from "@/server/services/user-admin.service";

export async function setUserRolesAction(input: unknown) {
  return runAction(z.object({ userId: z.string().min(1), roles: z.array(z.enum(ROLE_KEYS as [string, ...string[]])) }), input, (d, actor) => svc.setUserRoles(actor, d.userId, d.roles as never), "Roles updated");
}

export async function setUserActiveAction(userId: string, isActive: boolean) {
  return runAction(z.object({ userId: z.string().min(1), isActive: z.boolean() }), { userId, isActive }, (d, actor) => svc.setUserActive(actor, d.userId, d.isActive), isActive ? "Account activated" : "Account deactivated");
}

export async function sendResetLinkAction(userId: string) {
  return runAction(z.string().min(1), userId, (d, actor) => svc.sendResetLink(actor, d), "Password reset link sent");
}

export async function verifyAuditChainAction(_: unknown) {
  return runAction(z.any(), _, async (_d, actor) => {
    assertPermission(actor, "audit:read");
    return verifyAuditChain();
  });
}
