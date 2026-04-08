"use client";

import { cn } from "@/lib/utils";
import { AddBlueprintDialog } from "@planport/components/blueprints/AddBlueprintDialog";
import { AddRenderingDialog } from "@planport/components/admin/AddRenderingDialog";
import { AddChiefArchitectFileDialog } from "@planport/components/admin/AddChiefArchitectFileDialog";

export type AdminProjectHubType = "gc" | "client";

export interface AdminProjectUploadToolbarProps {
  hubType: AdminProjectHubType;
  hubId: string;
  projectId: string;
  hubName: string;
  projectName: string;
  /** GC contractor contacts (emails). */
  contacts?: { email?: string | null }[];
  /** Extra notify recipients (e.g. linked client emails on GC hubs). */
  notifyRecipientEmails?: string[];
  /** Vertical full-width buttons (sidebar) vs wrapped row (under tabs). */
  variant?: "stack" | "wrap";
  className?: string;
}

/**
 * Dropbox-link registration for blueprints (latest + archive), renderings, and Chief/project files.
 * Shown only when the signed-in user is a PlanPort designer admin (caller must gate).
 */
export function AdminProjectUploadToolbar({
  hubType,
  hubId,
  projectId,
  hubName,
  projectName,
  contacts = [],
  notifyRecipientEmails = [],
  variant = "stack",
  className,
}: AdminProjectUploadToolbarProps) {
  const row = variant === "stack" ? "flex flex-col gap-2" : "flex flex-wrap gap-2";
  const triggerClassName = variant === "stack" ? "w-full justify-start h-11 font-semibold" : undefined;

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/30 bg-primary/5 p-3 shadow-sm",
        className
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
        Designer uploads (Dropbox links)
      </p>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
        Link shared Dropbox URLs to this project. Use a separate button for each type.
      </p>
      <div className={row}>
        <AddBlueprintDialog
          hubId={hubId}
          hubType={hubType}
          projectId={projectId}
          hubName={hubName}
          projectName={projectName}
          contacts={contacts}
          notifyRecipientEmails={notifyRecipientEmails}
          initialStatus="latest"
          triggerClassName={triggerClassName}
        />
        <AddBlueprintDialog
          hubId={hubId}
          hubType={hubType}
          projectId={projectId}
          hubName={hubName}
          projectName={projectName}
          contacts={contacts}
          notifyRecipientEmails={notifyRecipientEmails}
          initialStatus="archived"
          triggerClassName={triggerClassName}
        />
        <AddRenderingDialog
          hubId={hubId}
          hubType={hubType}
          projectId={projectId}
          triggerClassName={triggerClassName}
        />
        <AddChiefArchitectFileDialog
          hubId={hubId}
          hubType={hubType}
          projectId={projectId}
          triggerClassName={triggerClassName}
        />
      </div>
    </div>
  );
}
