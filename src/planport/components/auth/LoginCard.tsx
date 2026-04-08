
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, User, Loader2 } from "lucide-react";
import { useAuth, useFirestore } from "@planport/firebase";
import { useDirectoryStore } from "@/firebase/use-directory-store";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, where, limit, getDocs } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { PlanportLogoMark } from "@planport/components/branding/BrandMarks";
import { isPlanportStaffEmail } from "@/lib/planport-admin-client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isEmailLogin, setIsEmailLogin] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const db = useFirestore();
  const { directoryDb, contractorsCollection, clientsCollection } = useDirectoryStore();
  const { toast } = useToast();

  useEffect(() => {
    setIsHydrated(true);
    const codeParam = searchParams.get('code');
    if (codeParam) {
      setCode(codeParam.toUpperCase());
    }
  }, [searchParams]);

  const handleGCLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    setIsLoading(true);
    
    try {
      const inputCode = code.trim().toUpperCase();
      if (!inputCode) {
        throw new Error("Please enter an access code.");
      }
      
      // Parallelize lookups for better response time
      const [gcSnapshot, clientSnapshot] = await Promise.all([
        getDocs(
          query(
            collection(directoryDb, contractorsCollection),
            where("accessCode", "==", inputCode),
            limit(1)
          )
        ),
        getDocs(
          query(
            collection(directoryDb, clientsCollection),
            where("accessCode", "==", inputCode),
            limit(1)
          )
        )
      ]);

      if (!gcSnapshot.empty) {
        if (!auth.currentUser) await signInAnonymously(auth);
        router.push(`/dashboard/${gcSnapshot.docs[0].id}`);
        return;
      }

      if (!clientSnapshot.empty) {
        if (!auth.currentUser) await signInAnonymously(auth);
        router.push(`/dashboard/client/${clientSnapshot.docs[0].id}`);
        return;
      }

      toast({ variant: "destructive", title: "Invalid Access Code", description: "No matching project folder found." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Connection Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "adminRoles", userCredential.user.uid), {
          id: userCredential.user.uid,
          email: userCredential.user.email,
          name: email.split('@')[0],
          role: "Boss"
        });
        router.push("/admin");
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const adminDoc = await getDoc(doc(db, "adminRoles", userCredential.user.uid));
        const isAuthorizedAdmin = isPlanportStaffEmail(userCredential.user.email);
        
        if (isAuthorizedAdmin && !adminDoc.exists()) {
          await setDoc(doc(db, "adminRoles", userCredential.user.uid), {
            id: userCredential.user.uid,
            email: userCredential.user.email,
            name: userCredential.user.email?.split('@')[0] || "Administrator",
            role: "Boss"
          });
        }
        router.push(adminDoc.exists() || isAuthorizedAdmin ? "/admin" : "/portal");
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Auth Failed", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isHydrated) return null;

  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="text-center space-y-4">
        <div className="mx-auto w-44 h-44 sm:w-48 sm:h-48 relative flex items-center justify-center rounded-md border border-border bg-background p-3">
          <PlanportLogoMark className="h-full w-full max-h-full max-w-full object-contain" />
        </div>
        <div>
          <CardTitle className="text-3xl font-semibold text-foreground">PlanPort</CardTitle>
          <CardDescription className="text-muted-foreground font-semibold mt-1">
            Secure Blueprint Hub
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {isEmailLogin ? (
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input type="email" placeholder="Admin Email" className="pl-10 h-12" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder="Password" className="pl-10 h-12" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
            <Button className="w-full h-12 text-lg" disabled={isLoading}>
              {isLoading ? "Authenticating..." : (isSignUp ? "Register Admin" : "Admin Login")}
            </Button>
            <div className="flex flex-col gap-2 pt-2">
              <Button type="button" variant="ghost" className="w-full text-xs text-muted-foreground" onClick={() => setIsSignUp(!isSignUp)}>
                {isSignUp ? "Already have an account? Login" : "First time? Create Admin Account"}
              </Button>
              <Button type="button" variant="link" className="w-full text-xs text-muted-foreground" onClick={() => setIsEmailLogin(false)}>
                Back to Hub Access
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleGCLogin} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Access Code" className="pl-10 h-12 text-lg uppercase" value={code} onChange={(e) => setCode(e.target.value)} required />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading}>
              {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : "Access Blueprints"}
            </Button>
            <Button type="button" variant="link" className="w-full text-xs text-muted-foreground" onClick={() => setIsEmailLogin(true)}>
              Administrator Portal
            </Button>
            <p className="text-[10px] text-center text-muted-foreground mt-4 leading-relaxed">
              Proprietary System of Designer's Ink. Authorized use only.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function LoginCard() {
  return (
    <Suspense fallback={<Card className="w-full max-w-md h-96 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></Card>}>
      <LoginForm />
    </Suspense>
  );
}
