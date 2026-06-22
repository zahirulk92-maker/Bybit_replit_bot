import { useLocation } from "wouter";
import { RefreshCw, User, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const [location] = useLocation();
  
  const getTitle = () => {
    switch(location) {
      case "/":
      case "/dashboard": return "Dashboard";
      case "/scanner": return "Market Scanner";
      case "/signals": return "Trading Signals";
      case "/execution": return "Execution Monitor";
      case "/active-trades": return "Active Trades";
      case "/risk": return "Risk Control";
      case "/journal": return "Journal & Logs";
      case "/settings": return "Settings";
      default: return "TradeBot Console";
    }
  };

  const formattedTime = new Date().toLocaleTimeString('en-US', { hour12: false });

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{getTitle()}</h1>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground font-mono bg-secondary px-3 py-1 rounded-md border border-border">
          <RefreshCw className="w-3.5 h-3.5 text-primary" />
          <span>Last updated: {formattedTime}</span>
        </div>
        
        <Button variant="outline" size="icon" className="h-8 w-8 relative border-border">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full"></span>
        </Button>
        
        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center cursor-pointer">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </header>
  );
}
