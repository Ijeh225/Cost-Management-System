import { describe, expect, it } from "vitest";
import { buildReadiness, expirySchema, reviewSchema, suggestFields, watDate } from "../lib/document-readiness.js";
describe("document readiness rules", () => {
  const doc = { id: 1, previousVersionId: null, documentType: "release", expiresOn: null };
  it("never treats an unconfigured or merely uploaded document as ready", () => {
    expect(buildReadiness(null, [doc]).ready).toBe(false);
    expect(buildReadiness(["release"], []).items[0].status).toBe("required");
    expect(buildReadiness(["release"], [doc]).items[0].status).toBe("received");
  });
  it("expires at Lagos midnight after the expiry day, including reviewed documents", () => {
    const reviewed = { ...doc, review: { status: "reviewed", documentType: "release", expiresOn: "2026-10-05" } };
    expect(buildReadiness(["release"], [reviewed], "2026-10-05").ready).toBe(true);
    expect(buildReadiness(["release"], [reviewed], "2026-10-06").items[0].status).toBe("expired");
    expect(watDate(new Date("2026-10-05T23:00:00Z"))).toBe("2026-10-06");
  });
  it("replacement invalidates readiness without erasing old reviews", () => {
    const reviewed = { ...doc, review: { status: "reviewed", documentType: "release", expiresOn: null } };
    expect(buildReadiness(["release"], [reviewed, { ...doc, id: 2, previousVersionId: 1 }]).items[0].status).toBe("received");
    expect(buildReadiness(["release"], [{ ...reviewed, review: { ...reviewed.review, status: "rejected" } }]).ready).toBe(false);
  });
  it("requires explicit source confirmation and rejects impossible dates", () => {
    expect(expirySchema.safeParse("2026-02-30").success).toBe(false);
    expect(reviewSchema.safeParse({ status: "reviewed", sourceChecked: false }).success).toBe(false);
  });
  it("suggestions retain source page/confidence and always need review", () => {
    expect(suggestFields([{ page: 2, text: "B/L: CAP02-001\nAmount: NGN500.00\nDate: 2026-10-05", confidence: 45 }])).toEqual([
      { field: "identifier", value: "CAP02-001", page: 2, confidence: 45, requiresReview: true },
      { field: "amount", value: "NGN500.00", page: 2, confidence: 45, requiresReview: true },
      { field: "date", value: "2026-10-05", page: 2, confidence: 45, requiresReview: true },
    ]);
  });
});
