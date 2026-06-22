import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RiskGauge } from "@/components/ui/risk-gauge";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { LogEntry } from "@/components/ui/log-entry";
import { ShieldAlert, AlertOctagon, Power } from "lucide-react";

export default function Risk() {
  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Risk Gauges */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="p-4 border-b border-border">
              <CardTitle className="text-sm font-semibold tracking-wide uppercase flex items-center">
                <ShieldAlert className="w-4 h-4 mr-2 text-primary" />
                Current Utilization
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              <RiskGauge value={12.5} label="Max Drawdown" limitLabel="15.0%" />
              <RiskGauge value={45} label="Daily Loss Limit" limitLabel="$5,000" />
              <RiskGauge value={80} label="Max Positions" limitLabel="5" />
              <RiskGauge value={65} label="Position Size" limitLabel="10% Equity" />
              <RiskGauge value={25} label="Leverage Cap" limitLabel="10x" />
            </CardContent>
          </Card>

          {/* Risk Events */}
          <Card>
            <CardHeader className="p-4 border-b border-border">
              <CardTitle className="text-sm font-semibold tracking-wide uppercase">Recent Risk Events</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-1">
                <LogEntry time="09:00:00" level="INFO" message="Risk parameter updated: Max Drawdown changed to 15%" />
                <LogEntry time="08:15:00" level="WARN" message="Position Size warning: BTCUSDT exposure reached 8% of equity" />
                <LogEntry time="07:30:05" level="ERROR" message="Order rejected: Margin limits exceeded for BNBUSDT" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Risk Breakers */}
        <div className="space-y-6">
          <Card className="border-amber-500/30">
            <CardHeader className="p-4 border-b border-border bg-amber-500/5">
              <CardTitle className="text-sm font-semibold tracking-wide uppercase text-amber-500">Risk Breakers</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold">Pause New Entries</Label>
                  <p className="text-xs text-muted-foreground">Stop accepting new signals</p>
                </div>
                <Switch data-testid="switch-pause-entries" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold text-amber-500">Kill Switch</Label>
                  <p className="text-xs text-muted-foreground">Cancel all pending orders</p>
                </div>
                <Switch data-testid="switch-kill-switch" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold text-destructive">Force Close All</Label>
                  <p className="text-xs text-muted-foreground">Market close active positions</p>
                </div>
                <Switch data-testid="switch-force-close" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-destructive/10 border-destructive">
            <CardContent className="p-6 flex flex-col items-center justify-center space-y-4 text-center">
              <AlertOctagon className="w-12 h-12 text-destructive mb-2" />
              <div>
                <h3 className="text-xl font-bold text-destructive mb-1">EMERGENCY STOP</h3>
                <p className="text-sm text-destructive/80">Halts all bot execution, cancels pending orders, and closes all open positions immediately.</p>
              </div>
              
              <ConfirmModal
                title="EMERGENCY STOP BOT?"
                description="This will immediately halt all bot processes, cancel all pending orders, and send market orders to close all active positions. Are you absolutely sure?"
                destructive
                confirmText="STOP BOT IMMEDIATELY"
                onConfirm={() => console.log("EMERGENCY STOP")}
                trigger={
                  <Button variant="destructive" size="lg" className="w-full font-bold text-lg h-14 tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.5)]" data-testid="button-emergency-stop">
                    <Power className="w-5 h-5 mr-2" />
                    STOP BOT
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>

      </div>
    </AppLayout>
  );
}
