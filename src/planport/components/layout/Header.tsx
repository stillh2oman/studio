
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser, useDoc, useFirestore, useMemoFirebase, useAuth } from "@planport/firebase";
import { doc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  DesignersInkBannerMark,
  PlanportLogoMark,
} from "@planport/components/branding/BrandMarks";
import { isPlanportAdminClient } from "@/lib/planport-admin-client";

/** ~50% larger than prior banner (h-12→h-16→h-20); PlanPort uses the same edge length so it matches banner height. */
const HEADER_BANNER_HEIGHT =
  "h-[4.5rem] w-auto sm:h-24 md:h-[7.5rem] lg:h-[7.5rem]";
/** PlanPort mark: 25% larger than prior match to banner height (×1.25 on each step). */
const HEADER_PLANPORT_FRAME =
  "h-[5.625rem] w-[5.625rem] sm:h-[7.5rem] sm:w-[7.5rem] md:h-[9.375rem] md:w-[9.375rem] lg:h-[9.375rem] lg:w-[9.375rem]";

/** Light strip at top only; body/footer stay on the dark Ledger theme. */
const HEADER_BAR = "bg-white border-b border-slate-200";
const HEADER_INK = "text-[#0c2340]";
const HEADER_INK_MUTED = "text-[#0c2340]/70";

function isPortalHubPath(pathname: string): boolean {
  if (pathname.startsWith("/dashboard/client/")) {
    return true;
  }
  if (!pathname.startsWith("/dashboard/")) {
    return false;
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard" || parts.length < 2) {
    return false;
  }
  if (parts[1] === "client") {
    return false;
  }
  return true;
}

export function Header({
  userName,
  /** When an admin opens a client/GC hub, pass context here so the header shows your account, not the hub subject. */
  adminHubContext,
}: {
  userName?: string;
  adminHubContext?: string;
}) {
  const { user } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const pathname = usePathname();
  const showPortalHubNotifySettings = Boolean(user && pathname && isPortalHubPath(pathname));
  
  const adminRoleRef = useMemoFirebase(() => user ? doc(db, "adminRoles", user.uid) : null, [db, user]);
  const { data: adminRole } = useDoc(adminRoleRef);
  
  const isAdmin = isPlanportAdminClient(user, adminRole);

  const showAdminHubSession = isAdmin && !!adminHubContext?.trim();
  const primaryLabel = showAdminHubSession
    ? (user?.email ?? "Designer admin")
    : userName;
  const secondaryLabel = showAdminHubSession
    ? adminHubContext!.trim()
    : userName
      ? "Authorized"
      : undefined;
  const showSessionRow = !!(primaryLabel || showAdminHubSession);

  const handleLogoClick = (e: React.MouseEvent) => {
    if (isAdmin) {
      e.preventDefault();
      router.push("/admin");
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    router.push("/portal");
  };

  return (
    <header className={`sticky top-0 z-50 w-full ${HEADER_BAR}`}>
      <div className="max-w-7xl mx-auto flex items-center gap-3 sm:gap-5 px-4 py-3 sm:px-6 sm:py-4">
        <div className="shrink-0">
          <Link
            href={isAdmin ? "/admin" : "/portal"}
            onClick={handleLogoClick}
            className="flex items-center gap-2 rounded-md p-1 -m-1 transition-colors duration-200 hover:bg-slate-100"
          >
            <div className={`relative ${HEADER_PLANPORT_FRAME} p-1 shadow-none`}>
              <PlanportLogoMark className="h-full w-full object-contain" />
            </div>
          </Link>
        </div>

        <div className="min-w-0 flex-1 flex justify-center px-1">
          <div className="px-3 py-2 sm:px-4 sm:py-2 max-w-full shadow-none">
            <DesignersInkBannerMark
              className={`${HEADER_BANNER_HEIGHT} max-w-[min(100%,780px)] mx-auto object-contain object-center`}
            />
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 sm:gap-4">
          {showPortalHubNotifySettings && (
            <Link href="/settings/notifications">
              <Button
                type="button"
                variant="ghost"
                className={`flex items-center gap-2 ${HEADER_INK} border border-slate-300 hover:bg-slate-100 hover:text-[#0c2340]`}
              >
                <Bell className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Alerts</span>
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin">
              <Button
                variant="ghost"
                className={`flex items-center gap-2 ${HEADER_INK} border border-slate-300 hover:bg-slate-100 hover:text-[#0c2340]`}
              >
                <ShieldCheck className={`w-4 h-4 ${HEADER_INK}`} />
                Admin Portal
              </Button>
            </Link>
          )}
          {showSessionRow ? (
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end min-w-0 max-w-[min(42vw,280px)] sm:max-w-[280px]">
                <span className={`text-sm font-semibold ${HEADER_INK}`}>{primaryLabel}</span>
                {secondaryLabel != null && secondaryLabel !== "" && (
                  showAdminHubSession ? (
                    <span
                      className={`text-[11px] ${HEADER_INK_MUTED} font-medium max-w-[280px] text-right leading-tight`}
                    >
                      {secondaryLabel}
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] ${HEADER_INK_MUTED} uppercase font-bold tracking-widest`}
                    >
                      {secondaryLabel}
                    </span>
                  )
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`${HEADER_INK} hover:bg-slate-100 hover:text-[#0c2340]`}
                onClick={() => void handleSignOut()}
                aria-label="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          ) : (
            <Link href="/contact">
              <Button
                variant="outline"
                className={`border-[#0c2340] bg-transparent ${HEADER_INK} hover:bg-slate-100 transition-colors duration-200`}
              >
                Contact Designer's Ink
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
