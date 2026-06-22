import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const s = status.toUpperCase();
  let variantClass = "bg-gray-800 text-gray-300 border-gray-700";

  if (s === "LONG" || s === "BUY" || s === "FILLED" || s === "EXECUTED" || s === "BULLISH" || s === "UP") {
    variantClass = "bg-green-500/10 text-green-500 border-green-500/20";
  } else if (s === "SHORT" || s === "SELL" || s === "REJECTED" || s === "BEARISH" || s === "DOWN") {
    variantClass = "bg-red-500/10 text-red-500 border-red-500/20";
  } else if (s === "PENDING" || s === "MONITOR") {
    variantClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
  } else if (s === "EXPIRED" || s === "CANCELLED" || s === "HOLD") {
    variantClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border",
        variantClass,
        className
      )}
    >
      {s}
    </span>
  );
}
