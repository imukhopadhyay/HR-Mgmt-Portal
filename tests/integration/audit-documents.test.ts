import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { audit, verifyAuditChain } from "@/lib/audit";
import { getDocumentForDownload, uploadDocument } from "@/server/services/document.service";
import { applyLeave } from "@/server/services/leave.service";
import { futureWeekday, makePerson } from "./fixtures";

const pdf = () =>
  new File(
    [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])],
    "id-proof.pdf",
    { type: "application/pdf" },
  );

describe("audit trail", () => {
  it("is append-only at the database level", async () => {
    const p = await makePerson();
    await audit({ id: p.userId }, { action: "test.event", entityType: "Test", summary: "hello" });
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "test.event" } });
    await expect(
      db.auditLog.update({ where: { id: row.id }, data: { summary: "tampered" } }),
    ).rejects.toThrow();
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(db.$executeRawUnsafe(`TRUNCATE "AuditLog"`)).rejects.toThrow();
  });

  it("maintains a verifiable hash chain", async () => {
    const p = await makePerson();
    await audit(
      { id: p.userId },
      {
        action: "test.chain",
        entityType: "Test",
        before: { a: 1 },
        after: { a: 2, password: "secret" },
      },
    );
    const r = await verifyAuditChain();
    if (!r.ok) {
      const row = await db.auditLog.findUniqueOrThrow({ where: { seq: BigInt(r.brokenAtSeq!) } });
      const prev = await db.auditLog.findFirst({
        where: { seq: { lt: row.seq } },
        orderBy: { seq: "desc" },
      });
      console.log(
        JSON.stringify(
          {
            r,
            prevOk: row.prevHash === (prev?.hash ?? null),
            row: { ...row, seq: row.seq.toString() },
            prev: prev && { ...prev, seq: prev.seq.toString() },
          },
          null,
          1,
        ),
      );
    }
    expect(r.ok).toBe(true);
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "test.chain" } });
    expect(JSON.stringify(row.after)).not.toContain("secret");
  });
});

describe("concurrency", () => {
  it("keeps the chain linear and prevents duplicate leave under parallel requests", async () => {
    const p = await makePerson();
    const actor = await p.actor();
    const typeId = (await db.leaveType.findUniqueOrThrow({ where: { code: "CL" } })).id;
    const day = futureWeekday(90);
    const results = await Promise.allSettled([
      ...Array.from({ length: 8 }, (_, i) =>
        audit(
          { id: p.userId },
          { action: "test.parallel", entityType: "Test", summary: String(i) },
        ),
      ),
      ...Array.from({ length: 4 }, () =>
        applyLeave(actor, { leaveTypeId: typeId, startDate: day, endDate: day, reason: "race" }),
      ),
    ]);
    const leaveResults = results.slice(8);
    expect(leaveResults.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.leaveRequest.count({ where: { employeeId: p.employeeId } })).toBe(1);
    expect((await verifyAuditChain()).ok).toBe(true);
  });
});

describe("documents", () => {
  it("validates content and restricts access", async () => {
    const owner = await makePerson();
    const stranger = await makePerson();
    const hr = await makePerson({ roles: ["HR_MANAGER"] });
    const spoof = new File([new TextEncoder().encode("<script>alert(1)</script>")], "evil.pdf", {
      type: "application/pdf",
    });
    await expect(
      uploadDocument(await owner.actor(), {
        employeeId: owner.employeeId,
        category: "ID_PROOF",
        isConfidential: true,
        file: spoof,
      }),
    ).rejects.toThrow(/Unsupported/);
    await expect(
      uploadDocument(await stranger.actor(), {
        employeeId: owner.employeeId,
        category: "ID_PROOF",
        isConfidential: false,
        file: pdf(),
      }),
    ).rejects.toThrow(/permission/);
    const doc = await uploadDocument(await owner.actor(), {
      employeeId: owner.employeeId,
      category: "ID_PROOF",
      isConfidential: true,
      file: pdf(),
    });
    expect(doc.verificationStatus).toBe("PENDING");
    expect((await getDocumentForDownload(await owner.actor(), doc.id)).body.length).toBe(9);
    expect((await getDocumentForDownload(await hr.actor(), doc.id)).doc.id).toBe(doc.id);
    await expect(getDocumentForDownload(await stranger.actor(), doc.id)).rejects.toThrow(
      /permission/,
    );
  });
});
