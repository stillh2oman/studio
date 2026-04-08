
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, Check } from "lucide-react";
import { sendBlueprintNotification } from "@/ai/flows/send-blueprint-notification";
import { useToast } from "@/hooks/use-toast";

interface NotifyBuilderButtonProps {
  /** Shown in email copy (“contact for …”). */
  hubDisplayName: string;
  projectName: string;
  blueprintName: string;
  versionNumber: number;
  recipientEmails: string[];
  /** Button label: builder vs client portal */
  variant?: "builder" | "client";
}

export function NotifyBuilderButton({ 
  hubDisplayName, 
  projectName, 
  blueprintName, 
  versionNumber, 
  recipientEmails,
  variant = "builder",
}: NotifyBuilderButtonProps) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const label = variant === "client" ? "Notify client" : "Notify builder";

  const handleNotify = async () => {
    if (recipientEmails.length === 0) {
      toast({
        variant: "destructive",
        title: "No email on file",
        description:
          variant === "client"
            ? "Add an email to this client profile (or an additional contact)."
            : "Add contractor contacts with email and/or ensure the linked client has an email.",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await sendBlueprintNotification({
        hubDisplayName,
        projectName,
        blueprintName,
        versionNumber,
        recipientEmails,
      });

      if (result.success) {
        toast({
          title: "Notification sent",
          description: result.message,
        });
        setSent(true);
        setTimeout(() => setSent(false), 3000);
      } else {
        throw new Error(result.message);
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Notification failed",
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      className="h-7 px-2 text-[10px] font-bold uppercase tracking-wide text-ledger-yellow hover:bg-secondary hover:text-ledger-yellow"
      onClick={(e) => {
        e.stopPropagation();
        handleNotify();
      }}
      disabled={loading}
      title={`Send blueprint notification email (${recipientEmails.length} recipient(s))`}
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin mr-1" />
      ) : sent ? (
        <Check className="w-3 h-3 mr-1" />
      ) : (
        <Bell className="w-3 h-3 mr-1" />
      )}
      {label}
    </Button>
  );
}
