import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatCount, formatHour } from "@/lib/format";

const config: ChartConfig = {
  incidents: { label: "Incidents", color: "hsl(var(--primary))" },
};

export function HourOfDayChart({ hours }: { hours: number[] }) {
  const data = hours.map((value, hour) => ({ hour, value }));

  return (
    <ChartContainer config={config} className="h-[176px] w-full">
      <BarChart data={data} margin={{ top: 6, right: 2, bottom: 0, left: -24 }}>
        <CartesianGrid
          vertical={false}
          stroke="hsl(var(--border))"
          strokeDasharray="3 3"
        />
        <XAxis
          dataKey="hour"
          interval={0}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) =>
            value % 3 === 0 ? formatHour(value) : ""
          }
          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.45 }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 11,
            color: "hsl(var(--popover-foreground))",
          }}
          formatter={(value) => [formatCount(Number(value)), "incidents"]}
          labelFormatter={(value) =>
            `${formatHour(Number(value))}–${formatHour((Number(value) + 1) % 24)}`
          }
        />
        <Bar
          dataKey="value"
          fill="var(--color-incidents)"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
