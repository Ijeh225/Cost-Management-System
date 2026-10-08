import { useRef } from "react";

export function useSettlementRequestKey() {
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  return {
    forPayload(payload: object) {
      const fingerprint = JSON.stringify(payload);
      // Keep the key after an uncertain response; retrying must not post twice.
      if (attempt.current?.payload !== fingerprint) {
        attempt.current = { payload: fingerprint, key: crypto.randomUUID() };
      }
      return attempt.current.key;
    },
    reset() { attempt.current = null; },
  };
}
