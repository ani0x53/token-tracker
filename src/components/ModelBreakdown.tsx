import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ModelTotal } from "../hooks/useUsageData";

interface ModelBreakdownProps {
  data: ModelTotal[];
}

const COLORS: Record<string, string> = {
  anthropic: "#f59e0b",
  openai: "#6366f1",
};

function shortModelName(model: string): string {
  // e.g. "claude-sonnet-4-6-20251001" → "Sonnet 4.6"
  const m = model
    .replace(/^claude-/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-(\d)/g, " $1");
  return m
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ModelBreakdown({ data }: ModelBreakdownProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        No model data yet.
      </div>
    );
  }

  const chartData = data.slice(0, 10).map((m) => ({
    name: shortModelName(m.model),
    cost: parseFloat(m.cost_usd.toFixed(4)),
    provider: m.provider,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "#d1d5db", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={120}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#111827",
            border: "1px solid #374151",
            borderRadius: 8,
            color: "#f9fafb",
          }}
          formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
        />
        <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={COLORS[entry.provider] ?? "#6b7280"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
