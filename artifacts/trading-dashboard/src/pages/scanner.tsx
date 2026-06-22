import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DataTable, 
  DataTableBody, 
  DataTableCell, 
  DataTableHead, 
  DataTableHeader, 
  DataTableRow 
} from "@/components/ui/data-table";
import { mockScanner } from "@/lib/mock-data";
import { SymbolBadge } from "@/components/ui/symbol-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PnLCell } from "@/components/ui/pnl-cell";
import { Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Scanner() {
  return (
    <AppLayout>
      <div className="flex flex-col space-y-4">
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search symbol..." className="pl-9 bg-card font-mono text-sm" />
            </div>
            <Select defaultValue="1h">
              <SelectTrigger className="w-[120px] bg-card font-mono text-sm">
                <SelectValue placeholder="Timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15m">15m</SelectItem>
                <SelectItem value="1h">1h</SelectItem>
                <SelectItem value="4h">4h</SelectItem>
                <SelectItem value="1d">1d</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Select defaultValue="all">
              <SelectTrigger className="w-[140px] bg-card text-sm">
                <SelectValue placeholder="Signal Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Signals</SelectItem>
                <SelectItem value="bullish">Bullish Only</SelectItem>
                <SelectItem value="bearish">Bearish Only</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center space-x-2 bg-card border border-border px-3 py-2 rounded-md">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Vol &gt; 100M</span>
            </div>
          </div>
        </div>

        {/* Scanner Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Symbol</DataTableHead>
                  <DataTableHead className="text-right">Price</DataTableHead>
                  <DataTableHead className="text-right">24h Change</DataTableHead>
                  <DataTableHead className="text-right">Volume</DataTableHead>
                  <DataTableHead className="text-right">RSI</DataTableHead>
                  <DataTableHead>MACD</DataTableHead>
                  <DataTableHead>Trend</DataTableHead>
                  <DataTableHead className="text-right">Score</DataTableHead>
                  <DataTableHead>Action</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {mockScanner.map((row) => (
                  <DataTableRow 
                    key={row.symbol} 
                    className={cn(
                      row.action === "Buy" ? "bg-green-500/5 hover:bg-green-500/10" : 
                      row.action === "Avoid" ? "bg-red-500/5 hover:bg-red-500/10" : ""
                    )}
                  >
                    <DataTableCell><SymbolBadge symbol={row.symbol} /></DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{row.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</DataTableCell>
                    <DataTableCell className="text-right">
                      <PnLCell value={row.change24h} isPercent className="text-sm" />
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{row.volume}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{row.rsi.toFixed(1)}</DataTableCell>
                    <DataTableCell><StatusBadge status={row.macd} /></DataTableCell>
                    <DataTableCell><StatusBadge status={row.trend} /></DataTableCell>
                    <DataTableCell className="text-right font-mono font-bold text-sm">
                      <span className={row.score > 80 ? "text-green-500" : row.score < 40 ? "text-red-500" : "text-amber-500"}>
                        {row.score}
                      </span>
                    </DataTableCell>
                    <DataTableCell><StatusBadge status={row.action} /></DataTableCell>
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
