'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirestore, useAuth } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { signInWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { Loader2, Lock, User, AlertCircle, ShieldAlert, Upload, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

interface LoginViewProps {
  onLogin: (employeeId: string) => void;
  onRestore?: (data: any) => Promise<void>;
}

export function LoginView({ onLogin, onRestore }: LoginViewProps) {
  const [userInput, setUserInput] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<{ message: string; type: 'auth' | 'api' | 'data' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();

  const appLogoUrl = "/logo.png";

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput || !password) return;

    setIsLoading(true);
    setError(null);

    const inputTrimmed = userInput.trim().toLowerCase();
    const passTrimmed = password.trim();

    // NUCLEAR BYPASS: If these are the known Admin credentials, bypass Auth API immediately
    // to prevent "Identity Toolkit API" lockouts on live sites.
    if (inputTrimmed === 'jeff@designersink.us' && passTrimmed === 'Bonnie#274') {
      const adminId = 'hE7guhWJu6gZm9dIQzHDkEBRmMr1';
      console.log("[AUTH BYPASS] Admin credentials verified. Establishing session.");
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (anonErr) {
        console.warn('[AUTH BYPASS] Anonymous sign-in failed (enable Anonymous in Firebase Auth):', anonErr);
      }
      localStorage.setItem('di_ledger_session_employee_id', adminId);
      onLogin(adminId);
      return;
    }

    try {
      // 1. Resolve User Profile from Firestore first
      let resolvedEmail = '';
      let employeeId = '';
      let storedPassword = '';

      const q = query(collection(firestore, 'employees'), where('email', '==', inputTrimmed));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const docRes = snap.docs[0];
        const data = docRes.data();
        resolvedEmail = data.email;
        employeeId = docRes.id;
        storedPassword = data.password;
      }

      if (!resolvedEmail) {
        setError({ 
          message: "Account not found. Please verify your email. If the project is new, use the Bootstrap tool.", 
          type: 'data' 
        });
        setIsLoading(false);
        return;
      }

      // 2. Attempt Native Firebase Auth
      try {
        await signInWithEmailAndPassword(auth, resolvedEmail, passTrimmed);
        localStorage.setItem('di_ledger_session_employee_id', employeeId);
        onLogin(employeeId);
      } catch (authErr: any) {
        console.error("Auth System Error:", authErr);

        // 3. Fallback: Identity Toolkit API Disabled or other Native Auth failure
        // We check if the password matches the Firestore record as a backup.
        if (storedPassword && passTrimmed === storedPassword) {
          console.warn("[AUTH FALLBACK] Native Auth failed but Firestore credentials match. Establishing session.");
          try {
            if (!auth.currentUser) {
              await signInAnonymously(auth);
            }
          } catch (anonErr) {
            console.warn('[AUTH FALLBACK] Anonymous sign-in failed:', anonErr);
          }
          localStorage.setItem('di_ledger_session_employee_id', employeeId);
          onLogin(employeeId);
          return;
        }

        if (authErr.code?.includes('identity-toolkit-api-has-not-been-used')) {
          setError({ 
            message: "Native Authentication is disabled in your project settings. Please enable 'Identity Toolkit' in the GCP Console.", 
            type: 'api' 
          });
        } else {
          setError({ 
            message: "Invalid credentials. Please verify your password.", 
            type: 'auth' 
          });
        }
      }
    } catch (err: any) {
      setError({ message: "Connectivity Error: " + err.message, type: 'data' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyBootstrap = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onRestore) return;

    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        await onRestore(json);
      } catch (err) {
        setIsRestoring(false);
        toast({ variant: "destructive", title: "Bootstrap Failed", description: "Invalid snapshot file structure." });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-3xl animate-pulse delay-1000" />

      <Card className="max-w-md w-full border-border/50 shadow-2xl bg-card/50 backdrop-blur-xl relative z-10 overflow-hidden mb-8">
        <CardHeader className="space-y-4 text-center bg-muted/30 py-10">
          <div className="h-24 w-24 bg-white/5 rounded-3xl flex items-center justify-center mx-auto border border-white/10 shadow-inner rotate-3 p-2 overflow-hidden">
            <Image
              src={appLogoUrl}
              alt="Designer's Ink Logo"
              width={80}
              height={80}
              className="object-contain -rotate-3"
              priority
            />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-4xl font-headline font-bold text-white tracking-tight">Designer's Ink</CardTitle>
            <CardDescription className="text-xs uppercase tracking-[0.3em] font-medium text-muted-foreground">Ledger Command Login</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-8 pb-10 px-8">
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-200">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{error.type === 'api' ? 'Auth API Action Required' : 'Access Denied'}</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed space-y-2">
                  <p>{error.message}</p>
                  {error.type === 'api' && (
                    <Button variant="link" className="text-rose-200 p-0 h-auto text-xs font-bold underline" asChild>
                      <a href="https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview" target="_blank" rel="noopener noreferrer">
                        Open Google Cloud Console <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Email Address</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="username" 
                    type="email"
                    value={userInput} 
                    onChange={e => setUserInput(e.target.value)} 
                    placeholder="jeff@designersink.us" 
                    className="pl-10 h-12 bg-background/50"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="password" 
                    type="password"
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    className="pl-10 h-12 bg-background/50"
                    required
                  />
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Syncing...</>
              ) : (
                'Sign In to Ledger'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-md w-full border-dashed border-primary/30 bg-primary/5 backdrop-blur-sm">
        <CardContent className="py-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <ShieldAlert className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Emergency Bootstrap</h4>
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">System Recovery Mode</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            If login fails due to empty project data, upload your backup JSON to reconstruct the firm ledger instantly.
          </p>
          <Button 
            variant="outline" 
            className="w-full h-12 gap-2 border-primary/20 text-primary hover:bg-primary/10 font-bold"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRestoring}
          >
            {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isRestoring ? 'Reconstructing...' : 'Restore Point & Seed'}
          </Button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleEmergencyBootstrap} />
        </CardContent>
      </Card>
    </div>
  );
}
