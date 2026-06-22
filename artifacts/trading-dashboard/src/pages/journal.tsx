import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DataTable, 
  DataTableBody, 
  DataTableCell, 
  DataTableHead, 
  DataTableHeader, 
  DataTableRow 
} from "@/components/ui/data-table";
import { mockLogs, mockPnlChartData } from "@/lib/mock-data";
import { LogEntry } from "@/components/ui/log-entry";
import { SymbolBadge } from "@/components/ui/symbol-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PnLCell } from "@/components/ui/pnl-cell";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const mockTradeJournal = [
  { id: "J-01", symbol: "BTCUSDT", dir: "LONG", entry: 63500, exit: 64200, pnl: 350.5, pnlPercent: 1.1, dur: "1h 15m", strat: "Momentum" },
  { id: "J-02", symbol: "ETHUSDT", dir: "SHORT", entry: 3500, exit: 3550, pnl: -250.0, pnlPercent: -1.4, dur: "0h 45m", strat: "Mean Rev" },
  { id: "J-03", symbol: "SOLUSDT", dir: "LONG", entry: 135, exit: 142, pnl: 420.0, pnlPercent: 5.1, dur: "2h 30m", strat: "Trend" },
  { id: "J-04", symbol: "XRPUSDT", dir: "SHORT", entry: 0.65, exit: 0.62, pnl: 150.0, pnlPercent: 4.6, dur: "1h 10m", strat: "VWAP Cross" },
  { id: "J-05", symbol: "BNBUSDT", dir: "LONG", entry: 570, exit: 565, pnl: -75.0, pnlPercent: -0.8, dur: "0h 20m", strat: "Momentum" },
];

export default function Journal() {
  return (
    <AppLayout>
      <Tabs defaultValue="journal" className="w-full">
        <TabsList className="bg-secondary/50 border border-border w-full justify-start rounded-none rounded-t-lg p-0 h-auto">
          <TabsTrigger value="journal" className="data-[state=active]:bg-card rounded-none border-r border-border px-6 py-3 text-sm font-semibold tracking-wide">
            Trade Journal
          </TabsTrigger>
          <TabsTrigger value="system" className="data-[state=active]:bg-card rounded-none border-r border-border px-6 py-3 text-sm font-semibold tracking-wide">
            System Logs
          </TabsTrigger>
          <TabsTrigger value="error" className="data-[state=active]:bg-card rounded-none border-r border-border px-6 py-3 text-sm font-semibold tracking-wide text-red-400 data-[state=active]:text-red-500">
            Error Log
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="journal" className="mt-0">
          <Card className="rounded-t-none border-t-0">
            <CardContent className="p-6 space-y-6">
              
              <div className="h-[250px] w-full border border-border rounded-lg bg-background/50 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mockPnlChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a303c" vertical={false} />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0d1117', borderColor: '#1f2937' }}
                      itemStyle={{ color: '#3b82f6', fontFamily: 'monospace' }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'PnL']}
                    />
                    <Line type="stepAfter" dataKey="pnl" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <DataTable>
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>Symbol</DataTableHead>
                    <DataTableHead>Dir</DataTableHead>
                    <DataTableHead className="text-right">Entry</DataTableHead>
                    <DataTableHead className="text-right">Exit</DataTableHead>
                    <DataTableHead className="text-right">PnL</DataTableHead>
                    <DataTableHead>Duration</DataTableHead>
                    <DataTableHead>Strategy</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {mockTradeJournal.map((trade) => (
                    <DataTableRow key={trade.id}>
                      <DataTableCell><SymbolBadge symbol={trade.symbol} /></DataTableCell>
                      <DataTableCell><StatusBadge status={trade.dir} /></DataTableCell>
                      <DataTableCell className="text-right font-mono text-sm">{trade.entry}</DataTableCell>
                      <DataTableCell className="text-right font-mono text-sm">{trade.exit}</DataTableCell>
                      <DataTableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <PnLCell value={trade.pnl} prefix="$" className="font-bold text-sm" />
                          <PnLCell value={trade.pnlPercent} isPercent className="text-xs opacity-80" />
                        </div>
                      </DataTableCell>
                      <DataTableCell className="font-mono text-xs text-muted-foreground">{trade.dur}</DataTableCell>
                      <DataTableCell className="text-xs">{trade.strat}</DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="mt-0">
          <Card className="rounded-t-none border-t-0">
            <CardContent className="p-0">
              <div className="bg-black/40 h-[600px] overflow-y-auto p-4 flex flex-col font-mono text-sm">
                {mockLogs.map((log) => (
                  <LogEntry key={log.id} time={log.time} level={log.level} message={log.message} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="error" className="mt-0">
          <Card className="rounded-t-none border-t-0">
            <CardContent className="p-0">
              <div className="bg-black/40 h-[600px] overflow-y-auto p-4 flex flex-col font-mono text-sm">
                {mockLogs.filter(l => l.level === "ERROR" || l.level === "WARN").map((log) => (
                  <LogEntry key={log.id} time={log.time} level={log.level} message={log.message} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
