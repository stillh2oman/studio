
"use client";

import { Construction } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="py-8 border-t border-border bg-background mt-auto">
      <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2">
            <Construction className="w-4 h-4" />
            <span>&copy; {new Date().getFullYear()} Designer's Ink PlanPort. All rights reserved.</span>
          </div>
          <p className="text-[10px] opacity-70">
            All designs are the intellectual property of Designer's Ink Graphic & Building Designs, LLC.
          </p>
        </div>
        <div className="flex gap-6">
          <Link 
            href="/contact" 
            className="text-xs font-semibold uppercase tracking-wide text-foreground hover:text-ledger-yellow transition-colors duration-200"
          >
            Contact Designer's Ink Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
