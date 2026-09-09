import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const { invalidateShipmentSummaries } = await import(
  new URL("../../../../lib/api-client-react/src/shipment-cache.ts", import.meta.url).href
);

const requireClient = createRequire(new URL("../../../../lib/api-client-react/package.json", import.meta.url));
const { QueryClient, QueryObserver } = requireClient("@tanstack/react-query");

describe("shipment summary invalidation", () => {
  it("refreshes the visible summary and invalidates all cached sibling/old shipment views", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const key = ["/api/containers/32/shipment"];
    const sibling = ["/api/containers/33/shipment"];
    const previousShipment = ["/api/containers/40/shipment"];
    for (const queryKey of [key, sibling, previousShipment]) {
      client.setQueryData(queryKey, { delivered: 0, total: 2 });
    }
    client.setQueryData(["/api/invoices"], { total: 300 });
    client.setQueryData(["/api/containers/32/overview"], { tasks: [] });
    client.setQueryData(["/api/my-tasks"], { dailyQueue: [] });
    client.setQueryData(["/api/containers/32"], { status: "registered" });
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: async () => ({ delivered: 1, total: 2, status: "registered" }),
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await invalidateShipmentSummaries(client);
      expect(observer.getCurrentResult().data).toEqual({ delivered: 1, total: 2, status: "registered" });
      expect(client.getQueryState(sibling).isInvalidated).toBe(true);
      expect(client.getQueryState(previousShipment).isInvalidated).toBe(true);
      expect(client.getQueryState(["/api/containers/32/overview"]).isInvalidated).toBe(true);
      expect(client.getQueryState(["/api/my-tasks"]).isInvalidated).toBe(true);
      expect(client.getQueryState(["/api/invoices"]).isInvalidated).toBe(false);
      expect(client.getQueryState(["/api/containers/32"]).isInvalidated).toBe(false);
    } finally { unsubscribe(); client.clear(); }
  });

  it("does not create queries when no shipment has been viewed", async () => {
    const client = new QueryClient();
    await invalidateShipmentSummaries(client);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    client.clear();
  });
});
