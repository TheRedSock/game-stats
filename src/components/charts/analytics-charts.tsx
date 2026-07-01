"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from "recharts";
import type { CorrelationPoint, GroupMetricRow, TrendRow } from "@/lib/metrics/aggregation";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

const tooltipStyle = {
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: "8px",
};

const tooltipLabelStyle = { color: "#e8edf7" };
const tooltipItemStyle = { color: "#e8edf7" };

function chartTooltipProps() {
  return {
    contentStyle: tooltipStyle,
    labelStyle: tooltipLabelStyle,
    itemStyle: tooltipItemStyle,
    wrapperStyle: { outline: "none" },
  };
}

type ScatterTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: { name?: string; x?: number; y?: number } }>;
};

function CorrelationTooltip({ active, payload }: ScatterTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point || point.x == null || point.y == null) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm shadow-lg"
      style={{ background: "#111827", borderColor: "#1f2937", color: "#e8edf7" }}
    >
      {point.name ? <p className="mb-1 font-medium">{point.name}</p> : null}
      <p>Critic: {point.x.toFixed(1)}</p>
      <p>User: {point.y.toFixed(1)}</p>
    </div>
  );
}

export function DistributionChart({
  data,
  description = "Score distribution chart.",
}: {
  data: Array<{ bucket: string; count: number }>;
  description?: string;
}) {
  return (
    <div role="img" aria-label={description}>
      <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis dataKey="bucket" stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} />
        <Tooltip {...chartTooltipProps()} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupComparisonChart({
  data,
  description = "Grouped average score chart.",
}: {
  data: GroupMetricRow[];
  description?: string;
}) {
  const chartData = data.slice(0, 12).map((row) => ({
    name: row.label.length > 18 ? `${row.label.slice(0, 18)}…` : row.label,
    average: Number(row.average.toFixed(1)),
    count: row.count,
  }));

  return (
    <div role="img" aria-label={description}>
      <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis type="number" stroke="#94a3b8" fontSize={12} domain={[0, 100]} />
        <YAxis type="category" dataKey="name" stroke="#94a3b8" width={120} fontSize={11} />
        <Tooltip {...chartTooltipProps()} />
        <Bar dataKey="average" fill="#6366f1" radius={[0, 6, 6, 0]} />
      </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({
  data,
  description = "Release year trend chart.",
}: {
  data: TrendRow[];
  description?: string;
}) {
  return (
    <div role="img" aria-label={description}>
      <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis dataKey="year" stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 100]} />
        <Tooltip {...chartTooltipProps()} />
        <Line type="monotone" dataKey="average" stroke="#06b6d4" strokeWidth={2} dot={false} />
      </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CorrelationScatter({
  data,
  description = "Critic versus user score scatter plot.",
}: {
  data: CorrelationPoint[];
  description?: string;
}) {
  const router = useRouter();
  const scatterData = data.map(({ x, y, name, gameId }) => ({ x, y, name, gameId }));

  return (
    <div role="img" aria-label={description}>
      <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          name="Critic"
          stroke="#94a3b8"
          domain={[0, 100]}
          allowDataOverflow={false}
          ticks={[0, 25, 50, 75, 100]}
          fontSize={12}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="User"
          stroke="#94a3b8"
          domain={[0, 100]}
          allowDataOverflow={false}
          ticks={[0, 25, 50, 75, 100]}
          fontSize={12}
        />
        <Tooltip content={<CorrelationTooltip />} />
        <Scatter
          data={scatterData}
          fill="#8b5cf6"
          fillOpacity={0.75}
          cursor="pointer"
          onClick={(point: unknown) => {
            const gameId =
              (point as { gameId?: string; payload?: { gameId?: string } }).gameId ??
              (point as { payload?: { gameId?: string } }).payload?.gameId;
            if (gameId) router.push(`/games/${gameId}`);
          }}
        />
      </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
