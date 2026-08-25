import "./styles.css";
import {
  assessApplication,
  type Answer,
  type AssessmentResult,
  type PermitPeriod,
  type PermitType,
  type ShortTermPurpose,
  type SimulatorMode,
} from "./assessment";
import { conditionLabels, modeLabels, permitLabels, purposeLabels, t, type Language } from "./i18n";

interface RuntimeConfig {
  analyticsScriptUrl?: string;
  consultationUrl?: string;
  consultationText?: Partial<Record<Language, string>>;
}

const runtimeConfig: RuntimeConfig = await fetch(new URL(/* @vite-ignore */ "../config.json", import.meta.url))
  .then((response) => response.ok ? response.json() as Promise<RuntimeConfig> : {})
  .catch(() => ({}));

const permitTypes = Object.keys(permitLabels.en) as PermitType[];
const purposes = Object.keys(purposeLabels.en) as ShortTermPurpose[];
const conditionsByMode: Record<SimulatorMode, string[]> = {
  "long-term": ["socialAssistanceFree", "sufficientIncome", "healthInsurance", "publicOrderSafe"],
  citizenship: ["adultAndCapable", "settlementIntent", "noDangerousDisease", "goodCharacter", "sufficientTurkish", "incomeOrProfession", "publicOrderSafe"],
};
const sources = [
  ["Göç İdaresi", "https://www.goc.gov.tr/ikamet-izni-cesitleri"],
  ["NVI", "https://nvi.gov.tr/turk-vatandasliginin-kazanilmasi"],
  ["ÇSGB", "https://www.csgb.gov.tr/sikca-sorulan-sorular/uluslararasi-%C4%B1sgucu-genel-mudurlugu/calisma-%C4%B1zni/"],
] as const;

const today = new Date().toISOString().slice(0, 10);
const state: {
  language: Language;
  mode: SimulatorMode | null;
  assessmentDate: string;
  permits: PermitPeriod[];
  conditions: Record<string, Answer>;
  result: AssessmentResult | null;
  error: "empty" | "date" | null;
} = {
  language: "en",
  mode: null,
  assessmentDate: today,
  permits: [],
  conditions: {},
  result: null,
  error: null,
};

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Application root is missing");
const app = root;

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function option(value: string, label: string, selected: boolean): string {
  return `<option value="${escapeAttribute(value)}"${selected ? " selected" : ""}>${label}</option>`;
}

function permitMarkup(permit: PermitPeriod, index: number): string {
  const c = state.language;
  const typeOptions = permitTypes.map((type) => option(type, permitLabels[c][type], permit.type === type)).join("");
  const purposeOptions = purposes.map((purpose) => option(purpose, purposeLabels[c][purpose], permit.purpose === purpose)).join("");
  return `
    <fieldset class="permit" data-permit-id="${permit.id}">
      <div class="permit__heading">
        <legend>${t(c, "permit")} ${index + 1}</legend>
        <button class="button button--quiet" type="button" data-action="remove-permit">${t(c, "remove")}</button>
      </div>
      <div class="form-grid">
        <label class="field field--wide"><span>${t(c, "permitType")}</span><select data-field="type" required>${typeOptions}</select></label>
        ${permit.type === "short-term" ? `<label class="field field--wide"><span>${t(c, "purpose")}</span><select data-field="purpose" required>${purposeOptions}</select></label>` : ""}
        <label class="field"><span>${t(c, "start")}</span><input data-field="start" type="date" value="${permit.start}" max="${state.assessmentDate}" required></label>
        <label class="field"><span>${t(c, "end")}</span><input data-field="end" type="date" value="${permit.end}" max="${state.assessmentDate}" ${permit.ongoing ? "disabled" : "required"}></label>
      </div>
      <label class="check"><input data-field="ongoing" type="checkbox" ${permit.ongoing ? "checked" : ""}> <span>${t(c, "ongoing")}</span></label>
    </fieldset>`;
}

function conditionsMarkup(): string {
  if (!state.mode) return "";
  const c = state.language;
  return conditionsByMode[state.mode].map((key) => `
    <label class="condition">
      <span>${conditionLabels[c][key]}</span>
      <select data-condition="${key}">
        ${option("unsure", t(c, "unsure"), (state.conditions[key] ?? "unsure") === "unsure")}
        ${option("yes", t(c, "yes"), state.conditions[key] === "yes")}
        ${option("no", t(c, "no"), state.conditions[key] === "no")}
      </select>
    </label>`).join("");
}

function statusText(result: AssessmentResult): string {
  const keys = {
    "threshold-reached": "thresholdReached",
    "threshold-not-reached": "thresholdNotReached",
    "official-verification-required": "verificationRequired",
    "status-excluded": "statusExcluded",
    "already-holds-status": "alreadyHolds",
  } as const;
  return t(state.language, keys[result.status]);
}

