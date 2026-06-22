import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface RiskGaugeProps {
  value: number; // 0 to 100
  label: string;
  limitLabel: string;
}

export function RiskGauge({ value, label, limitLabel }: RiskGaugeProps) {
  const safeValue = Math.min(Math.max(value, 0), 100);
  
  let colorClass = "bg-green-500";
  if (safeValue > 85) colorClass = "bg-red-500";
  else if (safeValue > 60) colorClass = "bg-amber-500";

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{safeValue.toFixed(1)}% / {limitLabel}</span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500", colorClass)}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
