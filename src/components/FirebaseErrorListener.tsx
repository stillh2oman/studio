'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * A silent listener that handles Firestore permission errors gracefully.
 * Logs structured error details to the console for debugging while preventing 
 * Next.js from displaying a full-screen error overlay.
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      // Log structured data to console. 
      // Using JSON.stringify ensures the object isn't logged as "{}" in some browsers.
      console.warn(
        "Firestore Security Rule Denied Request (Handled):", 
        JSON.stringify(error.request, null, 2)
      );
      
      // CRITICAL: We do not throw or alert here to prevent visual interruptions.
    };

    errorEmitter.on('permission-error', handleError);
    return () => errorEmitter.off('permission-error', handleError);
  }, []);

  return null;
}
