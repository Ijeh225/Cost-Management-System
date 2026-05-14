const STORAGE_KEY = "cost_analysis_recent_items";
const MAX_ITEMS = 10;

export type RecentItem = {
  type: "container" | "invoice";
  id: number;
  label: string;
  sub: string;
  href: string;
};

export function getRecentItems(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function trackRecentItem(item: RecentItem): void {
  const existing = getRecentItems().filter(r => r.href !== item.href);
  const updated = [item, ...existing].slice(0, MAX_ITEMS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function clearRecentItems(): void {
  localStorage.removeItem(STORAGE_KEY);
}
