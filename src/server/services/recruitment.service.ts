import type { CandidateStage, Prisma, RequisitionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/action";
import { assertPermission } from "@/lib/auth/rbac";
import { dateKeyToDb, dbDateToKey, todayKey } from "@/lib/dates";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatCode, nextSequence } from "@/lib/sequence";
import { notifyEmployees, notifyUsers, usersWithPermission } from "@/lib/notifications";
import { formatINR, toNumber } from "@/lib/utils";
import { createEmployee } from "./employee.service";

/** Allowed pipeline transitions (HIRED is only reachable via hireCandidate). */
export const STAGE_TRANSITIONS: Record<CandidateStage, CandidateStage[]> = {
  APPLIED: ["SCREENING", "REJECTED", "WITHDRAWN"],
  SCREENING: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["OFFER", "REJECTED", "WITHDRAWN", "SCREENING"],
  OFFER: ["REJECTED", "WITHDRAWN", "INTERVIEW"],
  HIRED: [],
  REJECTED: ["SCREENING"],
  WITHDRAWN: [],
};

function canSeeRequisition(
  actor: Actor,
  r: { hiringManagerId: string | null; requestedById: string | null },
) {
  return (
    actor.permissions.has("recruitment:read") ||
    r.hiringManagerId === actor.employeeId ||
    r.requestedById === actor.id
  );
}

