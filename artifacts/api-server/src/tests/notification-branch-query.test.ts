import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const hooks = await import(new URL("../../../../lib/api-client-react/src/notifications.ts", import.meta.url).href);
const { clearCsrfToken } = await import(new URL("../../../../lib/api-client-react/src/custom-fetch.ts", import.meta.url).href);
const requireClient = createRequire(new URL("../../../../lib/api-client-react/package.json", import.meta.url));
const requireWeb = createRequire(new URL("../../../cost-analysis/package.json", import.meta.url));
const { QueryClient, QueryClientProvider } = await import(pathToFileURL(requireClient.resolve("@tanstack/react-query").replace(/\.cjs$/, ".js")).href);
const { createElement } = requireClient("react");
const { renderToString } = requireWeb("react-dom/server");
const clients: any[] = [];

function renderHooks(scope?: number | "all") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  let result: any;
  function Probe() {
    hooks.useGetNotifications(undefined, scope);
    hooks.useGetWorkflowNotifications({ params: { type: "invoice_paid", read: "unread" } }, scope);
    hooks.useGetAlertHistory(undefined, scope);
    result = {
      classic: hooks.useMarkNotificationRead(scope), allClassic: hooks.useMarkAllNotificationsRead(scope),
      viewed: hooks.useMarkNotificationsViewed(scope), workflow: hooks.useMarkWorkflowNotificationRead(scope),
      allWorkflow: hooks.useMarkAllWorkflowNotificationsRead(scope),
    };
    return null;
  }
  renderToString(createElement(QueryClientProvider, { client }, createElement(Probe)));
  return { client, mutations: result };
}

function mockRequests() {
  const calls: Array<{ url: string; method: string; branch: string | null }> = [];
  vi.stubGlobal("window", { localStorage: { getItem: () => "3" } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    calls.push({ url, method: options?.method ?? "GET", branch: new Headers(options?.headers).get("X-Branch-Id") });
    return new Response(JSON.stringify(url === "/api/auth/csrf" ? { token: "local-test" } : { success: true }),
      { headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}

afterEach(() => { clients.splice(0).forEach(client => client.clear()); clearCsrfToken(); vi.unstubAllGlobals(); });

describe("notification scope and invalidation", () => {
  it("separates all three sources by branch while preserving workflow filters", () => {
    const all = renderHooks("all").client.getQueryCache().getAll();
    const branch = renderHooks(2).client.getQueryCache().getAll();
    for (let i = 0; i < 3; i++) {
      expect(all[i].queryKey.at(-1)).toEqual({ branchScope: "all" });
      expect(branch[i].queryKey.at(-1)).toEqual({ branchScope: 2 });
      expect(all[i].queryHash).not.toBe(branch[i].queryHash);
    }
    expect(branch[1].queryKey[1]).toEqual({ type: "invoice_paid", read: "unread" });
  });

  it("pins requests and cancellation signals to the query scope despite changed storage", async () => {
    const calls = mockRequests();
    const { client } = renderHooks(2);
    const signal = new AbortController().signal;
    for (const query of client.getQueryCache().getAll()) await query.options.queryFn({ signal });
    expect(calls).toHaveLength(3);
    expect(calls.every(call => call.branch === "2")).toBe(true);
    expect(calls[1].url).toBe("/api/workflow-notifications?type=invoice_paid&read=unread");
    for (const [, options] of (fetch as any).mock.calls) expect(options.signal).toBe(signal);
  });

  it("pins all read and viewed mutations to their original branch across CSRF acquisition", async () => {
    const calls = mockRequests();
    const { mutations } = renderHooks(2);
    await mutations.classic.mutateAsync({ alertKey: "warning:1" });
    await mutations.allClassic.mutateAsync();
    await mutations.viewed.mutateAsync();
    await mutations.workflow.mutateAsync({ id: 42 });
    await mutations.allWorkflow.mutateAsync();
    const writes = calls.filter(call => call.method === "POST");
    expect(writes.map(call => call.url)).toEqual([
      "/api/notifications/warning%3A1/read", "/api/notifications/read-all", "/api/notifications/mark-viewed",
      "/api/workflow-notifications/42/read", "/api/workflow-notifications/read-all",
    ]);
    expect(writes.every(call => call.branch === "2")).toBe(true);
    expect(calls.some(call => call.url === "/api/auth/csrf")).toBe(true);
  });

  it("invalidates all classic branch snapshots and history without unrelated caches", async () => {
    mockRequests();
    const { client, mutations } = renderHooks(2);
    const keys = [["notifications", { branchScope: "all" }], ["notifications", { branchScope: 1 }],
      ["notifications", "history", { branchScope: "all" }], ["workflow-notifications", { branchScope: 1 }], ["/api/banks"]];
    keys.forEach(key => client.setQueryData(key, { unreadCount: 1 }));
    await mutations.classic.mutateAsync({ alertKey: "warning:1" });
    expect(keys.map(key => client.getQueryState(key).isInvalidated)).toEqual([true, true, true, false, false]);
    await mutations.allWorkflow.mutateAsync();
    expect(client.getQueryState(keys[3]).isInvalidated).toBe(true);
    expect(client.getQueryState(keys[4]).isInvalidated).toBe(false);
  });

  it("keeps unscoped API compatibility for existing callers", () => {
    const queries = renderHooks().client.getQueryCache().getAll();
    expect(queries.map((query: any) => query.queryKey)).toEqual([
      ["notifications"], ["workflow-notifications", { type: "invoice_paid", read: "unread" }], ["notifications", "history"],
    ]);
  });
});
