function env(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Single web client config for the unified app. Prefer `NEXT_PUBLIC_FIREBASE_*` in env;
 * fallbacks preserve older local setups until env is fully migrated.
 */
export const firebaseConfig = {
  apiKey:
    env("NEXT_PUBLIC_FIREBASE_API_KEY") ?? "AIzaSyAlTtA7hXTDXu-YMFWVZ53O2yG7DqpHPRw",
  authDomain:
    env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") ??
    "gen-lang-client-0442778807.firebaseapp.com",
  projectId:
    env("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ?? "gen-lang-client-0442778807",
  storageBucket:
    env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") ??
    "gen-lang-client-0442778807.appspot.com",
  messagingSenderId:
    env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") ?? "442778807",
  appId: env("NEXT_PUBLIC_FIREBASE_APP_ID") ?? "1:442778807:web:manual_entry",
};
