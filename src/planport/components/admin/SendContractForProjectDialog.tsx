"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/firebase/provider";
import { useToast } from "@/hooks/use-toast";
import { createContractForSignature, listContractTemplates } from "@/ai/flows/planport-contracts-flow";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type TemplateItem = {
  id: string;
  title: string;
  templateKind: "html" | "pdf_form";
};

export function SendContractForProjectDialog({
  clientId,
  projectId,
  clientLabel,
  projectName,
  triggerLabel = "Send agreement for signature",
  triggerClassName,
  variant = "default",
}: {
  clientId: string;
  projectId: string;
  clientLabel: string;
  projectName: string;
  triggerLabel?: string;
  triggerClassName?: string;
  variant?: "default" | "outline";
}) {
  const auth = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  /** Select dropdowns must portal inside the dialog or Radix stacks them behind the modal. */
  const [dialogContentEl, setDialogContentEl] = useState<HTMLDivElement | null>(null);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sendTemplateId, setSendTemplateId] = useState("");
  const [sendDate, setSendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sending, setSending] = useState(false);

  const loadTemplates = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoadingTemplates(true);
    try {
      const token = await user.getIdToken();
      const res = await listContractTemplates(token);
      if ("error" in res) {
        toast({ variant: "destructive", title: "Templates", description: res.error });
        return;
      }
      setTemplates(
        res.items.map((t) => ({
          id: t.id,
          title: t.title,
          templateKind: t.templateKind,
        }))
      );
    } finally {
      setLoadingTemplates(false);
    }
  }, [auth, toast]);

  useEffect(() => {
    if (!open) return;
    void loadTemplates();
    setSendTemplateId("");
    setSendDate(new Date().toISOString().slice(0, 10));
  }, [open, loadTemplates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !sendTemplateId) {
      toast({ variant: "destructive", title: "Choose a template" });
      return;
    }
    setSending(true);
    try {
      const token = await user.getIdToken();
      const res = await createContractForSignature(token, {
        templateId: sendTemplateId,
        clientId,
        projectId,
        agreementDate: sendDate,
      });
      if ("error" in res) {
        toast({ variant: "destructive", title: "Could not send", description: res.error });
        return;
      }
      toast({
        title: "Agreement sent to this project",
        description:
          "The client will see Review & sign on their hub. After they sign, countersign in Admin → Individual Clients → Contracts.",
      });
      setOpen(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDialogContentEl(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          className={cn("gap-2 shrink-0", triggerClassName)}
        >
          <Send className="w-4 h-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={(el) => setDialogContentEl(el)}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Send agreement for signature</DialogTitle>
          <DialogDescription>
            <span className="block">
              Project: <strong className="text-foreground">{projectName}</strong>
            </span>
            <span className="block mt-1">
              Client: <strong className="text-foreground">{clientLabel}</strong>
            </span>
            <span className="block mt-2 text-muted-foreground">
              The client sees this on their PlanPort hub (no email is sent). Built-in design agreements appear here even
              if you have not used Install in Admin → Contracts; choosing one saves the template automatically.
            </span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1">
            <Label>Template</Label>
            <Select value={sendTemplateId} onValueChange={setSendTemplateId} required disabled={loadingTemplates}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTemplates ? "Loading templates…" : "Choose template"} />
              </SelectTrigger>
              <SelectContent portalContainer={dialogContentEl ?? undefined}>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                    {t.templateKind === "html" ? " (HTML)" : " (PDF)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingTemplates && templates.length === 0 ? (
              <p className="text-xs text-muted-foreground">No templates yet—create them in the admin Contracts tab.</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label>Agreement date</Label>
            <Input type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={sending || !sendTemplateId || templates.length === 0} className="w-full sm:w-auto">
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Publish to client hub
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
