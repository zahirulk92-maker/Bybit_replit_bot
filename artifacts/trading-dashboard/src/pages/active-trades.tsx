import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  DataTable, 
  DataTableBody, 
  DataTableCell, 
  DataTableHead, 
  DataTableHeader, 
  DataTableRow 
} from "@/components/ui/data-table";
import { mockActivePositions } from "@/lib/mock-data";
import { SymbolBadge } from "@/components/ui/symbol-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PnLCell } from "@/components/ui/pnl-cell";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { AlertOctagon, X } from "lucide-react";

export default function ActiveTrades() {
  const totalExposure = mockActivePositions.reduce((acc, pos) => acc + (pos.current * pos.qty), 0);
  const totalPnL = mockActivePositions.reduce((acc, pos) => acc + pos.unrealized, 0);
  
  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        
        {/* Top Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Exposure</div>
              <div className="text-2xl font-mono font-bold tracking-tight text-primary">
                ${totalExposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Unrealized PnL</div>
              <div className="text-2xl font-mono font-bold tracking-tight">
                <PnLCell value={totalPnL} prefix="$" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-4 flex items-center justify-between h-full">
              <div>
                <div className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Emergency</div>
                <div className="text-sm text-destructive/80">Close all active positions</div>
              </div>
              <ConfirmModal
                title="Force Close All Positions?"
                description="This will send market orders to close all currently open positions immediately. This action cannot be undone."
                destructive
                confirmText="CLOSE ALL"
                onConfirm={() => console.log("Close all positions")}
                trigger={
                  <Button variant="destructive" size="sm" data-testid="button-close-all">
                    <AlertOctagon className="w-4 h-4 mr-2" />
                    CLOSE ALL
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>

        {/* Positions Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Symbol</DataTableHead>
                  <DataTableHead>Side</DataTableHead>
                  <DataTableHead className="text-right">Qty</DataTableHead>
                  <DataTableHead className="text-right">Entry Price</DataTableHead>
                  <DataTableHead className="text-right">Current Price</DataTableHead>
                  <DataTableHead className="text-right">Unrealized PnL</DataTableHead>
                  <DataTableHead className="text-right">SL</DataTableHead>
                  <DataTableHead className="text-right">TP</DataTableHead>
                  <DataTableHead>Duration</DataTableHead>
                  <DataTableHead className="w-16"></DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {mockActivePositions.map((pos) => (
                  <DataTableRow key={pos.id}>
                    <DataTableCell><SymbolBadge symbol={pos.symbol} /></DataTableCell>
                    <DataTableCell><StatusBadge status={pos.side} /></DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{pos.qty}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{pos.entry}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{pos.current}</DataTableCell>
                    <DataTableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <PnLCell value={pos.unrealized} prefix="$" className="font-bold" />
                        <PnLCell value={pos.pnlPercent} isPercent className="text-xs opacity-80" />
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm text-red-400">{pos.sl}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm text-green-400">{pos.tp}</DataTableCell>
                    <DataTableCell className="font-mono text-xs text-muted-foreground">{pos.duration}</DataTableCell>
                    <DataTableCell>
                      <ConfirmModal
                        title={`Close ${pos.symbol} Position?`}
                        description={`This will send a market order to close ${pos.qty} ${pos.symbol}.`}
                        destructive
                        onConfirm={() => console.log("Close pos", pos.id)}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10" data-testid={`button-close-${pos.symbol}`}>
                            <X className="w-4 h-4" />
                          </Button>
                        }
                      />
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
