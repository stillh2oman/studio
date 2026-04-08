
"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  CloudUpload, 
  FileText, 
  X, 
  Paperclip, 
  Send, 
  Loader2, 
  ShieldCheck, 
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { sendContactForm } from "@/ai/flows/send-contact-form";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const fileSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number is required"),
  message: z.string().min(5, "Please provide a brief description"),
});

interface SecureFileUploadDialogProps {
  projectName?: string;
  projectAddress?: string;
  designerEmail?: string;
  trigger?: React.ReactNode;
}

interface SelectedFile {
  file: File;
  dataUri: string;
}

export function SecureFileUploadDialog({ projectName, projectAddress, designerEmail, trigger }: SecureFileUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof fileSchema>>({
    resolver: zodResolver(fileSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const newTotalSize = totalSize + newFiles.reduce((acc, f) => acc + f.size, 0);

      if (newTotalSize > MAX_FILE_SIZE) {
        toast({
          variant: "destructive",
          title: "Size Limit Exceeded",
          description: "Total file size must be under 25MB. Please remove some files.",
        });
        return;
      }

      const filePromises = newFiles.map(file => {
        return new Promise<SelectedFile>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve({ file, dataUri: reader.result as string });
        });
      });

      const processedFiles = await Promise.all(filePromises);
      setFiles(prev => [...prev, ...processedFiles]);
      setTotalSize(newTotalSize);
    }
  };

  const removeFile = (index: number) => {
    const fileToRemove = files[index];
    setFiles(prev => prev.filter((_, i) => i !== index));
    setTotalSize(prev => prev - fileToRemove.file.size);
  };

  async function onSubmit(values: z.infer<typeof fileSchema>) {
    if (files.length === 0) {
      toast({
        variant: "destructive",
        title: "No Files Selected",
        description: "Please select at least one file to transmit.",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await sendContactForm({
        ...values,
        subject: `File Transmission${projectName ? `: ${projectName}` : ''}`,
        recipientEmail: designerEmail,
        projectName,
        projectAddress,
        attachments: files.map(f => ({ name: f.file.name, dataUri: f.dataUri })),
      });

      if (result.success) {
        toast({
          title: "Transmission Successful",
          description: result.message,
        });
        setOpen(false);
        setFiles([]);
        setTotalSize(0);
        form.reset();
      } else {
        toast({
          variant: "destructive",
          title: "Transmission Failed",
          description: result.message || "The email relay rejected the transmission.",
        });
      }
    } catch (error: any) {
      console.error("Submission error:", error);
      toast({
        variant: "destructive",
        title: "Network Error",
        description: "Could not establish a secure tunnel. If your files are near 25MB, try sending them in smaller batches.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2 border-border">
            <CloudUpload className="w-4 h-4" />
            Transmit Project Files
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-ledger-red" />
            Secure File Transmission
          </DialogTitle>
          <DialogDescription>
            {projectName 
              ? `Transmit documentation or media for ${projectName} directly to ${designerEmail || 'Jeff Dillon'}.`
              : "Securely send files to Designer's Ink for review."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* File Drop/Selection Zone */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-md p-8 text-center bg-secondary hover:bg-secondary/90 transition-colors cursor-pointer group"
          >
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
            />
            <div className="bg-background border border-border w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Paperclip className="w-6 h-6 text-foreground" />
            </div>
            <h4 className="font-bold uppercase tracking-wide text-foreground">Select File(s) to Upload</h4>
            <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, DOCX (Max 25MB total)</p>
          </div>

          {/* Selected Files List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Queue: {files.length} items</span>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  totalSize > MAX_FILE_SIZE * 0.9 ? "border border-ledger-yellow/45 text-ledger-yellow bg-background" : "bg-secondary text-muted-foreground border border-border"
                )}>
                  {(totalSize / (1024 * 1024)).toFixed(2)} MB / 25 MB
                </span>
              </div>
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-card rounded-md border border-border group animate-in slide-in-from-left-2 duration-200">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-secondary border border-border p-1.5 rounded-md">
                      <FileText className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-foreground truncate max-w-[200px]">{f.file.name}</p>
                      <p className="text-[10px] text-muted-foreground">{(f.file.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4 border-t">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 000-0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transmission Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Please describe what you are sending..." 
                        className="bg-secondary border border-border"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {totalSize > MAX_FILE_SIZE && (
                <div className="flex items-center gap-2 p-3 bg-card text-destructive rounded-md text-xs font-medium border border-destructive/35">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Transmission size exceeds 25MB limit. Please remove files.
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-14 bg-primary hover:bg-primary/90 text-primary-foreground text-lg"
                disabled={loading || files.length === 0 || totalSize > MAX_FILE_SIZE}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Transmitting Securely...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-5 w-5" />
                    Transmit to Designer's Ink
                  </>
                )}
              </Button>
              
              <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground bg-secondary border border-border p-2 rounded-md">
                <ShieldCheck className="w-3 h-3 text-ledger-red" />
                End-to-End Encrypted Tunnel to Designer's Ink Server
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