export async function listRequisitions(
  actor: Actor,
  filters: { status?: RequisitionStatus; q?: string } = {},
) {
  const base: Prisma.RecruitmentWhereInput = {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { title: { contains: filters.q, mode: "insensitive" } } : {}),
  };
  const scope: Prisma.RecruitmentWhereInput = actor.permissions.has("recruitment:read")
    ? {}
    : {
        OR: [
          { hiringManagerId: actor.employeeId ?? "__none__" },
          { requestedById: actor.id },
          {
            candidates: {
              some: { interviews: { some: { interviewerId: actor.employeeId ?? "__none__" } } },
            },
          },
        ],
      };
  return db.recruitment.findMany({
    where: { AND: [base, scope] },
    include: {
      department: { select: { name: true } },
      hiringManager: { select: { firstName: true, lastName: true } },
      _count: { select: { candidates: { where: { deletedAt: null } } } },
      candidates: { where: { deletedAt: null }, select: { stage: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export interface RequisitionInput {
  id?: string;
  title: string;
  departmentId?: string;
  designationId?: string;
  hiringManagerId?: string;
  openings: number;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | "CONSULTANT";
  location?: string;
  description: string;
  minExperience?: number;
  maxExperience?: number;
  budgetMin?: number;
  budgetMax?: number;
  targetDate?: string;
  submit: boolean;
}

export async function saveRequisition(actor: Actor, input: RequisitionInput) {
  assertPermission(actor, "recruitment:request", "recruitment:manage");
  if (
    input.minExperience !== undefined &&
    input.maxExperience !== undefined &&
    input.minExperience > input.maxExperience
  ) {
    throw new ValidationError("Minimum experience cannot exceed maximum.", {
      maxExperience: ["Must be ≥ minimum"],
    });
  }
  if (
    input.budgetMin !== undefined &&
    input.budgetMax !== undefined &&
    input.budgetMin > input.budgetMax
  ) {
    throw new ValidationError("Budget minimum cannot exceed maximum.", {
      budgetMax: ["Must be ≥ minimum"],
    });
  }
  const { id, submit, targetDate, ...rest } = input;
  const data = {
    ...rest,
    departmentId: rest.departmentId ?? null,
    designationId: rest.designationId ?? null,
    hiringManagerId: rest.hiringManagerId ?? null,
    location: rest.location ?? null,
    minExperience: rest.minExperience ?? null,
    maxExperience: rest.maxExperience ?? null,
    budgetMin: rest.budgetMin ?? null,
    budgetMax: rest.budgetMax ?? null,
    targetDate: targetDate ? dateKeyToDb(targetDate) : null,
  };
  const req = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.recruitment.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundError("Requisition");
      const own =
        before.requestedById === actor.id && ["DRAFT", "PENDING_APPROVAL"].includes(before.status);
      if (!actor.permissions.has("recruitment:manage") && !own) throw new ForbiddenError();
      const r = await tx.recruitment.update({
        where: { id },
        data: {
          ...data,
          ...(submit && before.status === "DRAFT" ? { status: "PENDING_APPROVAL" as const } : {}),
        },
      });
      await writeAudit(tx, actor, {
        action: "requisition.update",
        entityType: "Recruitment",
        entityId: id,
        summary: r.title,
      });
      return r;
    }
    const code = formatCode("REQ", await nextSequence(tx, "requisition"));
    const r = await tx.recruitment.create({
      data: {
        ...data,
        code,
        requestedById: actor.id,
        status: submit ? "PENDING_APPROVAL" : "DRAFT",
      },
    });
    await writeAudit(tx, actor, {
      action: "requisition.create",
      entityType: "Recruitment",
      entityId: r.id,
      summary: `${code} ${r.title}`,
    });
    return r;
  });
  if (req.status === "PENDING_APPROVAL") {
    await notifyUsers(
      (await usersWithPermission("recruitment:manage")).filter((u) => u !== actor.id),
      {
        type: "requisition.submitted",
        title: "Job requisition awaiting approval",
        body: `${req.code} ${req.title} (${req.openings} opening(s))`,
        link: `/recruitment/${req.id}`,
      },
    );
  }
  return req;
}

export async function setRequisitionStatus(actor: Actor, id: string, status: RequisitionStatus) {
  assertPermission(actor, "recruitment:manage");
  const r = await db.recruitment.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw new NotFoundError("Requisition");
  const allowed: Record<RequisitionStatus, RequisitionStatus[]> = {
    DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
    PENDING_APPROVAL: ["OPEN", "DRAFT", "CANCELLED"],
    OPEN: ["ON_HOLD", "CLOSED", "CANCELLED"],
    ON_HOLD: ["OPEN", "CLOSED", "CANCELLED"],
    CLOSED: ["OPEN"],
    CANCELLED: [],
  };
  if (!allowed[r.status].includes(status))
    throw new ConflictError(
      `Cannot move from ${r.status.toLowerCase()} to ${status.toLowerCase()}.`,
    );
  if (r.status === "PENDING_APPROVAL" && status === "OPEN" && r.requestedById === actor.id)
    throw new ForbiddenError("You cannot approve a requisition you raised.");
  await db.$transaction(async (tx) => {
    await tx.recruitment.update({
      where: { id },
      data: {
        status,
        ...(status === "OPEN" && r.status === "PENDING_APPROVAL"
          ? { approvedById: actor.id, approvedAt: new Date() }
          : {}),
        ...(status === "CLOSED" ? { closedAt: new Date() } : {}),
      },
    });
    await writeAudit(tx, actor, {
      action: `requisition.${status.toLowerCase()}`,
      entityType: "Recruitment",
      entityId: id,
      summary: `${r.code}: ${r.status} → ${status}`,
    });
  });
  if (r.requestedById)
    await notifyUsers([r.requestedById], {
      type: "requisition.status",
      title: `Requisition ${status.toLowerCase().replace("_", " ")}`,
      body: `${r.code} ${r.title}`,
      link: `/recruitment/${id}`,
    });
}

export async function requisitionDetail(actor: Actor, id: string) {
  const r = await db.recruitment.findFirst({
    where: { id, deletedAt: null },
    include: {
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, title: true } },
      hiringManager: { select: { id: true, firstName: true, lastName: true } },
      candidates: {
        where: { deletedAt: null },
        include: {
          interviews: {
            include: { interviewer: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { scheduledAt: "asc" },
          },
          documents: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              category: true,
              createdAt: true,
              sizeBytes: true,
              verificationStatus: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!r) throw new NotFoundError("Requisition");
  const isInterviewer = r.candidates.some((c) =>
    c.interviews.some((i) => i.interviewerId === actor.employeeId),
  );
  if (!canSeeRequisition(actor, r) && !isInterviewer) throw new ForbiddenError();
  return { requisition: r, fullAccess: canSeeRequisition(actor, r) };
}

export interface CandidateInput {
  id?: string;
  recruitmentId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source?: string;
  currentCompany?: string;
  experienceYears?: number;
  expectedCtc?: number;
  notes?: string;
}

export async function saveCandidate(actor: Actor, input: CandidateInput) {
  assertPermission(actor, "recruitment:manage");
  const req = await db.recruitment.findFirst({
    where: { id: input.recruitmentId, deletedAt: null },
  });
  if (!req) throw new NotFoundError("Requisition");
  if (!input.id && !["OPEN", "ON_HOLD"].includes(req.status))
    throw new ConflictError("Candidates can only be added to open requisitions.");
  const { id, ...data } = input;
  const clean = {
    ...data,
    phone: data.phone ?? null,
    source: data.source ?? null,
    currentCompany: data.currentCompany ?? null,
    experienceYears: data.experienceYears ?? null,
    expectedCtc: data.expectedCtc ?? null,
    notes: data.notes ?? null,
  };
  return db.$transaction(async (tx) => {
    const c = id
      ? await tx.candidate.update({ where: { id }, data: clean })
      : await tx.candidate.create({ data: clean });
    await writeAudit(tx, actor, {
      action: id ? "candidate.update" : "candidate.create",
      entityType: "Candidate",
      entityId: c.id,
      summary: `${c.firstName} ${c.lastName} for ${req.code}`,
    });
    return c;
  });
}

export async function moveCandidate(
  actor: Actor,
  candidateId: string,
  stage: CandidateStage,
  note?: string,
) {
  assertPermission(actor, "recruitment:manage");
  const c = await db.candidate.findFirst({ where: { id: candidateId, deletedAt: null } });
  if (!c) throw new NotFoundError("Candidate");
  if (!STAGE_TRANSITIONS[c.stage].includes(stage))
    throw new ConflictError(
      `Cannot move a candidate from ${c.stage.toLowerCase()} to ${stage.toLowerCase()}.`,
    );
  if (stage === "OFFER" && !c.offerLetter)
    throw new ValidationError("Generate an offer before moving to the offer stage.");
  await db.$transaction(async (tx) => {
    const claim = await tx.candidate.updateMany({
      where: { id: candidateId, stage: c.stage },
      data: {
        stage,
        ...(note ? { notes: [c.notes, `[${todayKey()}] ${note}`].filter(Boolean).join("\n") } : {}),
      },
    });
    if (claim.count !== 1) throw new ConflictError("Candidate was updated concurrently.");
    if (stage === "REJECTED" || stage === "WITHDRAWN") {
      await tx.interview.updateMany({
        where: { candidateId, status: "SCHEDULED" },
        data: { status: "CANCELLED" },
      });
    }
    await writeAudit(tx, actor, {
      action: "candidate.stage",
      entityType: "Candidate",
      entityId: candidateId,
      summary: `${c.stage} → ${stage}${note ? `: ${note}` : ""}`,
    });
  });
}

export async function scheduleInterview(
  actor: Actor,
  input: {
    candidateId: string;
    round: string;
    scheduledAt: Date;
    durationMinutes: number;
    mode: "ONSITE" | "VIDEO" | "PHONE";
    location?: string;
    interviewerId: string;
  },
) {
  assertPermission(actor, "recruitment:manage");
  const c = await db.candidate.findFirst({
    where: { id: input.candidateId, deletedAt: null },
    include: { recruitment: true },
  });
  if (!c) throw new NotFoundError("Candidate");
  if (["HIRED", "REJECTED", "WITHDRAWN"].includes(c.stage))
    throw new ConflictError("This candidate is no longer active.");
  if (input.scheduledAt.getTime() < Date.now() - 3600_000)
    throw new ValidationError("Interview time is in the past.", {
      scheduledAt: ["Choose a future time"],
    });
  const interviewer = await db.employee.findFirst({
    where: { id: input.interviewerId, deletedAt: null, status: { not: "EXITED" } },
  });
  if (!interviewer)
    throw new ValidationError("Select an active interviewer.", {
      interviewerId: ["Invalid interviewer"],
    });
  const start = input.scheduledAt.getTime();
  const end = start + input.durationMinutes * 60_000;
  const nearby = await db.interview.findMany({
    where: {
      interviewerId: input.interviewerId,
      status: "SCHEDULED",
      scheduledAt: { gt: new Date(start - 8 * 3600_000), lt: new Date(end) },
    },
    select: { scheduledAt: true, durationMinutes: true },
  });
  if (
    nearby.some(
      (n) =>
        n.scheduledAt.getTime() < end &&
        n.scheduledAt.getTime() + n.durationMinutes * 60_000 > start,
    )
  ) {
    throw new ConflictError("The interviewer already has an interview at that time.");
  }
  const i = await db.$transaction(async (tx) => {
    const i = await tx.interview.create({ data: { ...input, location: input.location ?? null } });
    if (c.stage === "APPLIED" || c.stage === "SCREENING")
      await tx.candidate.update({ where: { id: c.id }, data: { stage: "INTERVIEW" } });
    await writeAudit(tx, actor, {
      action: "interview.schedule",
      entityType: "Interview",
      entityId: i.id,
      summary: `${input.round} with ${c.firstName} ${c.lastName}`,
    });
    return i;
  });
  await notifyEmployees(
    [input.interviewerId],
    {
      type: "interview.scheduled",
      title: "Interview scheduled",
      body: `${input.round}: ${c.firstName} ${c.lastName} for ${c.recruitment.title} on ${input.scheduledAt.toISOString().replace("T", " ").slice(0, 16)} UTC. Add it to your calendar from the requisition page.`,
      link: `/recruitment/${c.recruitmentId}`,
    },
    { email: true },
  );
  return i;
}

export async function submitFeedback(
  actor: Actor,
  input: {
    interviewId: string;
    rating: number;
    feedback: string;
    recommendation: "STRONG_HIRE" | "HIRE" | "HOLD" | "NO_HIRE";
    status: "COMPLETED" | "NO_SHOW";
  },
) {
  const i = await db.interview.findUnique({ where: { id: input.interviewId } });
  if (!i) throw new NotFoundError("Interview");
  const isInterviewer =
    i.interviewerId === actor.employeeId && actor.permissions.has("interview:feedback");
  if (!isInterviewer && !actor.permissions.has("recruitment:manage"))
    throw new ForbiddenError("Only the assigned interviewer can submit feedback.");
  if (i.status === "CANCELLED") throw new ConflictError("This interview was cancelled.");
  await db.$transaction(async (tx) => {
    await tx.interview.update({
      where: { id: i.id },
      data: {
        rating: input.rating,
        feedback: input.feedback,
        recommendation: input.recommendation,
        status: input.status,
      },
    });
    await writeAudit(tx, actor, {
      action: "interview.feedback",
      entityType: "Interview",
      entityId: i.id,
      summary: `${input.status}: ${input.recommendation} (${input.rating}/5)`,
    });
  });
}

export async function cancelInterview(actor: Actor, interviewId: string) {
  assertPermission(actor, "recruitment:manage");
  const res = await db.interview.updateMany({
    where: { id: interviewId, status: "SCHEDULED" },
    data: { status: "CANCELLED" },
  });
  if (res.count !== 1) throw new ConflictError("Only scheduled interviews can be cancelled.");
  await db.$transaction((tx) =>
    writeAudit(tx, actor, {
      action: "interview.cancel",
      entityType: "Interview",
      entityId: interviewId,
    }),
  );
}

export function renderOfferLetter(p: {
  company: string;
  candidate: string;
  title: string;
  department: string;
  ctc: number;
  joiningDate: string;
  location: string;
  manager: string;
  offerDate: string;
}) {
  return `${p.company}
Date: ${p.offerDate}

Dear ${p.candidate},

We are pleased to offer you the position of ${p.title} in our ${p.department} team, based at ${p.location}, reporting to ${p.manager}.

Your annual Cost to Company (CTC) will be ${formatINR(p.ctc)}, with the detailed salary structure shared separately. Your expected date of joining is ${p.joiningDate}.

This offer is subject to satisfactory verification of your documents and background, and to the terms of your employment agreement. Please confirm your acceptance by replying to this letter within seven days.

We look forward to welcoming you.

Sincerely,
Human Resources
${p.company}`;
}

export async function generateOffer(
  actor: Actor,
  input: { candidateId: string; offeredCtc: number; joiningDate: string },
) {
  assertPermission(actor, "recruitment:manage");
  const c = await db.candidate.findFirst({
    where: { id: input.candidateId, deletedAt: null },
    include: {
      recruitment: { include: { department: true, designation: true, hiringManager: true } },
    },
  });
  if (!c) throw new NotFoundError("Candidate");
  if (!["INTERVIEW", "OFFER"].includes(c.stage))
    throw new ConflictError(
      "Offers can be generated for candidates at the interview or offer stage.",
    );
  if (input.joiningDate < todayKey())
    throw new ValidationError("Joining date must be in the future.", {
      joiningDate: ["Must be in the future"],
    });
  const r = c.recruitment;
  const budgetMax = r.budgetMax ? toNumber(r.budgetMax) : null;
  const letter = renderOfferLetter({
    company: process.env.COMPANY_NAME ?? "Acme Technologies Pvt Ltd",
    candidate: `${c.firstName} ${c.lastName}`,
    title: r.designation?.title ?? r.title,
    department: r.department?.name ?? "—",
    ctc: input.offeredCtc,
    joiningDate: input.joiningDate,
    location: r.location ?? "our office",
    manager: r.hiringManager
      ? `${r.hiringManager.firstName} ${r.hiringManager.lastName}`
      : "your manager",
    offerDate: todayKey(),
  });
  await db.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: c.id },
      data: {
        offeredCtc: input.offeredCtc,
        joiningDate: dateKeyToDb(input.joiningDate),
        offerDate: dateKeyToDb(todayKey()),
        offerLetter: letter,
        stage: "OFFER",
      },
    });
    await writeAudit(tx, actor, {
      action: "candidate.offer",
      entityType: "Candidate",
      entityId: c.id,
      summary: `Offer ${formatINR(input.offeredCtc)}${budgetMax && input.offeredCtc > budgetMax ? " (above budget)" : ""}`,
    });
  });
  return { aboveBudget: !!budgetMax && input.offeredCtc > budgetMax };
}

