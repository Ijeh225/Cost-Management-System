import type { QueryClient } from "@tanstack/react-query";

export function invalidateShipmentSummaries(client: QueryClient) {
  // Each visit has its own cache key, including visits in the old B/L after a move.
  return client.invalidateQueries({
    predicate: query => typeof query.queryKey[0] === "string"
      && /^\/api\/containers\/\d+\/shipment$/.test(query.queryKey[0]),
  });
}
