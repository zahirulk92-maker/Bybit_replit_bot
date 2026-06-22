import { cn } from "@/lib/utils";

interface LogEntryProps {
  time: string;
  level: string;
  message: string;
}

export function LogEntry({ time, level, message }: LogEntryProps) {
  let levelColor = "text-gray-400";
  if (level === "INFO") levelColor = "text-blue-400";
  if (level === "WARN") levelColor = "text-amber-400";
  if (level === "ERROR") levelColor = "text-red-500";
  if (level === "DEBUG") levelColor = "text-purple-400";

  return (
    <div className="flex items-start space-x-3 py-1.5 font-mono text-sm border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
      <span className="text-muted-foreground shrink-0 w-20">{time}</span>
      <span className={cn("shrink-0 w-14 font-semibold", levelColor)}>{level}</span>
      <span className="text-foreground break-all">{message}</span>
    </div>
  );
}
