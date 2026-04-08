'use client';

/**
 * This component usually handles client-side redirects.
 * We are neutralizing it to stop the "Backend Not Found" loop.
 */
export function CanonicalHostRedirect() {
  return null; // Renders nothing, does nothing.
}