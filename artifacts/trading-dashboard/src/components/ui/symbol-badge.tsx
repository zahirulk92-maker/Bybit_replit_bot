import { cn } from "@/lib/utils";

interface SymbolBadgeProps {
  symbol: string;
  className?: string;
}

export function SymbolBadge({ symbol, className }: SymbolBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-1 rounded bg-secondary/50 text-foreground border border-border font-mono text-sm font-semibold tracking-wider",
        className
      )}
    >
      {symbol}
    </span>
  );
}
