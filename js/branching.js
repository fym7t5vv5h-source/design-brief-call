/** Object type is chosen when creating a project — not inside the questionnaire. */

export const OBJECT_TYPES = {
  apt: "Квартира",
  house: "Загородный дом",
};

export const APT_BRANCH = [OBJECT_TYPES.apt];
export const HOUSE_BRANCH = [OBJECT_TYPES.house];

export function objectTypeLabel(value) {
  return value || "";
}

export function resolveObjectType(_answers = {}, brief = {}) {
  return brief.projects?.object_type || "";
}

function ruleValue(rule, answers, brief) {
  if (!rule?.q) return "";
  if (rule.q === "obj1" || rule.q === "object_type") {
    return resolveObjectType(answers, brief);
  }
  return answers[rule.q]?.choice || "";
}

function ruleChoices(rule, answers) {
  return answers[rule.q]?.choices || [];
}

/**
 * when: {
 *   q: string,
 *   in?: string[],          // choice equals one of
 *   notIn?: string[],
 *   includes?: string[],    // multi: any selected
 *   includesAll?: string[],
 * }
 */
export function isWhenVisible(item, answers, brief) {
  const rule = item?.when;
  if (!rule) return true;

  const isObjectType = rule.q === "obj1" || rule.q === "object_type";
  const value = ruleValue(rule, answers, brief);
  const choices = ruleChoices(rule, answers);

  if (rule.includes?.length || rule.includesAll?.length) {
    if (!choices.length) return false;
    if (rule.includes?.length) return rule.includes.some((x) => choices.includes(x));
    if (rule.includesAll?.length) return rule.includesAll.every((x) => choices.includes(x));
  }

  if (isObjectType && !value) return false;
  if (!value && !isObjectType && (rule.in || rule.notIn)) return false;

  if (rule.in?.length) return rule.in.includes(value);
  if (rule.notIn?.length) return !rule.notIn.includes(value);
  return true;
}

export function isSectionVisible(section, answers, brief) {
  return isWhenVisible(section, answers, brief);
}

export function isQuestionVisible(question, answers, brief) {
  return isWhenVisible(question, answers, brief);
}

export function filterVisibleSections(sections, answers, brief) {
  return (sections || []).filter((s) => isSectionVisible(s, answers, brief));
}

export function visibleQuestions(section, answers, brief) {
  return (section?.questions || []).filter((q) => isQuestionVisible(q, answers, brief));
}
