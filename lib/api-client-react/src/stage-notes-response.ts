export type StageNote = {
  id: number;
  containerId: number;
  stage: string;
  note: string;
  authorId: number;
  authorName: string;
  createdAt: string;
};

// A successful HTTP response can still contain an HTML fallback or malformed data.
export function parseStageNotes(value: unknown): StageNote[] {
  if (!Array.isArray(value) || !value.every((note): note is StageNote => (
    note !== null && typeof note === "object"
    && Number.isInteger(note.id) && Number.isInteger(note.containerId)
    && Number.isInteger(note.authorId) && typeof note.authorName === "string"
    && typeof note.stage === "string" && typeof note.note === "string"
    && typeof note.createdAt === "string" && Number.isFinite(Date.parse(note.createdAt))
  ))) {
    throw new Error("Stage notes could not be loaded. Please try again.");
  }
  return value;
}
