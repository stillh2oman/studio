"use client";

import { Badge } from "@/components/ui/badge";
import { FileText, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type ContractAgreementHtmlFrameProps = {
  title: string;
  html: string;
  className?: string;
  /** Override footer hint (e.g. admin preview). */
  footerNote?: string;
};

/**
 * Read-only agreement body for the client sign page (HTML templates).
 * PDF is produced only after both parties sign.
 */
export function ContractAgreementHtmlFrame({
  title,
  html,
  className,
  footerNote = "Review the agreement above, then sign below. A PDF is created after the lead designer countersigns.",
}: ContractAgreementHtmlFrameProps) {
  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 rounded-md border border-border bg-card overflow-hidden",
        className
      )}
    >
      <div className="bg-ink text-ink-foreground p-3 flex flex-wrap items-center justify-between gap-3 z-10 shrink-0 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-secondary p-2 rounded-md border border-border shrink-0">
            <Lock className="text-ledger-red w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold uppercase tracking-wide truncate text-foreground">{title}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                variant="outline"
                className="border-ledger-yellow/40 text-ledger-yellow bg-transparent font-bold text-[9px] h-4 gap-1"
              >
                <FileText className="w-3 h-3" />
                AGREEMENT (HTML)
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-background p-4 sm:p-6">
        <article
          className={cn(
            "contract-agreement-html max-w-3xl mx-auto bg-card rounded-md border border-border p-6 sm:p-10",
            "text-foreground/95 text-sm leading-relaxed",
            "[&_h1]:text-xl [&_h1]:font-bold [&_h1]:uppercase [&_h1]:tracking-wide [&_h1]:mb-4 [&_h1]:text-foreground",
            "[&_h2]:text-base [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-foreground",
            "[&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1",
            "[&_strong]:text-foreground"
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <div className="bg-secondary px-3 py-2 text-muted-foreground border-t border-border text-[8px] uppercase tracking-widest font-bold shrink-0">
        {footerNote}
      </div>
    </div>
  );
}
