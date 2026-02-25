interface ProviderCardProps {
  name: string;
  color: string;
  todayCost: number;
  todayTokens: number;
  hasKey: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function ProviderCard({
  name,
  color,
  todayCost,
  todayTokens,
  hasKey,
}: ProviderCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 flex-1 min-w-[200px]">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          {name}
        </span>
        {!hasKey && (
          <span className="ml-auto text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
            No key
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-white">
        ${todayCost.toFixed(2)}
        <span className="text-base font-normal text-gray-500 ml-1">today</span>
      </p>
      <p className="text-sm text-gray-400 mt-1">
        {formatTokens(todayTokens)} tokens
      </p>
    </div>
  );
}