/** Convert an accepted offer into an employee record (with onboarding checklist and account invite). */
export async function hireCandidate(actor: Actor, candidateId: string, workEmail: string) {
  assertPermission(actor, "recruitment:manage");
  assertPermission(actor, "employee:create");
  const c = await db.candidate.findFirst({
    where: { id: candidateId, deletedAt: null },
    include: { recruitment: true },
  });
  if (!c) throw new NotFoundError("Candidate");
  if (c.stage !== "OFFER" || !c.joiningDate)
    throw new ConflictError("Only candidates with an offer can be hired.");
  const emp = await createEmployee(actor, {
    firstName: c.firstName,
    lastName: c.lastName,
    workEmail,
    personalEmail: c.email,
    phone: c.phone ?? undefined,
    gender: "UNDISCLOSED",
    country: "India",
    departmentId: c.recruitment.departmentId ?? undefined,
    designationId: c.recruitment.designationId ?? undefined,
    managerId: c.recruitment.hiringManagerId ?? undefined,
    employmentType: c.recruitment.employmentType,
    workLocation: c.recruitment.location ?? undefined,
    dateOfJoining: dbDateToKey(c.joiningDate),
    createAccount: true,
  });
  await db.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: c.id },
      data: { stage: "HIRED", hiredEmployeeId: emp.id },
    });
    // Move candidate documents (resume etc.) to the employee profile.
    await tx.document.updateMany({ where: { candidateId: c.id }, data: { employeeId: emp.id } });
    const hired = await tx.candidate.count({
      where: { recruitmentId: c.recruitmentId, stage: "HIRED" },
    });
    if (hired >= c.recruitment.openings)
      await tx.recruitment.update({
        where: { id: c.recruitmentId },
        data: { status: "CLOSED", closedAt: new Date() },
      });
    await writeAudit(tx, actor, {
      action: "candidate.hire",
      entityType: "Candidate",
      entityId: c.id,
      summary: `Hired as ${emp.employeeCode}`,
    });
  });
  return emp;
}

