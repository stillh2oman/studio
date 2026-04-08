"use client";

import { useCallback } from "react";
import { useUser } from "@planport/firebase";
import { isDropboxUrl } from "@/lib/dropbox-utils";
import { resolveDropboxImageForSave } from "@/lib/client-resolve-dropbox-image";

/**
 * When saving a Dropbox image URL from the admin UI, mirror it to Firebase Storage first.
 */
export function useMirrorDropboxImageUrl() {
  const { user } = useUser();

  return useCallback(
    async (rawUrl: string): Promise<string> => {
      const t = rawUrl.trim();
      if (!t || !isDropboxUrl(t)) return t;
      if (!user) {
        throw new Error(
          "You must be signed in with your admin account to save Dropbox image links."
        );
      }
      return resolveDropboxImageForSave(t, () => user.getIdToken());
    },
    [user]
  );
}
