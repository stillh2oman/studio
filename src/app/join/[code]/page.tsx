
"use client"

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, ArrowRight, AlertCircle, Building2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function JoinRedirectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const firestore = useFirestore();
  const [error, setError] = useState<string | null>(null);

  const appLogoUrl = "/logo.png";

  useEffect(() => {
    if (!code) return;

    const resolveCode = async () => {
      try {
        const shortLinkRef = doc(firestore, 'firm_shortlinks', code.toLowerCase());
        const snap = await getDoc(shortLinkRef);

        if (snap.exists()) {
          const data = snap.data();
          // Redirect to the login/join page with the resolved bossId
          router.push(`/?bossId=${data.ownerId}`);
        } else {
          setError(`Shortcode "${code}" not found. Contact your firm administrator.`);
        }
      } catch (err) {
        console.error(err);
        setError("Network error resolving shortlink. Please try again.");
      }
    };

    resolveCode();
  }, [code, firestore, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-rose-500/20 bg-rose-500/5 shadow-2xl">
          <CardHeader className="text-center">
            <div className="h-16 w-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
              <AlertCircle className="h-8 w-8 text-rose-500" />
            </div>
            <CardTitle className="text-2xl font-headline font-bold text-white">Invalid Link</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {error}
            </p>
            <Button onClick={() => router.push('/')} variant="outline" className="w-full h-12 gap-2">
              Return to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-8 animate-in fade-in duration-1000">
      <div className="relative">
        <div className="h-28 w-24 bg-white/5 rounded-3xl flex items-center justify-center mx-auto border-2 border-white/10 animate-pulse p-2 overflow-hidden">
          <Image
            src={appLogoUrl}
            alt="Designer's Ink Logo"
            width={80}
            height={80}
            className="object-contain"
            priority
          />
        </div>
        <div className="absolute -bottom-2 -right-2 bg-accent text-accent-foreground rounded-full p-2 border-4 border-background shadow-xl">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
      
      <div className="space-y-2">
        <h1 className="text-3xl font-headline font-bold text-white tracking-tight">Resolving Access Link</h1>
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs uppercase tracking-widest font-black text-muted-foreground">Firm ID:</span>
          <code className="text-xs bg-muted px-2 py-1 rounded text-accent font-bold">/join/{code}</code>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium animate-pulse">Connecting to firm ledger...</p>
      </div>
    </div>
  );
}
