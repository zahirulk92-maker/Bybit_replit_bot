import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { 
  DataTable, 
  DataTableBody, 
  DataTableCell, 
  DataTableHead, 
  DataTableHeader, 
  DataTableRow 
} from "@/components/ui/data-table";
import { mockExecutions } from "@/lib/mock-data";
import { SymbolBadge } from "@/components/ui/symbol-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

export default function Execution() {
  return (
    <AppLayout>
      <div className="flex flex-col space-y-6">
        
        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Orders Today</div>
                <div className="text-2xl font-mono font-bold">142</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fill Rate</div>
                <div className="text-2xl font-mono font-bold text-green-500">96.5%</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rejected</div>
                <div className="text-2xl font-mono font-bold text-red-500">3</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Slippage</div>
                <div className="text-2xl font-mono font-bold text-amber-500">0.02%</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Execution Log Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Time</DataTableHead>
                  <DataTableHead>Order ID</DataTableHead>
                  <DataTableHead>Symbol</DataTableHead>
                  <DataTableHead>Side</DataTableHead>
                  <DataTableHead>Type</DataTableHead>
                  <DataTableHead className="text-right">Qty</DataTableHead>
                  <DataTableHead className="text-right">Price</DataTableHead>
                  <DataTableHead>Status</DataTableHead>
                  <DataTableHead>Response</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {mockExecutions.map((ord) => (
                  <DataTableRow key={ord.id}>
                    <DataTableCell className="font-mono text-xs text-muted-foreground">{ord.time}</DataTableCell>
                    <DataTableCell className="font-mono text-xs text-muted-foreground">{ord.id}</DataTableCell>
                    <DataTableCell><SymbolBadge symbol={ord.symbol} /></DataTableCell>
                    <DataTableCell><StatusBadge status={ord.side} /></DataTableCell>
                    <DataTableCell className="text-xs font-medium">{ord.type}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{ord.qty}</DataTableCell>
                    <DataTableCell className="text-right font-mono text-sm">{ord.price}</DataTableCell>
                    <DataTableCell><StatusBadge status={ord.status} /></DataTableCell>
                    <DataTableCell className="text-xs font-mono truncate max-w-[150px]" title={ord.response}>
                      <span className={ord.response === "Success" ? "text-green-500/70" : "text-red-400"}>
                        {ord.response}
                      </span>
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
