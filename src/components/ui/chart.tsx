import * as React from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  { label?: React.ReactNode; color?: string }
>;

interface ChartContainerProps {
  config: ChartConfig;
  className?: string;
  children: React.ReactElement;
}

/**
 * Wraps Recharts in a sized responsive container and exposes the configured
 * palette as `--color-<key>` CSS variables so marks can use
 * `fill="var(--color-hours)"`.
 */
export function ChartContainer({
  config,
  className,
  children,
}: ChartContainerProps) {
  const style = React.useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(config)) {
      if (value.color) vars[`--color-${key}`] = value.color;
    }
    return vars as unknown as React.CSSProperties;
  }, [config]);

  return (
    <div className={cn("h-[200px] w-full", className)} style={style}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
