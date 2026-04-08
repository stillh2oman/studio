"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isLedgerFirebaseConfigured } from "@/firebase/ledger-config";
import {
  mapLedgerDocToPlanPortClient,
  mapLedgerDocToPlanPortContractor,
  searchLedgerClients,
  searchLedgerContractors,
  type LedgerDocHit
} from "@/lib/ledger-service";
import { Database, Loader2, Search } from "lucide-react";

type ClientApply = ReturnType<typeof mapLedgerDocToPlanPortClient>;
type ContractorApply = ReturnType<typeof mapLedgerDocToPlanPortContractor>;

export type LedgerImportPanelProps =
  | { mode: "client"; onApply: (data: ClientApply) => void; className?: string }
  | { mode: "contractor"; onApply: (data: ContractorApply) => void; className?: string };

export function LedgerImportPanel(props: LedgerImportPanelProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<LedgerDocHit[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isLedgerFirebaseConfigured()) {
    return (
      <p className="text-[10px] text-muted-foreground rounded-md border border-dashed border-border p-2 bg-secondary">
        Ledger import: set <span className="font-mono">NEXT_PUBLIC_LEDGER_FIREBASE_*</span> in{" "}
        <span className="font-mono">.env.local</span> (see <span className="font-mono">ledger-config.ts</span>).
      </p>
    );
  }

  const runSearch = async () => {
    setError(null);
    setLoading(true);
    setHits([]);
    try {
      const list =
        props.mode === "client"
          ? await searchLedgerClients(term)
          : await searchLedgerContractors(term);
      setHits(list);
      if (list.length === 0) {
        setError("No matches. Check Ledger collection names and order field env vars.");
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Ledger search failed (Firestore rules / indexes / field names).");
    } finally {
      setLoading(false);
    }
  };

  const applyHit = (h: LedgerDocHit) => {
    if (props.mode === "client") {
      props.onApply(mapLedgerDocToPlanPortClient(h.data));
    } else {
      props.onApply(mapLedgerDocToPlanPortContractor(h.data));
    }
    setOpen(false);
    setHits([]);
    setTerm("");
  };

  const label = props.mode === "client" ? "client" : "contractor";

  return (
    <div className={props.className}>
      {!open ? (
        <Button type="button" variant="outline" size="sm" className="w-full border-accent/40" onClick={() => setOpen(true)}>
          <Database className="w-4 h-4 mr-2 text-accent" />
          Import {label} from Designer's Ledger
        </Button>
      ) : (
        <div className="rounded-xl border bg-secondary/10 p-3 space-y-3">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Search Ledger ({label}s)
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="Type at least 2 letters…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), runSearch())}
            />
            <Button type="button" size="sm" onClick={runSearch} disabled={loading || term.trim().length < 2}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {hits.length > 0 && (
            <ScrollArea className="h-40 rounded-md border bg-background">
              <ul className="p-1 space-y-1">
                {hits.map((h) => {
                  const title =
                    props.mode === "client"
                      ? (() => {
                          const p = mapLedgerDocToPlanPortClient(h.data);
                          return `${p.husbandName}${p.wifeName ? ` & ${p.wifeName}` : ""}`;
                        })()
                      : mapLedgerDocToPlanPortContractor(h.data).name;
                  const preview =
                    props.mode === "client"
                      ? mapLedgerDocToPlanPortClient(h.data)
                      : mapLedgerDocToPlanPortContractor(h.data);
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="w-full text-left text-xs px-2 py-2 rounded-md hover:bg-accent/15 border border-transparent hover:border-accent/30"
                        onClick={() => applyHit(h)}
                      >
                        <span className="font-semibold text-primary block">{title}</span>
                        {"email" in preview && preview.email && (
                          <span className="text-muted-foreground">{preview.email}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
          <Button type="button" variant="ghost" size="sm" className="w-full h-8" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