function warningText(code: string): string {
  const mapping: Record<string, "travelWarning" | "gapWarning" | "shortGapWarning" | "overlapWarning" | "uncertainWarning"> = {
    "travel-history-not-assessed": "travelWarning",
    "gap-over-90-days": "gapWarning",
    "short-gap-needs-verification": "shortGapWarning",
    "overlap-needs-verification": "overlapWarning",
    "uncertain-periods": "uncertainWarning",
  };
  return mapping[code] ? t(state.language, mapping[code]) : code;
}

function resultMarkup(result: AssessmentResult): string {
  const c = state.language;
  const conditionName = (key: string) => conditionLabels[c][key] ?? key;
  const consultationText = runtimeConfig.consultationText?.[c];
  const consultationUrl = runtimeConfig.consultationUrl;
  return `
    <section class="result" aria-labelledby="result-title" tabindex="-1">
      <p class="kicker">${t(c, "resultTitle")}</p>
      <h2 id="result-title">${statusText(result)}</h2>
      <div class="result__numbers">
        <div><span>${t(c, "counted")}</span><strong>${result.countedDays.toLocaleString(c)} ${t(c, "days")}</strong></div>
        <div><span>${t(c, "required")}</span><strong>${result.requiredDays.toLocaleString(c)} ${t(c, "days")}</strong></div>
        <div><span>${t(c, "remaining")}</span><strong>${result.remainingDays.toLocaleString(c)} ${t(c, "days")}</strong></div>
      </div>
      ${result.projectedThresholdDate ? `<p class="projection"><strong>${t(c, "projected")}:</strong> ${new Intl.DateTimeFormat(c, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${result.projectedThresholdDate}T00:00:00Z`))}<br><span>${t(c, "projectionNote")}</span></p>` : ""}
      <div class="warnings">${result.warnings.map((warning) => `<p>${warningText(warning)}</p>`).join("")}</div>
      ${result.unmetConditions.length ? `<p><strong>${t(c, "unmet")}:</strong> ${result.unmetConditions.map(conditionName).join(", ")}</p>` : ""}
      ${result.unsureConditions.length ? `<p><strong>${t(c, "unsureConditions")}:</strong> ${result.unsureConditions.map(conditionName).join(", ")}</p>` : ""}
      <details>
        <summary>${t(c, "details")}</summary>
        <dl class="breakdown">
          <div><dt>${t(c, "fullDays")}</dt><dd>${result.fullDays}</dd></div>
          <div><dt>${t(c, "halfDays")}</dt><dd>${result.halfDays}</dd></div>
          <div><dt>${t(c, "excludedDays")}</dt><dd>${result.excludedDays}</dd></div>
          <div><dt>${t(c, "uncertainDays")}</dt><dd>${result.uncertainDays}</dd></div>
          <div><dt>${t(c, "gapDays")}</dt><dd>${result.gapDays}</dd></div>
          <div><dt>${t(c, "overlapDays")}</dt><dd>${result.overlapDays}</dd></div>
        </dl>
      </details>
      ${consultationText && consultationUrl ? `<a class="button button--primary consultation" href="${escapeAttribute(consultationUrl)}">${consultationText}</a>` : ""}
    </section>`;
}

function headerMarkup(): string {
  return `<header class="app-header"><img src="./logo.png" alt="" width="48" height="48"><label class="language"><span>${t(state.language, "language")}</span><select id="language">${option("tr", "Türkçe", state.language === "tr")}${option("en", "English", state.language === "en")}${option("tl", "Tagalog", state.language === "tl")}</select></label></header>`;
}

function introMarkup(): string {
  const c = state.language;
  return `<main class="intro"><div class="intro__copy"><h1>${t(c, "introTitle")}</h1><p>${t(c, "introBody")}</p></div><div class="path-grid"><button class="path" data-mode="long-term"><span>${t(c, "longTerm")}</span><small>${t(c, "longTermBody")}</small></button><button class="path" data-mode="citizenship"><span>${t(c, "citizenship")}</span><small>${t(c, "citizenshipBody")}</small></button></div></main>`;
}

function formMarkup(): string {
  if (!state.mode) return "";
  const c = state.language;
  return `<main><div class="page-title"><button class="back" type="button" data-action="change-path">‹ ${t(c, "changePath")}</button><h1>${modeLabels[c][state.mode]}</h1></div><form id="assessment-form" novalidate><section class="panel"><label class="field field--date"><span>${t(c, "assessmentDate")}</span><input id="assessment-date" type="date" value="${state.assessmentDate}" required></label></section><section class="section"><div class="section__heading"><div><h2>${t(c, "permitHistory")}</h2><p>${t(c, "permitHistoryBody")}</p></div><button class="button button--secondary" type="button" data-action="add-permit">${t(c, "addPermit")}</button></div><div class="permits">${state.permits.map(permitMarkup).join("")}</div></section><section class="section"><h2>${t(c, "conditions")}</h2><div class="conditions">${conditionsMarkup()}</div></section>${state.error ? `<p class="error" role="alert">${t(c, state.error === "empty" ? "emptyError" : "dateError")}</p>` : ""}<button class="button button--primary submit" type="submit">${t(c, "calculate")}</button></form>${state.result ? resultMarkup(state.result) : ""}<footer><p>${t(c, "disclaimer")}</p><p>${t(c, "reviewed")}</p><strong>${t(c, "sources")}</strong><ul>${sources.map(([name, url]) => `<li><a href="${url}" target="_blank" rel="noreferrer">${name}</a></li>`).join("")}</ul></footer></main>`;
}

function render(): void {
  document.documentElement.lang = t(state.language, "documentLanguage");
  app.innerHTML = `<div class="shell">${headerMarkup()}${state.mode ? formMarkup() : introMarkup()}</div>`;
  bindEvents();
  notifyHeight();
}

function addPermit(): void {
  state.permits.push({ id: crypto.randomUUID(), type: "short-term", purpose: "unknown", start: "", end: "", ongoing: false });
  state.result = null;
  render();
}

function updatePermit(target: HTMLElement): void {
  const fieldset = target.closest<HTMLElement>("[data-permit-id]");
  if (!fieldset) return;
  const permit = state.permits.find((item) => item.id === fieldset.dataset.permitId);
  const field = target.dataset.field as keyof PermitPeriod | undefined;
  if (!permit || !field) return;
  if (target instanceof HTMLInputElement && field === "ongoing") permit.ongoing = target.checked;
  else if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
    if (field === "type") permit.type = target.value as PermitType;
    else if (field === "purpose") permit.purpose = target.value as ShortTermPurpose;
    else if (field === "start") permit.start = target.value;
    else if (field === "end") permit.end = target.value;
  }
  state.result = null;
  render();
}

function validPermits(): boolean {
  if (state.permits.length === 0) return false;
  return state.permits.every((permit) => permit.start && (permit.ongoing || permit.end) && (permit.ongoing || permit.end >= permit.start) && permit.start <= state.assessmentDate);
}

function bindEvents(): void {
  document.querySelector<HTMLSelectElement>("#language")?.addEventListener("change", (event) => {
    state.language = (event.currentTarget as HTMLSelectElement).value as Language;
    render();
  });
  document.querySelectorAll<HTMLElement>("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    state.mode = button.dataset.mode as SimulatorMode;
    state.conditions = Object.fromEntries(conditionsByMode[state.mode].map((key) => [key, "unsure"]));
    render();
  }));
  document.querySelector<HTMLElement>("[data-action='change-path']")?.addEventListener("click", () => { state.mode = null; state.result = null; render(); });
  document.querySelector<HTMLElement>("[data-action='add-permit']")?.addEventListener("click", addPermit);
  document.querySelectorAll<HTMLElement>("[data-action='remove-permit']").forEach((button) => button.addEventListener("click", () => {
    const id = button.closest<HTMLElement>("[data-permit-id]")?.dataset.permitId;
    state.permits = state.permits.filter((permit) => permit.id !== id);
    state.result = null;
    render();
  }));
  document.querySelectorAll<HTMLElement>("[data-field]").forEach((control) => control.addEventListener("change", () => updatePermit(control)));
  document.querySelector<HTMLInputElement>("#assessment-date")?.addEventListener("change", (event) => { state.assessmentDate = (event.currentTarget as HTMLInputElement).value; state.result = null; render(); });
  document.querySelectorAll<HTMLSelectElement>("[data-condition]").forEach((select) => select.addEventListener("change", () => { state.conditions[select.dataset.condition ?? ""] = select.value as Answer; state.result = null; }));
  document.querySelector<HTMLFormElement>("#assessment-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.permits.length === 0) { state.error = "empty"; render(); return; }
    if (!validPermits() || !state.mode) { state.error = "date"; render(); return; }
    state.error = null;
    state.result = assessApplication({ mode: state.mode, assessmentDate: state.assessmentDate, permits: state.permits, conditions: state.conditions });
    render();
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".result")?.focus());
  });
}

function notifyHeight(): void {
  requestAnimationFrame(() => window.parent.postMessage({ type: "pinoytr:resize", height: document.documentElement.scrollHeight }, "*"));
}

function loadAnalytics(): void {
  const url = runtimeConfig.analyticsScriptUrl;
  if (!url) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = url;
  script.referrerPolicy = "no-referrer";
  document.head.append(script);
}

new ResizeObserver(notifyHeight).observe(document.body);
loadAnalytics();
render();
