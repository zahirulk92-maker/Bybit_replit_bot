import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DataTable, 
  DataTableBody, 
  DataTableCell, 
  DataTableHead, 
  DataTableHeader, 
  DataTableRow 
} from "@/components/ui/data-table";
import { mockSignals } from "@/lib/mock-data";
import { SymbolBadge } from "@/components/ui/symbol-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Signals() {
  return (
    <AppLayout>
      <div className="flex flex-col space-y-4">
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 justify-end items-center">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-muted-foreground mr-2" />
            <Select defaultValue="all">
              <SelectTrigger className="w-[140px] bg-card text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="executed">Executed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all_dir">
              <SelectTrigger className="w-[140px] bg-card text-sm">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_dir">All Directions</SelectItem>
                <SelectItem value="long">LONG</SelectItem>
                <SelectItem value="short">SHORT</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all_strat">
              <SelectTrigger className="w-[180px] bg-card text-sm">
                <SelectValue placeholder="Strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_strat">All Strategies</SelectItem>
                <SelectItem value="momentum">Momentum Breakout</SelectItem>
                <SelectItem value="mean_rev">Mean Reversion</SelectItem>
                <SelectItem value="trend">Trend Follow</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Signals Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Time</DataTableHead>
                  <DataTableHead>ID</DataTableHead>
                  <DataTableHead>Symbol</DataTableHead>
                  <DataTableHead>Direction</DataTableHead>
                  <DataTableHead>Strategy</DataTableHead>
                  <DataTableHead className="text-right">Confidence</DataTableHead>
                  <DataTableHead className="text-right">Entry</DataTableHead>
                  <DataTableHead className="text-right">SL</DataTableHead>
                  <DataTableHead className="text-right">TP</DataTableHead>
                  <DataTableHead>Status</DataTableHead>
                  <DataTableHead></DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {mockSignals.map((sig) => (
                  <DataTableRow key={sig.id}>
                    <DataTableCell className="font-mono text-xs text-muted-foreground">{sig.time}</DataTableCell>
                    <DataTableCell className="font-mono text-xs text-muted-foreground">{sig.id}</DataTableCell>
                    <DataTableCell><SymbolBadge symbol={sig.symbol} /></DataTableCell>
                    <DataTableCell><StatusBadge status={sig.direction} /></DataTableCell>
                    <DataTableCell className="text-sm">{sig.strategy}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm text-primary">{sig.confidence}%</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{sig.entry}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm text-red-400">{sig.sl}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm text-green-400">{sig.tp}</DataTableCell>
                    <DataTableCell><StatusBadge status={sig.status} /></DataTableCell>
                    <DataTableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="text-xs text-primary hover:underline" data-testid={`view-signal-${sig.id}`}>View</button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px] bg-card border-border">
                          <DialogHeader>
                            <DialogTitle className="flex items-center space-x-2">
                              <span>Signal Detail</span>
                              <span className="font-mono text-muted-foreground text-sm">{sig.id}</span>
                            </DialogTitle>
                            <DialogDescription>
                              Full parameters for generated signal.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground uppercase">Symbol</span>
                                <div><SymbolBadge symbol={sig.symbol} /></div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground uppercase">Direction</span>
                                <div><StatusBadge status={sig.direction} /></div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground uppercase">Strategy</span>
                                <div className="text-sm font-medium">{sig.strategy}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground uppercase">Confidence</span>
                                <div className="text-sm font-mono text-primary">{sig.confidence}%</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground uppercase">Entry Price</span>
                                <div className="text-sm font-mono">{sig.entry}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground uppercase">Status</span>
                                <div><StatusBadge status={sig.status} /></div>
                              </div>
                            </div>
                            <div className="p-3 bg-secondary/30 rounded border border-border">
                              <div className="flex justify-between mb-2">
                                <span className="text-xs text-muted-foreground">Take Profit</span>
                                <span className="text-sm font-mono text-green-400">{sig.tp}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-xs text-muted-foreground">Stop Loss</span>
                                <span className="text-sm font-mono text-red-400">{sig.sl}</span>
                              </div>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
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
