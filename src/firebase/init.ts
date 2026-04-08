'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Returns the initialized SDK instances for a given Firebase App.
 */
export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp)
  };
}

/**
 * Initializes the Firebase Client SDK.
 * This is designed to work both in local development and with Firebase App Hosting.
 */
export function initializeFirebase() {
  // Ensure we are on the client
  if (typeof window === 'undefined') {
    return { firebaseApp: null as any, auth: null as any, firestore: null as any };
  }

  if (!getApps().length) {
    let firebaseApp;
    try {
      // Attempt to initialize via environment variables provided by App Hosting
      firebaseApp = initializeApp();
    } catch (e) {
      // Fallback to local config object if automatic initialization fails
      firebaseApp = initializeApp(firebaseConfig);
    }

    return getSdks(firebaseApp);
  }

  // Return existing SDKs if already initialized
  return getSdks(getApp());
}
