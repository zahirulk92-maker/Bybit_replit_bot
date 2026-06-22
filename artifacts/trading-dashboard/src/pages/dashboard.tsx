import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLayout } from "@/components/layout/AppLayout";
import { 
  mockDashboardStats, 
  mockRecentTrades, 
  mockActivePositions, 
  mockSignals 
} from "@/lib/mock-data";
import { StatusBadge } from "@/components/ui/status-badge";
import { PnLCell } from "@/components/ui/pnl-cell";
import { SymbolBadge } from "@/components/ui/symbol-badge";
import { RiskGauge } from "@/components/ui/risk-gauge";
import { 
  DataTable, 
  DataTableBody, 
  DataTableCell, 
  DataTableHead, 
  DataTableHeader, 
  DataTableRow 
} from "@/components/ui/data-table";
import { DollarSign, Activity, Target, Zap, ShieldAlert, BarChart3 } from "lucide-react";

export default function Dashboard() {
  return (
    <AppLayout>
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Equity</span>
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="text-2xl font-mono font-bold tracking-tight">
              ${mockDashboardStats.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Today PnL</span>
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="text-2xl font-mono font-bold tracking-tight">
              <PnLCell value={mockDashboardStats.todayPnl} prefix="$" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Win Rate</span>
              <Target className="w-4 h-4" />
            </div>
            <div className="text-2xl font-mono font-bold tracking-tight text-primary">
              {mockDashboardStats.winRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Trades</span>
              <Activity className="w-4 h-4" />
            </div>
            <div className="text-2xl font-mono font-bold tracking-tight">
              {mockDashboardStats.activeTrades}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Signals Today</span>
              <Zap className="w-4 h-4" />
            </div>
            <div className="text-2xl font-mono font-bold tracking-tight">
              {mockDashboardStats.signalsToday}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">Bot Status</span>
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </div>
              <span className="text-lg font-bold text-green-500 tracking-tight">RUNNING</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Positions */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-4 border-b border-border">
            <CardTitle className="text-sm font-semibold tracking-wide uppercase">Active Positions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Symbol</DataTableHead>
                  <DataTableHead>Side</DataTableHead>
                  <DataTableHead className="text-right">Qty</DataTableHead>
                  <DataTableHead className="text-right">Entry</DataTableHead>
                  <DataTableHead className="text-right">Current</DataTableHead>
                  <DataTableHead className="text-right">Unrealized PnL</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {mockActivePositions.map((pos) => (
                  <DataTableRow key={pos.id}>
                    <DataTableCell><SymbolBadge symbol={pos.symbol} /></DataTableCell>
                    <DataTableCell><StatusBadge status={pos.side} /></DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">{pos.qty}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">{pos.entry}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">{pos.current}</DataTableCell>
                    <DataTableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <PnLCell value={pos.unrealized} prefix="$" className="text-sm" />
                        <PnLCell value={pos.pnlPercent} isPercent className="text-[10px] opacity-80" />
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </CardContent>
        </Card>

        {/* Risk Status */}
        <Card>
          <CardHeader className="p-4 border-b border-border">
            <CardTitle className="text-sm font-semibold tracking-wide uppercase">Risk Utilization</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-6">
            <RiskGauge value={mockDashboardStats.drawdownUsed} label="Max Drawdown" limitLabel="15.0%" />
            <RiskGauge value={45} label="Daily Loss Limit" limitLabel="$5,000" />
            <RiskGauge value={80} label="Max Positions" limitLabel="5" />
            <RiskGauge value={25} label="Leverage Cap" limitLabel="10x" />
          </CardContent>
        </Card>

        {/* Recent Signals */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-4 border-b border-border">
            <CardTitle className="text-sm font-semibold tracking-wide uppercase">Recent Signals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Time</DataTableHead>
                  <DataTableHead>Symbol</DataTableHead>
                  <DataTableHead>Dir</DataTableHead>
                  <DataTableHead>Strategy</DataTableHead>
                  <DataTableHead className="text-right">Conf</DataTableHead>
                  <DataTableHead>Status</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {mockSignals.slice(0, 5).map((sig) => (
                  <DataTableRow key={sig.id}>
                    <DataTableCell className="font-mono text-xs text-muted-foreground">{sig.time}</DataTableCell>
                    <DataTableCell><SymbolBadge symbol={sig.symbol} /></DataTableCell>
                    <DataTableCell><StatusBadge status={sig.direction} /></DataTableCell>
                    <DataTableCell className="text-xs">{sig.strategy}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">{sig.confidence}%</DataTableCell>
                    <DataTableCell><StatusBadge status={sig.status} /></DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </CardContent>
        </Card>

        {/* Recent Trades */}
        <Card>
          <CardHeader className="p-4 border-b border-border">
            <CardTitle className="text-sm font-semibold tracking-wide uppercase">Recent Trades</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Symbol</DataTableHead>
                  <DataTableHead>Dir</DataTableHead>
                  <DataTableHead className="text-right">PnL</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {mockRecentTrades.slice(0, 5).map((trade) => (
                  <DataTableRow key={trade.id}>
                    <DataTableCell><SymbolBadge symbol={trade.symbol} /></DataTableCell>
                    <DataTableCell><StatusBadge status={trade.side} /></DataTableCell>
                    <DataTableCell className="text-right">
                      <PnLCell value={trade.pnl} prefix="$" className="text-xs" />
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
