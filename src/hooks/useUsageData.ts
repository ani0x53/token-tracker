import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import Database from "@tauri-apps/plugin-sql";

export interface UsageSnapshot {
  id?: number;
  provider: "anthropic" | "openai";
  model: string;
  date: string;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  cost_usd: number;
  fetched_at: string;
}

export interface DailyTotal {
  date: string;
  anthropic: number;
  openai: number;
  total: number;
}

export interface ModelTotal {
  provider: string;
  model: string;
  total_tokens: number;
  cost_usd: number;
}

let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function getDb() {
  if (!db) {
    db = await Database.load("sqlite:token_tracker.db");
    // Initialise schema
    await db.execute(`
      CREATE TABLE IF NOT EXISTS usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        date TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        fetched_at TEXT NOT NULL,
        UNIQUE(provider, model, date)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
  return db;
}

async function fetchSnapshots(days = 30): Promise<UsageSnapshot[]> {
  const d = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return d.select<UsageSnapshot[]>(
    "SELECT * FROM usage_snapshots WHERE date >= ? ORDER BY date ASC",
    [cutoffStr],
  );
}

export function upsertSnapshots(snapshots: UsageSnapshot[]) {
  return getDb().then(async (d) => {
    for (const s of snapshots) {
      await d.execute(
        `INSERT INTO usage_snapshots
           (provider, model, date, input_tokens, output_tokens, cache_tokens, cost_usd, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, model, date) DO UPDATE SET
           input_tokens = excluded.input_tokens,
           output_tokens = excluded.output_tokens,
           cache_tokens = excluded.cache_tokens,
           cost_usd = excluded.cost_usd,
           fetched_at = excluded.fetched_at`,
        [
          s.provider,
          s.model,
          s.date,
          s.input_tokens,
          s.output_tokens,
          s.cache_tokens,
          s.cost_usd,
          s.fetched_at,
        ],
      );
    }
  });
}

function aggregateDailyTotals(snapshots: UsageSnapshot[]): DailyTotal[] {
  const map = new Map<string, DailyTotal>();
  for (const s of snapshots) {
    if (!map.has(s.date)) {
      map.set(s.date, { date: s.date, anthropic: 0, openai: 0, total: 0 });
    }
    const day = map.get(s.date)!;
    day[s.provider] += s.cost_usd;
    day.total += s.cost_usd;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateModelTotals(snapshots: UsageSnapshot[]): ModelTotal[] {
  const map = new Map<string, ModelTotal>();
  for (const s of snapshots) {
    const key = `${s.provider}:${s.model}`;
    if (!map.has(key)) {
      map.set(key, {
        provider: s.provider,
        model: s.model,
        total_tokens: 0,
        cost_usd: 0,
      });
    }
    const m = map.get(key)!;
    m.total_tokens += s.input_tokens + s.output_tokens;
    m.cost_usd += s.cost_usd;
  }
  return Array.from(map.values()).sort((a, b) => b.cost_usd - a.cost_usd);
}

export function useUsageData(days = 30) {
  const queryClient = useQueryClient();

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["usage", days] });
  }, [queryClient, days]);

  // Listen for new snapshots from Rust poller and upsert them
  useEffect(() => {
    const unlisten = listen<UsageSnapshot[]>("new-snapshots", async (event) => {
      await upsertSnapshots(event.payload);
      refetch();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refetch]);

  // Listen for usage-updated event (refetch signal)
  useEffect(() => {
    const unlisten = listen("usage-updated", () => refetch());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refetch]);

  const query = useQuery({
    queryKey: ["usage", days],
    queryFn: () => fetchSnapshots(days),
  });

  const snapshots = query.data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const todayAnthropicCost = snapshots
    .filter((s) => s.date === today && s.provider === "anthropic")
    .reduce((sum, s) => sum + s.cost_usd, 0);

  const todayOpenaiCost = snapshots
    .filter((s) => s.date === today && s.provider === "openai")
    .reduce((sum, s) => sum + s.cost_usd, 0);

  const todayAnthropicTokens = snapshots
    .filter((s) => s.date === today && s.provider === "anthropic")
    .reduce((sum, s) => sum + s.input_tokens + s.output_tokens, 0);

  const todayOpenaiTokens = snapshots
    .filter((s) => s.date === today && s.provider === "openai")
    .reduce((sum, s) => sum + s.input_tokens + s.output_tokens, 0);

  return {
    snapshots,
    dailyTotals: aggregateDailyTotals(snapshots),
    modelTotals: aggregateModelTotals(snapshots),
    todayAnthropicCost,
    todayOpenaiCost,
    todayAnthropicTokens,
    todayOpenaiTokens,
    isLoading: query.isLoading,
    refetch,
  };
}
