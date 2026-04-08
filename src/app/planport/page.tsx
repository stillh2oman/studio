
"use client"

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirestore, useAuth } from '@/firebase';
import { useUser } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, Loader2, ArrowRight, ShieldCheck, Building2, MapPin, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { PlanPortManagementTab } from '@/components/planport/planport-management-tab';
import { Client } from '@/lib/types';

/** Mirrors LoginView admin bypass; PlanPort admin iframe must work without a prior Ledger login. */
const PLANPORT_ADMIN_EMPLOYEE_ID = 'hE7guhWJu6gZm9dIQzHDkEBRmMr1';
const PLANPORT_ADMIN_EMAIL = 'jeff@designersink.us';
const PLANPORT_ADMIN_PASSWORD = 'Bonnie#274';

function PlanPortAdminContent() {
  const { user, authUser, isUserLoading } = useUser();
  const auth = useAuth();
  const autoSessionRef = useRef(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const { clients, contractors, projects } = useLedgerData(user?.id);

  useEffect(() => {
    if (user) return;
    if (isUserLoading) return;
    if (autoSessionRef.current) return;
    autoSessionRef.current = true;
    setBootstrapping(true);

    let cancelled = false;
    (async () => {
      localStorage.setItem('di_ledger_session_employee_id', PLANPORT_ADMIN_EMPLOYEE_ID);
      try {
        if (!authUser) {
          await signInWithEmailAndPassword(auth, PLANPORT_ADMIN_EMAIL, PLANPORT_ADMIN_PASSWORD);
        }
      } catch {
        /* Identity Toolkit off or wrong password: session id still allows employee doc load */
      } finally {
        if (!cancelled && typeof window !== 'undefined') {
          window.dispatchEvent(new Event('di-ledger-session'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isUserLoading, authUser, auth]);

  useEffect(() => {
    if (user) setBootstrapping(false);
  }, [user]);

  useEffect(() => {
    if (!bootstrapping || user) return;
    const t = window.setTimeout(() => setBootstrapping(false), 12000);
    return () => clearTimeout(t);
  }, [bootstrapping, user]);

  const adminAccounts: Client[] = [
    ...clients,
    ...contractors.map((c: any) => ({
      id: c.id,
      name: c.companyName || 'Unnamed Contractor',
      email: c.billingEmail || '',
      accessCode: c.accessCode || '',
      isContractor: true,
      contacts: c.contacts || [],
    })),
  ];

  if (isUserLoading || bootstrapping) {
    return <div className="min-h-screen bg-[#15191c] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#15191c] flex items-center justify-center p-6">
        <Card className="max-w-lg w-full border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-white">Admin access required</CardTitle>
            <CardDescription>Please log in to Designer&apos;s Ink to open PlanPort admin mode.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#15191c] p-6">
      <div className="max-w-[1400px] mx-auto">
        <PlanPortManagementTab clients={adminAccounts} projects={projects} />
      </div>
    </div>
  );
}

function PlanPortLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isAdminMode = searchParams.get('admin') === '1' || !!searchParams.get('firmId');

  const appLogoUrl = "/logo.png";

  if (isAdminMode) {
    return <PlanPortAdminContent />;
  }

  useEffect(() => {
    const urlCode = searchParams.get('code');
    if (urlCode) {
      setCode(urlCode.toUpperCase());
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsLoading(true);
    try {
      // Direct lookup via Global Portal Registry
      const portalRef = doc(firestore, 'portals', code.toUpperCase());
      const portalSnap = await getDoc(portalRef);

      if (portalSnap.exists()) {
        router.push(`/planport/${code.toUpperCase()}`);
      } else {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "Invalid access code. Please contact Designer's Ink."
        });
      }
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Connection Error", description: "Could not verify code via registry." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#15191c] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-3xl" />

      <Card className="max-w-md w-full border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl relative z-10">
        <CardHeader className="text-center py-10">
          <div className="h-20 w-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 p-2 overflow-hidden shadow-inner">
            <Image src={appLogoUrl} alt="Logo" width={60} height={60} className="object-contain" priority />
          </div>
          <CardTitle className="text-4xl font-headline font-bold text-white tracking-tight">PlanPort</CardTitle>
          <CardDescription className="text-xs uppercase tracking-[0.3em] font-medium text-muted-foreground mt-2">Secure Blueprint Access</CardDescription>
        </CardHeader>
        <CardContent className="pb-10 px-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-widest text-primary ml-1">Access Credentials</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  className="pl-12 h-14 bg-background border-border/50 text-xl font-mono font-bold tracking-[0.5em] text-center"
                  placeholder="CODE"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-14 bg-primary text-lg font-black shadow-xl shadow-primary/20 gap-2" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ArrowRight className="h-5 w-5" /> Open Vault</>}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="bg-muted/30 py-4 border-t border-border/50 justify-center">
          <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">Property of Designer's Ink • Professional Registry</p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function PlanPortPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#15191c] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPortLoginContent />
    </Suspense>
  );
}
