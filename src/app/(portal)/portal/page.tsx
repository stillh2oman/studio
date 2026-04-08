"use client";

import { LoginCard } from "@planport/components/auth/LoginCard";
import { Header } from "@planport/components/layout/Header";
import { ShieldCheck, Zap, Cloud, CloudUpload, Lock, MessageSquareText } from "lucide-react";
import { SecureFileUploadDialog } from "@planport/components/layout/SecureFileUploadDialog";
import { Button } from "@/components/ui/button";
import { HeroShowcaseMark } from "@planport/components/branding/BrandMarks";
import Link from "next/link";

/**
 * Public client/contractor portal landing (merged PlanPort).
 * Staff command center remains at `/`; this route avoids a duplicate `/` page conflict.
 */
export default function PortalLandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="container mx-auto flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-8">
            <div className="space-y-6">
              <h1 className="text-5xl font-bold uppercase leading-tight tracking-wide text-foreground md:text-7xl">
                <span className="mb-2 block text-3xl tracking-wide text-foreground md:text-5xl">
                  Designer&apos;s Ink
                </span>
                <span className="block text-2xl font-bold md:text-4xl">
                  Secure Plan Hub for <span className="text-ledger-red">Field Operations</span>
                </span>
              </h1>
              <p className="max-w-xl text-sm uppercase leading-relaxed tracking-wide text-muted-foreground">
                The official portal for contractors and homeowners. Always build from the latest version,
                directly linked to Designer's Ink.
              </p>
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-card transition-colors duration-200 hover:border-muted-foreground/25">
              <HeroShowcaseMark className="absolute inset-0 h-full w-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90" />
              <div className="absolute bottom-4 left-4">
                <span className="rounded border border-ledger-yellow/40 bg-background/90 px-2 py-1 font-sans text-[10px] font-bold uppercase tracking-widest text-ledger-yellow">
                  Conceptual Showcase
                </span>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {[
                { icon: Cloud, title: "Designer Integrated", desc: "Direct link to Designer's Ink servers" },
                { icon: ShieldCheck, title: "Secure Viewing", desc: "Proprietary read-only PDF rendering" },
                { icon: Zap, title: "Revision Control", desc: "Latest versions always shown first" },
                { icon: Zap, title: "Official Prints", desc: "Order architectural prints for pickup" },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-md border border-border bg-card p-4 transition-colors duration-200 hover:border-muted-foreground/30"
                >
                  <div className="rounded-md border border-border bg-background p-2.5">
                    <feature.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">{feature.title}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="planport-surface-glass animate-in space-y-6 rounded-md border border-border p-8 fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex items-center gap-3">
                <div className="rounded-md border border-ledger-yellow/40 bg-background p-2.5">
                  <MessageSquareText className="h-6 w-6 text-ledger-yellow" />
                </div>
                <div>
                  <h3 className="text-xl font-bold uppercase tracking-wide text-foreground">
                    Need help or revisions?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Send an inquiry or transmit project markups securely to Jeff Dillon.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <SecureFileUploadDialog
                  trigger={
                    <Button className="h-12 flex-1 px-8 font-bold">
                      <CloudUpload className="mr-2 h-5 w-5" />
                      Transmit Files
                    </Button>
                  }
                />
                <Button
                  asChild
                  variant="outline"
                  className="h-12 flex-1 border-ledger-red/50 px-8 font-bold text-foreground hover:border-ledger-red hover:bg-secondary"
                >
                  <Link href="/contact">
                    <MessageSquareText className="mr-2 h-5 w-5" />
                    Contact Support
                  </Link>
                </Button>
              </div>

              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground opacity-70">
                <Lock className="h-3 w-3" /> All communications are encrypted directly to Designer's Ink management.
              </p>
            </div>
          </div>

          <div className="flex justify-center self-start lg:justify-end lg:pt-12">
            <LoginCard />
          </div>
        </div>
      </main>
    </div>
  );
}
