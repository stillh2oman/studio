'use client';

import { useFirebase } from '@/firebase/provider';

/**
 * Hook to access the current authenticated user and their employee profile.
 * Standardized to return the "employee" as the primary user object for dashboard logic.
 */
export function useUser() {
  const { user, employee, isUserLoading } = useFirebase();
  
  return { 
    user: employee || null, // Return the Employee doc as 'user' to maintain app compatibility
    authUser: user, // The raw Firebase User
    isUserLoading 
  };
}
