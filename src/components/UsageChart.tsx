import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DailyTotal } from "../hooks/useUsageData";

interface UsageChartProps {
  data: DailyTotal[];
}

const ANTHROPIC_COLOR = "#f59e0b";
const OPENAI_COLOR = "#6366f1";
const CLAUDE_CODE_COLOR = "#10b981";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function UsageChart({ data }: UsageChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        No usage data yet. Add your API keys and wait for the first poll.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={{ stroke: "#374151" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(2)}`}
          width={52}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#111827",
            border: "1px solid #374151",
            borderRadius: 8,
            color: "#f9fafb",
          }}
          formatter={(value: number | undefined) => [`$${(value ?? 0).toFixed(4)}`, undefined]}
          labelFormatter={(label) => formatDate(String(label))}
        />
        <Legend
          wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
          formatter={(value) =>
            value === "anthropic"
              ? "Anthropic"
              : value === "openai"
              ? "OpenAI"
              : "Claude Code"
          }
        />
        <Line
          type="monotone"
          dataKey="anthropic"
          stroke={ANTHROPIC_COLOR}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="openai"
          stroke={OPENAI_COLOR}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="claude_code"
          stroke={CLAUDE_CODE_COLOR}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
