export type SimulatorMode = "long-term" | "citizenship";
export type Answer = "yes" | "no" | "unsure";
export type PermitType =
  | "short-term"
  | "family"
  | "student"
  | "work-permit"
  | "work-exemption"
  | "humanitarian"
  | "trafficking-victim"
  | "international-protection"
  | "temporary-protection"
  | "long-term"
  | "other"
  | "unknown";

export type ShortTermPurpose =
  | "tourism"
  | "treatment"
  | "student-child-accompaniment"
  | "property"
  | "business"
  | "turkish-course"
  | "scientific-research"
  | "other"
  | "unknown";

export interface PermitPeriod {
  id: string;
  type: PermitType;
  purpose?: ShortTermPurpose;
  start: string;
  end: string;
  ongoing: boolean;
  protectionBased?: boolean;
}

export interface AssessmentInput {
  mode: SimulatorMode;
  assessmentDate: string;
  permits: PermitPeriod[];
  conditions: Record<string, Answer>;
}

export type AssessmentStatus =
  | "threshold-reached"
  | "threshold-not-reached"
  | "official-verification-required"
  | "status-excluded"
  | "already-holds-status";

export interface AssessmentResult {
  status: AssessmentStatus;
  countedDays: number;
  fullDays: number;
  halfDays: number;
  excludedDays: number;
  uncertainDays: number;
  gapDays: number;
  overlapDays: number;
  requiredDays: number;
  remainingDays: number;
  projectedThresholdDate?: string;
  travelHistoryAssessed: false;
  warnings: string[];
  unmetConditions: string[];
  unsureConditions: string[];
}

const DAY = 86_400_000;

