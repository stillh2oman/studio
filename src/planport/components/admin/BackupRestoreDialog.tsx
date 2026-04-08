
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Database, 
  Download, 
  Upload, 
  RefreshCcw, 
  ShieldCheck, 
  AlertTriangle,
  FileJson,
  Loader2
} from "lucide-react";
import { useFirestore } from "@planport/firebase";
import { useToast } from "@/hooks/use-toast";
import { exportAppData, importAppData } from "@/lib/backup-service";

export function BackupRestoreDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const db = useFirestore();
  const { toast } = useToast();

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = await exportAppData(db);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `planport-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Backup Successful",
        description: "Your database export has been downloaded."
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("CRITICAL WARNING: Importing data will merge with or overwrite existing records. This cannot be undone. Proceed?")) {
      e.target.value = '';
      return;
    }

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          await importAppData(db, json);
          toast({
            title: "Restore Complete",
            description: "Application data has been successfully restored from backup."
          });
          setOpen(false);
        } catch (err: any) {
          toast({
            variant: "destructive",
            title: "Import Error",
            description: "Invalid backup file format."
          });
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Restore Failed",
        description: error.message
      });
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border">
          <Database className="w-4 h-4 mr-2" />
          System Backup
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-accent" />
            Database Utilities
          </DialogTitle>
          <DialogDescription>
            Export or restore the entire PlanPort ecosystem data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="bg-secondary/30 p-4 rounded-xl border space-y-3">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-primary" />
              <div>
                <h4 className="font-bold uppercase tracking-wide text-primary text-sm">Download Backup</h4>
                <p className="text-[10px] text-muted-foreground">Creates a full JSON snapshot of contractors, projects, and roles.</p>
              </div>
            </div>
            <Button 
              onClick={handleExport} 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileJson className="w-4 h-4 mr-2" />}
              Generate & Download Snapshot
            </Button>
          </div>

          <div className="bg-card p-4 rounded-md border border-destructive/35 space-y-3">
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-destructive" />
              <div>
                <h4 className="font-bold uppercase tracking-wide text-destructive text-sm">Restore from File</h4>
                <p className="text-[10px] text-muted-foreground">Upload a previous backup to restore the application state.</p>
              </div>
            </div>
            
            <div className="relative">
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImport} 
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                disabled={loading}
              />
              <Button 
                variant="outline" 
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                Select & Upload Backup
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg border border-amber-100">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-800 leading-relaxed">
              <strong>Note:</strong> Backups only contain database records. External files hosted in Dropbox are linked by URL and are not physically moved or backed up by this process.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
