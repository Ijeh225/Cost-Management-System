import { describe, expect, it } from "vitest";
const { getBranchQueryOptions } = await import(
  new URL("../../../../lib/api-client-react/src/branch-query.ts", import.meta.url).href
);

describe("dashboard branch query identity", () => {
  it("separates All Branches and individual branch caches", () => {
    const keys = ["all", 1, 2].map(scope =>
      JSON.stringify(getBranchQueryOptions(scope as number | "all", ["/api/dashboard/stats"]).query.queryKey));
    expect(new Set(keys).size).toBe(3);
  });

  it("binds the header to the same branch as the key", () => {
    for (const scope of ["all", 1, 2] as const) {
      const options = getBranchQueryOptions(scope, ["/api/reports/pl"]);
      expect(options.query.queryKey.at(-1)).toEqual({ branchScope: scope });
      expect(options.request?.headers["X-Branch-Id"]).toBe(String(scope));
    }
  });

  it("preserves filters and existing invalidation prefixes", () => {
    const key = ["/api/reports/pl", "2026-10-01", "2026-10-11", "all", "actual_paid"];
    const result = getBranchQueryOptions(2, key).query.queryKey;
    expect(result.slice(0, key.length)).toEqual(key);
    expect(key).toHaveLength(5);
    expect(getBranchQueryOptions(2, key).query.queryKey).toEqual(result);
  });

  it("keeps an old in-flight request bound to its original branch", () => {
    const original = getBranchQueryOptions(1, ["/api/banks"]);
    getBranchQueryOptions(2, ["/api/banks"]);
    expect(original.request?.headers["X-Branch-Id"]).toBe("1");
    expect(original.query.queryKey.at(-1)).toEqual({ branchScope: 1 });
  });

  it("preserves existing unscoped callers without changing request behaviour", () => {
    const key = ["analytics", "berthing"];
    const options = getBranchQueryOptions(undefined, key);
    expect(options.query.queryKey).toBe(key);
    expect(options.request).toBeUndefined();
  });
});