function parseDate(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function yearsBefore(value: string, years: number): string {
  const date = new Date(parseDate(value));
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, endExclusive: string): number {
  return Math.round((parseDate(endExclusive) - parseDate(start)) / DAY);
}

function nextDay(value: string): string {
  return new Date(parseDate(value) + DAY).toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return new Date(parseDate(value) + days * DAY).toISOString().slice(0, 10);
}

type DayClass = "full" | "half" | "uncertain" | "excluded";

function classifyPermit(mode: SimulatorMode, permit: PermitPeriod): DayClass {
  if (mode === "long-term") {
    if (permit.type === "student") return "half";
    if (
      permit.type === "humanitarian" ||
      permit.type === "international-protection" ||
      permit.type === "temporary-protection" ||
      ((permit.type === "work-permit" || permit.type === "work-exemption") && permit.protectionBased)
    ) return "excluded";
    if (permit.type === "other" || permit.type === "unknown") return "uncertain";
    return "full";
  }

  if (permit.type === "short-term") {
    if (permit.purpose === "tourism") return "excluded";
    if (
      permit.purpose === "treatment" ||
      permit.purpose === "student-child-accompaniment" ||
      permit.purpose === "turkish-course" ||
      permit.purpose === "other" ||
      permit.purpose === "unknown" ||
      !permit.purpose
    ) return "uncertain";
    return "full";
  }
  if (permit.type === "student") return "uncertain";
  if (
    permit.type === "humanitarian" ||
    permit.type === "international-protection" ||
    permit.type === "temporary-protection" ||
    permit.type === "trafficking-victim" ||
    permit.type === "other" ||
    permit.type === "unknown" ||
    ((permit.type === "work-permit" || permit.type === "work-exemption") && permit.protectionBased)
  ) return "uncertain";
  return "full";
}

const classPriority: Record<DayClass, number> = { excluded: 0, uncertain: 1, half: 2, full: 3 };

export function assessApplication(input: AssessmentInput): AssessmentResult {
  const requiredDays = daysBetween(
    yearsBefore(input.assessmentDate, input.mode === "long-term" ? 8 : 5),
    input.assessmentDate,
  );
  const days = new Map<number, DayClass>();
  let overlapDays = 0;
  let firstDay = Number.POSITIVE_INFINITY;
  let lastDayExclusive = Number.NEGATIVE_INFINITY;

  for (const permit of input.permits) {
    const start = parseDate(permit.start);
    const statedEnd = permit.ongoing ? input.assessmentDate : nextDay(permit.end);
    const endExclusive = Math.min(parseDate(statedEnd), parseDate(input.assessmentDate));
    if (!Number.isFinite(start) || endExclusive <= start) continue;
    firstDay = Math.min(firstDay, start);
    lastDayExclusive = Math.max(lastDayExclusive, endExclusive);
    const classification = classifyPermit(input.mode, permit);
    for (let day = start; day < endExclusive; day += DAY) {
      const existing = days.get(day);
      if (existing) {
        overlapDays += 1;
        if (classPriority[classification] > classPriority[existing]) days.set(day, classification);
      } else {
        days.set(day, classification);
      }
    }
  }

  let fullDays = 0;
  let rawHalfDays = 0;
  let excludedDays = 0;
  let uncertainDays = 0;
  for (const classification of days.values()) {
    if (classification === "full") fullDays += 1;
    if (classification === "half") rawHalfDays += 1;
    if (classification === "excluded") excludedDays += 1;
    if (classification === "uncertain") uncertainDays += 1;
  }
  const halfDays = Math.floor(rawHalfDays / 2);
  const countedDays = fullDays + halfDays;
  let gapDays = 0;
  if (Number.isFinite(firstDay) && Number.isFinite(lastDayExclusive)) {
    for (let day = firstDay; day < lastDayExclusive; day += DAY) {
      if (!days.has(day)) gapDays += 1;
    }
  }

  const unmetConditions = Object.entries(input.conditions)
    .filter(([, answer]) => answer === "no")
    .map(([condition]) => condition);
  const unsureConditions = Object.entries(input.conditions)
    .filter(([, answer]) => answer === "unsure")
    .map(([condition]) => condition);
  const warnings = ["travel-history-not-assessed"];
  if (gapDays > 90) warnings.push("gap-over-90-days");
  else if (gapDays > 0) warnings.push("short-gap-needs-verification");
  if (overlapDays > 0) warnings.push("overlap-needs-verification");
  if (uncertainDays > 0) warnings.push("uncertain-periods");

  const latestPermit = [...input.permits]
    .sort((a, b) => parseDate(b.ongoing ? input.assessmentDate : b.end) - parseDate(a.ongoing ? input.assessmentDate : a.end))[0];
  const latestIsCurrent = latestPermit && (
    latestPermit.ongoing || parseDate(latestPermit.end) >= parseDate(input.assessmentDate)
  );
  const latestIsExcluded = input.mode === "long-term" && latestPermit && latestIsCurrent && (
    ["humanitarian", "international-protection", "temporary-protection"].includes(latestPermit.type) ||
    ((latestPermit.type === "work-permit" || latestPermit.type === "work-exemption") && latestPermit.protectionBased)
  );
  let status: AssessmentStatus = countedDays >= requiredDays ? "threshold-reached" : "threshold-not-reached";
  if (input.mode === "long-term" && latestPermit?.type === "long-term" && latestIsCurrent) status = "already-holds-status";
  else if (latestIsExcluded) status = "status-excluded";
  else if (gapDays > 90 || uncertainDays > 0 || unmetConditions.length > 0 || unsureConditions.length > 0) {
    status = "official-verification-required";
  }
  const remainingDays = Math.max(0, requiredDays - countedDays);

  return {
    status,
    countedDays,
    fullDays,
    halfDays,
    excludedDays,
    uncertainDays,
    gapDays,
    overlapDays,
    requiredDays,
    remainingDays,
    projectedThresholdDate: remainingDays > 0 ? addDays(input.assessmentDate, remainingDays) : undefined,
    travelHistoryAssessed: false,
    warnings,
    unmetConditions,
    unsureConditions,
  };
}
