import { describe, expect, it } from "vitest";
import { assessApplication, type AssessmentInput, type PermitPeriod, type PermitType, type ShortTermPurpose } from "../src/assessment";

const confirmed = {
  socialAssistanceFree: "yes",
  sufficientIncome: "yes",
  healthInsurance: "yes",
  publicOrderSafe: "yes",
} as const;

const oneDay = (type: PermitType, extra: Partial<PermitPeriod> = {}): PermitPeriod => ({
  id: `${type}-${extra.purpose ?? "permit"}`,
  type,
  start: "2025-01-01",
  end: "2025-01-01",
  ongoing: false,
  ...extra,
});

const longTermInput = (permits: PermitPeriod[]): AssessmentInput => ({
  mode: "long-term",
  assessmentDate: "2025-01-02",
  permits,
  conditions: confirmed,
});

describe("eligibility assessment", () => {
  it("shows that eight full years of family residence reach the long-term duration threshold", () => {
    const input: AssessmentInput = {
      mode: "long-term",
      assessmentDate: "2026-01-01",
      permits: [
        { id: "family", type: "family", start: "2018-01-01", end: "2025-12-31", ongoing: false },
      ],
      conditions: confirmed,
    };

    expect(assessApplication(input)).toMatchObject({
      status: "threshold-reached",
      countedDays: 2922,
      gapDays: 0,
      travelHistoryAssessed: false,
    });
  });

  it("half-counts student days, avoids overlap, and preserves a short gap without counting it", () => {
    const result = assessApplication({
      mode: "long-term",
      assessmentDate: "2026-01-01",
      permits: [
        { id: "student", type: "student", start: "2018-01-01", end: "2021-12-31", ongoing: false },
        { id: "work", type: "work-permit", start: "2021-12-01", end: "2025-11-30", ongoing: false },
        { id: "family", type: "family", start: "2025-12-16", end: "2025-12-31", ongoing: false },
      ],
      conditions: confirmed,
    });

    expect(result).toMatchObject({
      status: "threshold-not-reached",
      fullDays: 1477,
      halfDays: 715,
      countedDays: 2192,
      overlapDays: 31,
      gapDays: 15,
    });
  });

  it("requires official verification for a long gap and surfaces non-duration answers", () => {
    const result = assessApplication({
      mode: "long-term",
      assessmentDate: "2026-01-01",
      permits: [
        { id: "first", type: "family", start: "2016-01-01", end: "2020-01-01", ongoing: false },
        { id: "second", type: "work-permit", start: "2020-05-02", end: "2025-12-31", ongoing: false },
      ],
      conditions: { ...confirmed, sufficientIncome: "no", healthInsurance: "unsure" },
    });

    expect(result).toMatchObject({
      status: "official-verification-required",
      gapDays: 121,
      unmetConditions: ["sufficientIncome"],
      unsureConditions: ["healthInsurance"],
    });
    expect(result.warnings).toContain("gap-over-90-days");
  });

  it("separates tourism, verifiable study, and qualifying work in the citizenship result", () => {
    const result = assessApplication({
      mode: "citizenship",
      assessmentDate: "2026-01-01",
      permits: [
        { id: "tourism", type: "short-term", purpose: "tourism", start: "2018-01-01", end: "2019-12-31", ongoing: false },
        { id: "study", type: "student", start: "2020-01-01", end: "2021-12-31", ongoing: false },
        { id: "work", type: "work-permit", start: "2022-01-01", end: "2025-12-31", ongoing: false },
      ],
      conditions: {
        adultAndCapable: "yes",
        settlementIntent: "yes",
        noDangerousDisease: "yes",
        goodCharacter: "yes",
        sufficientTurkish: "yes",
        incomeOrProfession: "yes",
        publicOrderSafe: "yes",
      },
    });

    expect(result).toMatchObject({
      status: "official-verification-required",
      fullDays: 1461,
      excludedDays: 730,
      uncertainDays: 731,
      countedDays: 1461,
    });
    expect(result.warnings).toContain("uncertain-periods");
  });

  it("leads with an excluded current status for long-term residence", () => {
    const result = assessApplication({
      mode: "long-term",
      assessmentDate: "2026-01-01",
      permits: [
        { id: "humanitarian", type: "humanitarian", start: "2022-01-01", end: "", ongoing: true },
      ],
      conditions: confirmed,
    });

    expect(result.status).toBe("status-excluded");
    expect(result.excludedDays).toBe(1461);
  });

  it("preserves a 90-day gap but requires verification at 91 days", () => {
    const base: AssessmentInput = {
      mode: "long-term",
      assessmentDate: "2022-01-01",
      permits: [
        { id: "first", type: "family", start: "2021-01-01", end: "2021-01-31", ongoing: false },
        { id: "second", type: "family", start: "2021-05-02", end: "2021-12-31", ongoing: false },
      ],
      conditions: confirmed,
    };

    expect(assessApplication(base)).toMatchObject({ status: "threshold-not-reached", gapDays: 90 });
    expect(assessApplication({
      ...base,
      permits: [base.permits[0]!, { ...base.permits[1]!, start: "2021-05-03" }],
    })).toMatchObject({ status: "official-verification-required", gapDays: 91 });
  });

  it("does not describe an expired excluded permit as the current status", () => {
    const result = assessApplication({
      mode: "long-term",
      assessmentDate: "2026-01-01",
      permits: [
        { id: "expired", type: "humanitarian", start: "2022-01-01", end: "2025-06-30", ongoing: false },
      ],
      conditions: confirmed,
    });

    expect(result.status).toBe("threshold-not-reached");
  });

  it.each<PermitType>(["short-term", "family", "work-permit", "work-exemption", "trafficking-victim", "long-term"])(
    "fully counts a %s permit for long-term residence",
    (type) => expect(assessApplication(longTermInput([oneDay(type)])).fullDays).toBe(1),
  );

  it.each<PermitType>(["humanitarian", "international-protection", "temporary-protection"])(
    "excludes a %s permit from the long-term duration",
    (type) => expect(assessApplication(longTermInput([oneDay(type)])).excludedDays).toBe(1),
  );

  it("excludes protection-based work permission but counts ordinary work permission", () => {
    expect(assessApplication(longTermInput([oneDay("work-permit", { protectionBased: true })])).excludedDays).toBe(1);
    expect(assessApplication(longTermInput([oneDay("work-permit")])).fullDays).toBe(1);
  });

  it("rounds an odd number of student residence days down after half-counting", () => {
    const result = assessApplication(longTermInput([{
      ...oneDay("student"), start: "2024-12-30", end: "2025-01-01",
    }]));
    expect(result).toMatchObject({ fullDays: 0, halfDays: 1, countedDays: 1 });
  });

  it.each<[ShortTermPurpose, "fullDays" | "excludedDays" | "uncertainDays"]>([
    ["tourism", "excludedDays"],
    ["property", "fullDays"],
    ["business", "fullDays"],
    ["scientific-research", "fullDays"],
    ["treatment", "uncertainDays"],
    ["student-child-accompaniment", "uncertainDays"],
    ["turkish-course", "uncertainDays"],
    ["other", "uncertainDays"],
    ["unknown", "uncertainDays"],
  ])("classifies citizenship short-term purpose %s correctly", (purpose, bucket) => {
    const result = assessApplication({
      ...longTermInput([oneDay("short-term", { purpose })]),
      mode: "citizenship",
    });
    expect(result[bucket]).toBe(1);
  });

  it("counts every calendar day once and gives a qualifying permit priority in overlaps regardless of input order", () => {
    const permits = [oneDay("humanitarian"), oneDay("student"), oneDay("family")];
    const forward = assessApplication(longTermInput(permits));
    const reverse = assessApplication(longTermInput([...permits].reverse()));
    expect(forward).toMatchObject({ fullDays: 1, halfDays: 0, excludedDays: 0, overlapDays: 2 });
    expect(reverse).toMatchObject({ fullDays: 1, halfDays: 0, excludedDays: 0, overlapDays: 2 });
  });

  it("clips ongoing and future-ending permits at the assessment date", () => {
    const result = assessApplication(longTermInput([{
      id: "ongoing", type: "family", start: "2024-12-31", end: "2099-01-01", ongoing: true,
    }]));
    expect(result).toMatchObject({ fullDays: 2, countedDays: 2 });
  });

  it("ignores reversed, zero-length, and wholly future periods", () => {
    const result = assessApplication(longTermInput([
      { id: "reversed", type: "family", start: "2025-01-02", end: "2025-01-01", ongoing: false },
      { id: "future", type: "family", start: "2026-01-01", end: "2026-12-31", ongoing: false },
    ]));
    expect(result).toMatchObject({ countedDays: 0, gapDays: 0, overlapDays: 0 });
  });

  it("uses status precedence: current long-term holder, then excluded current status, then verification", () => {
    const holder = assessApplication(longTermInput([oneDay("long-term", { ongoing: true, end: "" })]));
    const excluded = assessApplication({
      ...longTermInput([oneDay("humanitarian", { ongoing: true, end: "" })]),
      conditions: { ...confirmed, sufficientIncome: "no" },
    });
    expect(holder.status).toBe("already-holds-status");
    expect(excluded.status).toBe("status-excluded");
  });

  it("returns an exact zero remainder at the threshold and projects a shortfall from the assessment date", () => {
    const reached = assessApplication({
      ...longTermInput([{ id: "eight-years", type: "family", start: "2017-01-02", end: "2025-01-01", ongoing: false }]),
    });
    const short = assessApplication(longTermInput([oneDay("family")]));
    expect(reached).toMatchObject({ remainingDays: 0, projectedThresholdDate: undefined });
    expect(short.projectedThresholdDate).toBe("2033-01-01");
  });

  it.each<[PermitType, "fullDays" | "uncertainDays"]>([
    ["family", "fullDays"],
    ["work-permit", "fullDays"],
    ["work-exemption", "fullDays"],
    ["long-term", "fullDays"],
    ["student", "uncertainDays"],
    ["humanitarian", "uncertainDays"],
    ["trafficking-victim", "uncertainDays"],
    ["international-protection", "uncertainDays"],
    ["temporary-protection", "uncertainDays"],
    ["other", "uncertainDays"],
    ["unknown", "uncertainDays"],
  ])("classifies citizenship permit type %s correctly", (type, bucket) => {
    const result = assessApplication({ ...longTermInput([oneDay(type)]), mode: "citizenship" });
    expect(result[bucket]).toBe(1);
  });

  it("treats a missing short-term purpose and protection-based work as uncertain for citizenship", () => {
    const missingPurpose = assessApplication({ ...longTermInput([oneDay("short-term")]), mode: "citizenship" });
    const protectedWork = assessApplication({
      ...longTermInput([oneDay("work-exemption", { protectionBased: true })]), mode: "citizenship",
    });
    expect(missingPurpose.uncertainDays).toBe(1);
    expect(protectedWork.uncertainDays).toBe(1);
  });

  it("adds only the warnings supported by the supplied history", () => {
    const clean = assessApplication(longTermInput([oneDay("family")]));
    const overlap = assessApplication(longTermInput([oneDay("family"), oneDay("family", { id: "duplicate" })]));
    expect(clean.warnings).toEqual(["travel-history-not-assessed"]);
    expect(overlap.warnings).toEqual(["travel-history-not-assessed", "overlap-needs-verification"]);
  });

  it("requires official verification when any declared condition is no or unsure", () => {
    const no = assessApplication({ ...longTermInput([oneDay("family")]), conditions: { ...confirmed, healthInsurance: "no" } });
    const unsure = assessApplication({ ...longTermInput([oneDay("family")]), conditions: { ...confirmed, healthInsurance: "unsure" } });
    expect(no).toMatchObject({ status: "official-verification-required", unmetConditions: ["healthInsurance"] });
    expect(unsure).toMatchObject({ status: "official-verification-required", unsureConditions: ["healthInsurance"] });
  });

  it("recognises a long-term permit ending on the assessment date as current", () => {
    const result = assessApplication(longTermInput([{
      id: "holder", type: "long-term", start: "2024-01-01", end: "2025-01-02", ongoing: false,
    }]));
    expect(result.status).toBe("already-holds-status");
  });
});
