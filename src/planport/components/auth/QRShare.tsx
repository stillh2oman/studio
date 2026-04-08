
"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Share2, Copy, Check, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QRShareProps {
  gcName: string;
  accessCode: string;
}

export function QRShare({ gcName, accessCode }: QRShareProps) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const getShareUrl = () => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/?code=${accessCode}`;
  };

  useEffect(() => {
    if (!accessCode?.trim()) {
      setQrDataUrl(null);
      return;
    }
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/?code=${accessCode}`;
    let cancelled = false;
    setQrDataUrl(null);
    QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessCode]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(accessCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
    toast({
      title: "Code Copied",
      description: "Access code copied to clipboard."
    });
  };

  const handleCopyLink = () => {
    const url = getShareUrl();
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    toast({
      title: "Link Copied",
      description: "Secure access link copied to clipboard."
    });
  };

  const handleNativeShare = async () => {
    const url = getShareUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Access ${gcName} Blueprints`,
          text: `Secure blueprint access for ${gcName} on Designer's Ink PlanPort.`,
          url: url,
        });
      } catch (err) {
        // User cancelled or error
        if ((err as Error).name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 border-border">
          <Share2 className="w-4 h-4" />
          Share Access
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-background border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary text-center">Share Folder Access</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Allow subcontractors to scan or click to access blueprints for {gcName}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-6 py-6">
          <div className="p-4 bg-background rounded-md border-2 border-border min-h-[200px] min-w-[200px] flex items-center justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code to open ${gcName} blueprints`}
                width={200}
                height={200}
                className="block"
              />
            ) : (
              <span className="text-xs text-muted-foreground text-center px-2">
                Generating QR…
              </span>
            )}
          </div>
          
          <div className="w-full space-y-4">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Access Code</span>
              <div className="flex items-center gap-2 w-full p-3 bg-secondary rounded-lg justify-between border">
                <code className="text-lg font-mono font-bold text-primary">{accessCode}</code>
                <Button variant="ghost" size="sm" onClick={handleCopyCode}>
                  {codeCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <Button 
              className="w-full bg-primary hover:bg-primary/90 text-white" 
              onClick={handleNativeShare}
            >
              {linkCopied ? (
                <><Check className="w-4 h-4 mr-2" /> Link Copied</>
              ) : (
                <><LinkIcon className="w-4 h-4 mr-2" /> Send Share Link</>
              )}
            </Button>
            
            <p className="text-[10px] text-center text-muted-foreground">
              Sharing this grants read-only access to {gcName} projects. 
              All access is authenticated and logged.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
