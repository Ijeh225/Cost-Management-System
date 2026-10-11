import type { QueryKey } from "@tanstack/react-query";

export type BranchQueryScope = number | "all";

// Cache identity and request scope must describe the same branch snapshot.
export function getBranchQueryOptions(scope: BranchQueryScope | undefined, key: QueryKey) {
  return {
    query: { queryKey: scope === undefined ? key : [...key, { branchScope: scope }] },
    request: scope === undefined ? undefined : { headers: { "X-Branch-Id": String(scope) } },
  };
}
