import { cn } from "@/lib/utils";

interface PnLCellProps {
  value: number;
  isPercent?: boolean;
  prefix?: string;
  className?: string;
}

export function PnLCell({ value, isPercent = false, prefix = "", className }: PnLCellProps) {
  const isPositive = value >= 0;
  const colorClass = isPositive ? "text-green-500" : "text-red-500";
  const sign = isPositive ? "+" : "";
  const formattedValue = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <span className={cn("font-mono font-medium tracking-tight", colorClass, className)}>
      {isPositive ? sign : "-"}{prefix}{formattedValue}{isPercent ? "%" : ""}
    </span>
  );
}
