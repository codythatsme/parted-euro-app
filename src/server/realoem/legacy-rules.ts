import {
  baseChassisCode,
  normaliseBody,
  realOemModelsMatch,
  type RealOemModelIdentity,
} from "./chassis";

export type LegacyCarRuleSubject = RealOemModelIdentity & {
  chassisCode: string | null;
  body?: string | null;
};

type DeleteRule = {
  chassisCode: string;
  model: string;
  body?: string;
  reason: string;
};

const DELETE_RULES: DeleteRule[] = [
  {
    chassisCode: "E30",
    model: "323i",
    body: "Convertible",
    reason: "Owner confirmed RealOEM has no E30 323i Convertible",
  },
  {
    chassisCode: "E30",
    model: "325e",
    body: "Convertible",
    reason: "Owner confirmed RealOEM has no E30 325e Convertible",
  },
  {
    chassisCode: "F34N",
    model: "328i",
    reason: "Owner confirmed F34 LCI 328i should not exist",
  },
  {
    chassisCode: "E60N",
    model: "545i",
    reason: "Owner confirmed E60 LCI 545i should not exist",
  },
  {
    chassisCode: "E63N",
    model: "645Ci",
    reason: "Owner confirmed E63 LCI 645Ci should not exist",
  },
  {
    chassisCode: "E64N",
    model: "645Ci",
    reason: "Owner confirmed E64 LCI 645Ci should not exist",
  },
];

const matchesDeleteRule = (
  subject: LegacyCarRuleSubject,
  rule: DeleteRule,
): boolean => {
  if (subject.chassisCode !== rule.chassisCode) return false;
  if (subject.model.toLowerCase() !== rule.model.toLowerCase()) return false;

  const ruleBody = normaliseBody(rule.body);
  if (ruleBody !== null && normaliseBody(subject.body) !== ruleBody) {
    return false;
  }

  return true;
};

export const getOwnerDirectedDeleteReason = (
  subject: LegacyCarRuleSubject,
): string | null =>
  DELETE_RULES.find((rule) => matchesDeleteRule(subject, rule))?.reason ?? null;

export const isOwnerDirectedDelete = (subject: LegacyCarRuleSubject): boolean =>
  getOwnerDirectedDeleteReason(subject) !== null;

export const canUseOwnerApprovedBaseChassis = (
  legacy: LegacyCarRuleSubject,
  realOem: LegacyCarRuleSubject,
): boolean => {
  if (legacy.chassisCode === null || realOem.chassisCode === null) {
    return false;
  }
  if (legacy.chassisCode === realOem.chassisCode) return true;
  if (baseChassisCode(legacy.chassisCode) !== realOem.chassisCode) {
    return false;
  }
  if (isOwnerDirectedDelete(legacy)) return false;

  if (["E82N", "E88N"].includes(legacy.chassisCode)) {
    return true;
  }

  return (
    legacy.chassisCode === "E60N" &&
    legacy.model === "M5" &&
    realOemModelsMatch(legacy, realOem)
  );
};

export const canTreatXDriveAsImplicit = (
  legacy: LegacyCarRuleSubject,
  realOem: LegacyCarRuleSubject,
): boolean => {
  if (legacy.chassisCode === null || realOem.chassisCode === null) {
    return false;
  }
  if (legacy.chassisCode !== realOem.chassisCode) return false;

  if (legacy.series === "X3" && legacy.chassisCode === "E83") {
    return true;
  }

  return (
    legacy.series.startsWith("X") &&
    /^M[0-9]/iu.test(legacy.model.trim()) &&
    /^X[0-9]\s+M[0-9]/iu.test(realOem.model.trim())
  );
};
