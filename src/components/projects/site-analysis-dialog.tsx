"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function renderMarkdownishLine(line: string, key: string) {
  const trimmed = line.trim();
  if (trimmed.startsWith("## ")) {
    return (
      <h3 key={key} className="text-base font-headline font-bold text-white mt-6 mb-2 first:mt-0">
        {trimmed.slice(3).replace(/\*\*/g, "")}
      </h3>
    );
  }
  if (trimmed.startsWith("# ")) {
    return (
      <h2 key={key} className="text-lg font-headline font-bold text-primary mt-4 mb-2 first:mt-0">
        {trimmed.slice(2).replace(/\*\*/g, "")}
      </h2>
    );
  }
  if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    const rest = trimmed.slice(2);
    return (
      <div key={key} className="flex gap-2 text-sm text-foreground/90 leading-relaxed ml-1">
        <span className="text-primary shrink-0">•</span>
        <span className="min-w-0 break-words">{linkifyText(rest)}</span>
      </div>
    );
  }
  if (trimmed === "") {
    return <div key={key} className="h-2" />;
  }
  return (
    <p key={key} className="text-sm text-foreground/90 leading-relaxed">
      {linkifyText(line)}
    </p>
  );
}

function linkifyText(text: string) {
  const urlRe = /(https?:\/\/[^\s<>"')]+)/gi;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t${i++}`}>{formatBold(text.slice(last, m.index))}</span>);
    }
    const href = m[1];
    parts.push(
      <a
        key={`a${i++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 break-all"
      >
        {href}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={`t${i++}`}>{formatBold(text.slice(last))}</span>);
  }
  return parts.length ? parts : formatBold(text);
}

function formatBold(s: string): ReactNode {
  const segments = s.split(/\*\*(.+?)\*\*/g);
  if (segments.length === 1) return s;
  const out: ReactNode[] = [];
  segments.forEach((seg, idx) => {
    if (idx % 2 === 1) {
      out.push(
        <strong key={idx} className="font-semibold text-white">
          {seg}
        </strong>,
      );
    } else if (seg) {
      out.push(<span key={idx}>{seg}</span>);
    }
  });
  return out;
}

export function SiteAnalysisDialog({
  open,
  onOpenChange,
  address,
  projectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  projectName: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMarkdown(null);
    const addr = address.trim();
    if (!addr) {
      setError("Add a site address under Site Intelligence before running analysis.");
      return;
    }
    setLoading(true);
    void (async () => {
      const apiUrl =
        typeof window !== "undefined"
          ? new URL("/api/projects/site-analysis", window.location.origin).href
          : "/api/projects/site-analysis";

      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, projectName: projectName.trim() || undefined }),
        });

        const rawText = await res.text();
        let data: { markdown?: string; error?: string; detail?: string } = {};
        try {
          data = rawText ? (JSON.parse(rawText) as typeof data) : {};
        } catch {
          throw new Error(
            res.ok
              ? "Server returned non-JSON (try redeploying the latest build)."
              : `Request failed (${res.status}): ${rawText.slice(0, 200)}`,
          );
        }

        if (!res.ok) {
          throw new Error(data.error || data.detail || `Request failed (${res.status})`);
        }
        if (!data.markdown) throw new Error("No analysis returned.");
        setMarkdown(data.markdown);
      } catch (e) {
        let msg = e instanceof Error ? e.message : "Analysis failed.";
        const networkFailure =
          e instanceof TypeError ||
          msg === "Failed to fetch" ||
          msg === "Load failed" ||
          /network/i.test(msg);
        if (networkFailure) {
          msg =
            "Could not reach the site analysis API (network error). Redeploy the app so this route is live; set PERPLEXITY_API_KEY on the server environment; ensure the host allows outbound HTTPS to api.perplexity.ai.";
        }
        setError(msg);
        toast({ variant: "destructive", title: "Site analysis failed", description: msg });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, address, projectName]); // toast omitted on purpose

  const lines = markdown ? markdown.split("\n") : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="font-headline text-xl pr-8">Site analysis</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Research memo from Perplexity (web-assisted), including FEMA SFHA / flood-zone context and a link list
            for GIS, parcel, and maps. Confirm flood status with the effective FIRM, survey, and AHJ before design.
          </DialogDescription>
          {address.trim() ? (
            <p className="text-xs font-mono text-white/80 mt-2 break-words">{address.trim()}</p>
          ) : null}
        </DialogHeader>
        <div className="px-6 pb-2 shrink-0 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 mx-6 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-100/90 leading-snug">
            Not legal or engineering advice. Flood zones, setbacks, and utilities must be confirmed with official
            maps, survey, and 811.
          </p>
        </div>
        <ScrollArea className="flex-1 min-h-[200px] max-h-[min(65vh,560px)] px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm">Gathering assessor, GIS, zoning, and code references…</p>
            </div>
          ) : error ? (
            <p className="text-sm text-rose-400 py-6">{error}</p>
          ) : (
            <div className="space-y-1 pr-3">{lines.map((line, idx) => renderMarkdownishLine(line, `${idx}`))}</div>
          )}
        </ScrollArea>
        <div className="px-6 py-4 border-t border-border/50 shrink-0 flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
