import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Settings } from "lucide-react";
import ProviderCard from "./ProviderCard";
import UsageChart from "./UsageChart";
import ModelBreakdown from "./ModelBreakdown";
import AlertSettings from "./AlertSettings";
import { useUsageData } from "../hooks/useUsageData";
import { useAlerts } from "../hooks/useAlerts";
import { useSettingsStore } from "../store/settingsStore";

export default function Dashboard() {
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { settings, loaded } = useSettingsStore();

  // Auto-open settings on first launch if neither key is configured
  useEffect(() => {
    if (loaded && !settings.anthropic_key && !settings.openai_key) {
      setShowSettings(true);
    }
  }, [loaded]);

  const {
    dailyTotals,
    modelTotals,
    todayAnthropicCost,
    todayOpenaiCost,
    todayClaudeCodeCost,
    todayAnthropicTokens,
    todayOpenaiTokens,
    todayClaudeCodeTokens,
    isLoading,
    refetch,
  } = useUsageData(30);

  // Alert monitoring runs silently in the background
  useAlerts();

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await invoke("trigger_refresh");
      // Give the poller ~1s to emit events, then refetch from DB
      await new Promise((r) => setTimeout(r, 1000));
      refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const monthlyTotal = dailyTotals.reduce((s, d) => s + d.total, 0);

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Token Tracker</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            30-day total:{" "}
            <span className="text-gray-300">${monthlyTotal.toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh now"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Settings size={14} />
            Settings
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Provider cards */}
        <div className="flex gap-4">
          <ProviderCard
            name="Anthropic"
            color="#f59e0b"
            todayCost={todayAnthropicCost}
            todayTokens={todayAnthropicTokens}
            hasKey={!!settings.anthropic_key}
          />
          <ProviderCard
            name="OpenAI"
            color="#6366f1"
            todayCost={todayOpenaiCost}
            todayTokens={todayOpenaiTokens}
            hasKey={!!settings.openai_key}
          />
          <ProviderCard
            name="Claude Code"
            color="#10b981"
            todayCost={todayClaudeCodeCost}
            todayTokens={todayClaudeCodeTokens}
            hasKey={true}
          />
        </div>

        {/* Daily usage chart */}
        <section className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">
            Daily Cost — Last 30 Days
          </h2>
          {isLoading ? (
            <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">
              Loading…
            </div>
          ) : (
            <UsageChart data={dailyTotals} />
          )}
        </section>

        {/* Model breakdown */}
        <section className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">
            Cost by Model
          </h2>
          {isLoading ? (
            <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">
              Loading…
            </div>
          ) : (
            <ModelBreakdown data={modelTotals} />
          )}
        </section>

        {/* Alert notice */}
        {settings.alert_daily_usd && (
          <p className="text-xs text-gray-600 text-center pb-2">
            Daily alert threshold: ${settings.alert_daily_usd}
            {settings.alert_monthly_usd &&
              ` · Monthly: $${settings.alert_monthly_usd}`}
          </p>
        )}
      </main>

      {showSettings && (
        <AlertSettings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
