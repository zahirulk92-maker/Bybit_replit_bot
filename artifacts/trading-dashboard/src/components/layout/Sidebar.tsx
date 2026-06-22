import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Activity, 
  Radio, 
  ListOrdered, 
  Briefcase, 
  ShieldAlert, 
  BookOpen, 
  Settings 
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/scanner", label: "Market Scanner", icon: Activity },
    { href: "/signals", label: "Signals", icon: Radio },
    { href: "/execution", label: "Execution", icon: ListOrdered },
    { href: "/active-trades", label: "Active Trades", icon: Briefcase },
    { href: "/risk", label: "Risk Control", icon: ShieldAlert },
    { href: "/journal", label: "Journal / Logs", icon: BookOpen },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="w-60 bg-sidebar border-r border-border flex flex-col h-[100dvh] flex-shrink-0">
      <div className="p-4 flex items-center justify-between border-b border-border h-16 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <span className="font-bold text-primary-foreground text-xl leading-none tracking-tighter">TB</span>
          </div>
          <span className="font-bold text-lg tracking-tight">TradeBot</span>
        </div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded tracking-wider">
          DEMO
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = location === item.href || (location === "/" && item.href === "/dashboard");
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground/70 hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </div>
            <span className="text-sm font-medium text-green-500">Bot Running</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">v2.1.0</span>
        </div>
      </div>
    </div>
  );
}
