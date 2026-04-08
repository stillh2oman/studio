
'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect, useCallback } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { Employee } from '@/lib/types';

// Combined state for the Firebase context
export interface FirebaseContextState {
  areServicesAvailable: boolean;
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: null | Auth;
  user: User | null; // The native Auth user
  employee: Employee | null; // The associated Employee profile
  isUserLoading: boolean;
}

export interface FirebaseServicesAndUser {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  user: User | null;
  employee: Employee | null;
  isUserLoading: boolean;
}

export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages native Firebase Auth and Firestore profile synchronization.
 */
export const FirebaseProvider: React.FC<{
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}> = ({
  children,
  firebaseApp,
  firestore,
  auth,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [sessionRevision, setSessionRevision] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bump = () => setSessionRevision((r) => r + 1);
    window.addEventListener('di-ledger-session', bump as EventListener);
    return () => window.removeEventListener('di-ledger-session', bump as EventListener);
  }, []);

  // 1. Listen to Native Auth State
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
    });

    return () => unsubAuth();
  }, [auth]);

  // 1b. Ledger session (localStorage) without Firebase user — Storage/Firestore rules require request.auth.
  // Password bypass / Firestore-only login leaves auth null until we attach an anonymous credential.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sid = localStorage.getItem('di_ledger_session_employee_id');
    if (!sid) return;
    if (auth.currentUser) return;
    let cancelled = false;
    void (async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        if (!cancelled) {
          console.warn(
            '[FirebaseProvider] Anonymous sign-in failed — enable Anonymous in Firebase Auth for timesheet PDF uploads, or use email/password sign-in.',
            e,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, user, sessionRevision]);

  // 2. STABILIZED PRESENCE HEARTBEAT (1 MINUTE POLL)
  const empId = employee?.id;
  
  const updatePresence = useCallback((online: boolean) => {
    if (!empId || !firestore) return;
    const docRef = doc(firestore, 'employees', empId);
    
    // We update every minute to confirm the session is still active
    updateDoc(docRef, { 
      isOnline: online,
      lastSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }).catch(() => {});
  }, [empId, firestore]);

  useEffect(() => {
    if (!empId) return;

    // Set online immediately on mount
    updatePresence(true);

    // Heartbeat every 60 seconds
    const interval = setInterval(() => updatePresence(true), 60000);

    return () => {
      clearInterval(interval);
    };
  }, [empId, updatePresence]);

  // 3. Sync Profile / Fallback to Session ID & Seeding
  useEffect(() => {
    const sessionEmployeeId = typeof window !== 'undefined' ? localStorage.getItem('di_ledger_session_employee_id') : null;
    const targetId = sessionEmployeeId || user?.uid;

    if (!targetId) {
      setIsUserLoading(false);
      setEmployee(null);
      return;
    }

    const unsubDoc = onSnapshot(doc(firestore, 'employees', targetId), 
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setEmployee({ ...data, id: snap.id } as Employee);
          setIsUserLoading(false);
        } else {
          // SELF-HEALING: Seed Admin record if missing
          const jeffEmail = 'jeff@designersink.us';
          const jeffId = 'hE7guhWJu6gZm9dIQzHDkEBRmMr1';
          
          if (targetId === jeffId) {
            const adminProfile: any = {
              id: jeffId,
              firstName: 'Jeff',
              lastName: 'Dillon',
              email: jeffEmail,
              role: 'Administrator',
              permissions: {
                billable: 'write', printing: 'write', tasks: 'write', plans: 'write',
                templates: 'write', ai_prompts: 'write', profitability: 'write',
                status: 'write', notes: 'write', projects_db: 'write', clients: 'write',
                archive: 'write', reports: 'write', calculator: 'write', timesheets: 'write',
                supplies: 'write'
              },
              isOnline: true
            };
            setDoc(doc(firestore, 'employees', jeffId), adminProfile, { merge: true });
          }
          setIsUserLoading(false);
        }
      },
      () => setIsUserLoading(false)
    );

    return () => unsubDoc();
  }, [firestore, user?.uid, sessionRevision]);

  const contextValue = useMemo((): FirebaseContextState => {
    return {
      areServicesAvailable: !!(firebaseApp && firestore && auth),
      firebaseApp,
      firestore,
      auth,
      user,
      employee,
      isUserLoading,
    };
  }, [firebaseApp, firestore, auth, user, employee, isUserLoading]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);
  if (!context || !context.firebaseApp || !context.firestore || !context.auth) {
    throw new Error('Firebase core services not available.');
  }
  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    user: context.user,
    employee: context.employee,
    isUserLoading: context.isUserLoading,
  };
};

export const useFirestore = (): Firestore => useFirebase().firestore;
export const useAuth = (): Auth => useFirebase().auth;
export const useFirebaseApp = (): FirebaseApp => useFirebase().firebaseApp;

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T {
  return useMemo(factory, deps);
}