export async function recruitmentAnalytics() {
  const [byStage, bySource, hires, offers, reqs] = await Promise.all([
    db.candidate.groupBy({ by: ["stage"], where: { deletedAt: null }, _count: true }),
    db.candidate.groupBy({ by: ["source"], where: { deletedAt: null }, _count: true }),
    db.candidate.findMany({
      where: { stage: "HIRED" },
      select: { createdAt: true, offerDate: true },
    }),
    db.candidate.count({ where: { offerDate: { not: null } } }),
    db.recruitment.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
  ]);
  const days = hires
    .filter((h) => h.offerDate)
    .map((h) => (h.offerDate!.getTime() - h.createdAt.getTime()) / 86400000);
  return {
    byStage: byStage.map((s) => ({ name: s.stage, value: s._count })),
    bySource: bySource.map((s) => ({ name: s.source ?? "Unknown", value: s._count })),
    avgDaysToOffer: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    offerAcceptance: offers ? Math.round((hires.length / offers) * 100) : null,
    openRequisitions: reqs.find((r) => r.status === "OPEN")?._count ?? 0,
    pendingApproval: reqs.find((r) => r.status === "PENDING_APPROVAL")?._count ?? 0,
  };
}

export async function myInterviews(actor: Actor) {
  if (!actor.employeeId) return [];
  return db.interview.findMany({
    where: { interviewerId: actor.employeeId, status: { in: ["SCHEDULED", "COMPLETED"] } },
    include: {
      candidate: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          recruitment: { select: { id: true, title: true, code: true } },
        },
      },
    },
    orderBy: { scheduledAt: "desc" },
    take: 50,
  });
}
