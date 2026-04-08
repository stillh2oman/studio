"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ContractAgreementHtmlFrame } from "@planport/components/contracts/ContractAgreementHtmlFrame";
import { SignaturePad } from "@planport/components/contracts/SignaturePad";
import {
  getContractSignPayload,
  submitClientContractSignature,
  type ContractSignPayload,
} from "@/ai/flows/planport-contracts-flow";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { PlanportLogoMark } from "@planport/components/branding/BrandMarks";

const PDFViewer = dynamic(
  () =>
    import("@planport/components/blueprints/PDFViewer").then((mod) => ({
      default: mod.PDFViewer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(60vh,480px)] items-center justify-center rounded-md border border-border bg-card">
        <Loader2 className="h-10 w-10 animate-spin text-foreground" />
      </div>
    ),
  }
);

export function ContractSignPageClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ContractSignPayload | null>(null);
  const [signerName, setSignerName] = useState("");
  const [consent, setConsent] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await getContractSignPayload(token);
      if (cancelled) return;
      if ("error" in res) {
        setError(res.error);
        setPayload(null);
      } else {
        setPayload(res.payload);
        if (res.payload.status !== "awaiting_client") {
          setError(
            res.payload.status === "client_signed"
              ? "Your signature has already been recorded. The designer will countersign next."
              : res.payload.status === "completed"
                ? "This agreement is fully executed."
                : "This link is no longer active."
          );
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent || !sig || !signerName.trim()) return;
    setSubmitting(true);
    try {
      const res = await submitClientContractSignature({
        token,
        signerPrintName: signerName.trim(),
        signaturePngDataUrl: sig,
        consent: true,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="rounded-md border border-border bg-secondary p-1.5">
            <PlanportLogoMark className="h-11 w-11 sm:h-12 sm:w-12 object-contain" />
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal">PlanPort home</Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-3xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-foreground" />
            <p>Loading document…</p>
          </div>
        ) : error && !payload ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to open</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : done ? (
          <Card className="border-emerald-800/50 bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
                Signature received
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Thank you. Designer's Ink will add the lead designer&apos;s signature and file the executed agreement
                to your project hub.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            {payload && error && payload.status !== "awaiting_client" ? (
              <Alert className="mb-6">
                <AlertTitle>Status</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {payload && payload.status === "awaiting_client" ? (
              <div className="space-y-8">
                <div>
                  <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground">{payload.templateTitle}</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Please review the document below. The summary is pre-filled from your project record.
                  </p>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Agreement details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Client / party</p>
                      <p className="font-medium">{payload.clientDisplayName}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Agreement date</p>
                      <p className="font-medium">{payload.agreementDate}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Project / location</p>
                      <p className="font-medium">{payload.projectName}</p>
                      <p className="text-muted-foreground">{payload.projectLocation}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Lead designer</p>
                      <p className="font-medium">{payload.leadDesignerName}</p>
                    </div>
                  </CardContent>
                </Card>

                <div className="rounded-md border border-border bg-card overflow-hidden">
                  <div className="h-[min(55vh,520px)] min-h-[320px]">
                    {payload.templateKind === "html" && payload.bodyHtml ? (
                      <ContractAgreementHtmlFrame title={payload.templateTitle} html={payload.bodyHtml} className="h-full" />
                    ) : (
                      <PDFViewer
                        url={payload.pdfUrl}
                        title={payload.templateTitle}
                        version="CONTRACT"
                        allowDownload={false}
                        showPrintOrder={false}
                        showSubmitRevision={false}
                      />
                    )}
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Your electronic signature</CardTitle>
                    <CardDescription>
                      Type your full legal name and sign in the box. This constitutes your agreement to the terms of
                      the document above.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="signer">Full name</Label>
                        <Input
                          id="signer"
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                          placeholder="As it should appear on the agreement"
                          required
                          autoComplete="name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Signature</Label>
                        <SignaturePad width={360} height={120} onChange={setSig} />
                      </div>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="consent"
                          checked={consent}
                          onCheckedChange={(c) => setConsent(c === true)}
                          className="mt-1"
                        />
                        <Label htmlFor="consent" className="text-sm font-normal leading-snug cursor-pointer">
                          I have read this document and agree to be legally bound by its terms.
                        </Label>
                      </div>
                      {error && payload?.status === "awaiting_client" ? (
                        <p className="text-sm text-destructive">{error}</p>
                      ) : null}
                      <Button
                        type="submit"
                        className="w-full sm:w-auto bg-primary"
                        disabled={submitting || !consent || !sig || !signerName.trim()}
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Submit signature
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
