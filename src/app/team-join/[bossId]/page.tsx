
"use client"

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function TeamJoinPage({ params }: { params: Promise<{ bossId: string }> }) {
  const { bossId } = use(params);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  
  const [status, setStatus] = useState<'loading' | 'confirming' | 'joining' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setStatus('error');
      return;
    }
    setStatus('confirming');
  }, [user, isUserLoading]);

  const handleJoin = async () => {
    if (!user || !bossId) return;
    setStatus('joining');
    try {
      // Use correct path based on security rules subcollection matching /employees/{bossId}/collaborators
      const collabRef = doc(firestore, 'employees', bossId, 'collaborators', user.uid);
      
      // Add as a basic employee with no permissions initially
      await setDoc(collabRef, {
        id: user.uid,
        email: user.email || 'Anonymous',
        name: user.displayName || 'Anonymous Designer',
        role: 'Employee',
        joinedAt: new Date().toISOString(),
        permissions: {
          billable: 'none',
          printing: 'none',
          tasks: 'none',
          plans: 'none',
          templates: 'none',
          ai_prompts: 'none',
          profitability: 'none',
          status: 'none',
          notes: 'none',
          projects_db: 'none',
          clients: 'none',
          archive: 'none',
          reports: 'none',
          calculator: 'read',
          supplies: 'write'
        }
      });

      setStatus('success');
      toast({
        title: "Successfully Joined Team",
        description: "Your access is now pending approval from the ledger owner.",
      });
      
      // Redirect to the boss's ledger
      setTimeout(() => {
        router.push(`/?bossId=${bossId}`);
      }, 2000);
    } catch (e) {
      console.error(e);
      setStatus('error');
      toast({
        variant: "destructive",
        title: "Join Failed",
        description: "Could not register you as a collaborator.",
      });
    }
  };

  if (status === 'loading' || isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full border-border/50 shadow-2xl overflow-hidden">
        <CardHeader className="text-center bg-muted/50 py-8">
          <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-headline font-bold">Join Designer's Ink Team</CardTitle>
          <CardDescription>
            You have been invited to collaborate on a design ledger.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-10 text-center space-y-6">
          {status === 'confirming' && (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                By joining, you will be able to access the Command Center associated with ID: <br/>
                <code className="text-[10px] bg-muted px-2 py-1 rounded mt-2 inline-block font-mono">{bossId}</code>
              </p>
              <Button onClick={handleJoin} className="w-full h-12 gap-2 text-lg font-bold">
                Accept Invitation & Join Team
              </Button>
            </>
          )}

          {status === 'joining' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm font-medium">Registering your access...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4 text-emerald-500 animate-in zoom-in duration-300">
              <CheckCircle2 className="h-16 w-16" />
              <h3 className="text-xl font-bold">Welcome to the Team!</h3>
              <p className="text-sm text-muted-foreground">Redirecting you to the ledger...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4 text-rose-500 animate-in shake duration-300">
              <AlertCircle className="h-16 w-16" />
              <h3 className="text-xl font-bold">Invalid or Expired Link</h3>
              <p className="text-sm text-muted-foreground">The invitation link you used is invalid or you do not have permission to join.</p>
              <Button variant="outline" onClick={() => router.push('/')} className="w-full">Return Home</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
