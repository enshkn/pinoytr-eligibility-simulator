import { describe, expect, it } from "vitest";
import { assessApplication, type AssessmentInput } from "../src/assessment";

const confirmed = {
  socialAssistanceFree: "yes",
  sufficientIncome: "yes",
  healthInsurance: "yes",
  publicOrderSafe: "yes",
} as const;

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
});
