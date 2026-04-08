"use client";

/**
 * Brand images live under `public/branding/` so they work in App Hosting + custom domains.
 *
 * To change logos: replace the PNG files in `public/branding/` (same filenames).
 */
export const PLANPORT_LOGO_SRC = "/branding/planport-logo.png";
export const DESIGNERS_INK_BANNER_SRC = "/branding/designers-ink-banner.png";
/** Designer's Ink wide banner for hub body (project picker card, empty states). Header strip uses {@link DESIGNERS_INK_BANNER_SRC}. */
export const DESIGNERS_INK_BODY_BANNER_SRC = "/branding/designers-ink-body-banner.png";

import { dropboxImgSrc } from "@/lib/dropbox-utils";
import { cn } from "@/lib/utils";

const LOGO_W = 1024;
const LOGO_H = 1024;
const BANNER_W = 1024;
const BANNER_H = 485;

const PLANPORT_LOGO_ALT =
  "PlanPort Client Portal logo featuring a cartoon designer holding a tablet with a blueprint, surrounded by construction tools and a city skyline.";

const DESIGNERS_INK_BODY_BANNER_ALT =
  "Designer's Ink — Graphic & Building Designs, LLC — architectural logo banner with diamond mark and serif typography on a dark teal background.";

export function PlanportLogoMark({ className }: { className?: string }) {
  return (
    <img
      src={PLANPORT_LOGO_SRC}
      alt={PLANPORT_LOGO_ALT}
      className={className}
      width={LOGO_W}
      height={LOGO_H}
      decoding="async"
      fetchPriority="high"
    />
  );
}

export function DesignersInkBannerMark({ className }: { className?: string }) {
  return (
    <img
      src={DESIGNERS_INK_BANNER_SRC}
      alt="Designer's Ink — Graphic & Building Designs, LLC"
      className={className}
      width={BANNER_W}
      height={BANNER_H}
      decoding="async"
      fetchPriority="high"
    />
  );
}

/** Designer's Ink wide banner for dashboard body (project picker, empty renderings). Header still uses {@link PlanportLogoMark} + {@link DesignersInkBannerMark}. */
export function DesignersInkBodyBannerMark({ className }: { className?: string }) {
  return (
    <img
      src={DESIGNERS_INK_BODY_BANNER_SRC}
      alt={DESIGNERS_INK_BODY_BANNER_ALT}
      className={className}
      width={BANNER_W}
      height={BANNER_H}
      decoding="async"
    />
  );
}

export function HeroShowcaseMark({ className }: { className?: string }) {
  return (
    <img
      src={DESIGNERS_INK_BANNER_SRC}
      alt="Designer's Ink design showcase"
      className={cn("h-full w-full object-cover object-center", className)}
      width={BANNER_W}
      height={BANNER_H}
      decoding="async"
    />
  );
}

export function ProjectCoverImage({
  renderingUrl,
  name,
  className,
}: {
  renderingUrl?: string | null;
  name: string;
  className?: string;
}) {
  const hasDropbox = Boolean(renderingUrl?.trim());
  const primarySrc = hasDropbox ? dropboxImgSrc(renderingUrl!) : DESIGNERS_INK_BANNER_SRC;
  return (
    <img
      src={primarySrc}
      alt={hasDropbox ? `${name} project rendering` : `${name} — Designer's Ink`}
      className={className}
      width={BANNER_W}
      height={BANNER_H}
      decoding="async"
      onError={(e) => {
        const el = e.currentTarget;
        if (!hasDropbox || el.dataset.fallback === "1") return;
        el.dataset.fallback = "1";
        el.src = DESIGNERS_INK_BANNER_SRC;
      }}
    />
  );
}

export function DropboxRenderingImage({
  url,
  name,
  className,
  loading,
}: {
  url: string;
  name: string;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  return (
    <img
      src={dropboxImgSrc(url)}
      alt={name}
      className={className}
      width={BANNER_W}
      height={BANNER_H}
      decoding="async"
      loading={loading}
      onError={(e) => {
        const el = e.currentTarget;
        if (el.dataset.fallback === "1") return;
        el.dataset.fallback = "1";
        el.src = DESIGNERS_INK_BANNER_SRC;
      }}
    />
  );
}

export function ContractorHubLogo({
  logoUrl,
  name,
  className,
}: {
  logoUrl?: string | null;
  name: string;
  className?: string;
}) {
  const hasUrl = Boolean(logoUrl?.trim());
  if (!hasUrl) {
    return (
      <PlanportLogoMark
        className={cn("max-w-full max-h-full object-contain p-2", className)}
      />
    );
  }
  return (
    <img
      src={dropboxImgSrc(logoUrl!)}
      alt={name}
      className={cn("max-w-full max-h-full object-contain p-2", className)}
      width={LOGO_W}
      height={LOGO_H}
      decoding="async"
      onError={(e) => {
        const el = e.currentTarget;
        if (el.dataset.fallback === "1") return;
        el.dataset.fallback = "1";
        el.src = PLANPORT_LOGO_SRC;
        el.alt = "PlanPort";
      }}
    />
  );
}
