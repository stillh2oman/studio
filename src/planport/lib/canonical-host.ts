/** Canonical public hostname (no trailing dot, lowercase). */
export const CANONICAL_HOST_NAME = "studio-5055895818-5ccef.web.app";

/**
 * Hostnames that should 301 (middleware) to the canonical domain.
 * We only keep the old custom domain here so any stray links get upgraded.
 */
export const LEGACY_HOST_NAMES: string[] = ["planport.designersink.us"];
export const LEGACY_HOST_SET = new Set<string>(LEGACY_HOST_NAMES);
