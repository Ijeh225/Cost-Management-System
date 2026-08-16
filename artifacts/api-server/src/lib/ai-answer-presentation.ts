export type AiPresentationFact = { label: string; value: string | number; detail?: string };

export type AiAnswerPresentation = {
  keyFindings: string[];
  recordedCauses: string[];
  recommendations: string[];
  limitations: string[];
};

function nonZero(value: string | number): boolean {
  if (typeof value === "number") return value !== 0;
  const normalised = value.replace(/[^\d.-]/g, "");
  if (!normalised) return Boolean(value.trim());
  const numeric = Number(normalised);
  return Number.isFinite(numeric) ? numeric !== 0 : Boolean(value.trim());
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, 5);
}

/** Formats only facts and notes already returned by approved tools. */
export function buildAiAnswerPresentation(input: {
  facts: AiPresentationFact[];
  notes: string[];
  recordCount: number;
  noData: boolean;
}): AiAnswerPresentation {
  if (input.noData) {
    return {
      keyFindings: [],
      recordedCauses: [],
      recommendations: [],
      limitations: ["No matching source records were returned in your current authorised branch scope."],
    };
  }

  const keyFindings = input.facts
    .filter((fact) => nonZero(fact.value))
    .slice(0, 5)
    .map((fact) => `${fact.label}: ${fact.value}${fact.detail ? ` (${fact.detail})` : ""}`);
  const recordedCauses = input.notes
    .filter((note) => /^(potential blocker:|recorded .*delay reason:)/i.test(note));
  const limitations = input.notes
    .filter((note) => /^(evidence incomplete:|no files are currently attached|this list does not depend on ocr)/i.test(note));
  const recommendations = [
    ...(recordedCauses.length ? ["Resolve the recorded blocker, then update the normal workflow record."] : []),
    ...(input.recordCount ? ["Open the cited record(s) below to confirm the live details before acting."] : []),
    ...(!input.recordCount ? ["No individual source record was returned; review the relevant module before acting."] : []),
  ];

  return {
    keyFindings: unique(keyFindings),
    recordedCauses: unique(recordedCauses),
    recommendations: unique(recommendations),
    limitations: unique(limitations),
  };
}
