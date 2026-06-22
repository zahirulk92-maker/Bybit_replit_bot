import React from "react";
import { cn } from "@/lib/utils";

interface DataTableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

export function DataTable({ children, className, ...props }: DataTableProps) {
  return (
    <div className="w-full overflow-auto border border-border rounded-md bg-card">
      <table className={cn("w-full text-sm text-left", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function DataTableHeader({ children, className }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("text-xs text-muted-foreground bg-secondary/50 border-b border-border uppercase tracking-wider", className)}>
      {children}
    </thead>
  );
}

export function DataTableBody({ children, className }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)}>{children}</tbody>;
}

export function DataTableRow({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("hover:bg-secondary/20 transition-colors", className)} {...props}>
      {children}
    </tr>
  );
}

export function DataTableHead({ children, className }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("px-4 py-3 font-medium", className)}>
      {children}
    </th>
  );
}

export function DataTableCell({ children, className }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3 whitespace-nowrap", className)}>
      {children}
    </td>
  );
}
