"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Header } from "@planport/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, User, MessageSquare, Paperclip, Send, Loader2, ArrowLeft, X, ShieldCheck, FileText } from "lucide-react";
import { sendContactForm } from "@/ai/flows/send-contact-form";
import Link from "next/link";
import { cn } from "@/lib/utils";

const contactFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number is required"),
  subject: z.string().min(3, "Subject is required"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

interface SelectedFile {
  name: string;
  dataUri: string;
}

export default function ContactAdminPage() {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof contactFormSchema>>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const filePromises = newFiles.map(file => {
        return new Promise<SelectedFile>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve({ name: file.name, dataUri: reader.result as string });
        });
      });

      const processed = await Promise.all(filePromises);
      setFiles(prev => [...prev, ...processed]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function onSubmit(values: z.infer<typeof contactFormSchema>) {
    setLoading(true);
    try {
      const result = await sendContactForm({
        ...values,
        attachments: files,
      });

      if (result.success) {
        toast({
          title: "Message Sent",
          description: result.message,
        });
        form.reset();
        setFiles([]);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: "Could not send your message. Please try again later.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-6 py-12 flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-6">
          <Link href="/portal" className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-ledger-yellow transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>

          <Card className="border-border overflow-hidden">
            <CardHeader className="bg-card border-b border-border space-y-2">
              <div className="flex items-center gap-3">
                <div className="bg-secondary border border-border p-2 rounded-md">
                  <Mail className="w-6 h-6 text-ledger-yellow" />
                </div>
                <CardTitle className="text-2xl">Contact Designer&apos;s Ink</CardTitle>
              </div>
              <CardDescription className="text-muted-foreground uppercase tracking-wide text-xs">
                Send a secure message or transmit project files to Jeff Dillon.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                              <Input className="pl-10" placeholder="Your name" {...field} />
                            </div>
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
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                              <Input className="pl-10" type="email" placeholder="email@example.com" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                              <Input className="pl-10" placeholder="(555) 000-0000" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject</FormLabel>
                          <FormControl>
                            <Input placeholder="Regarding blueprint..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                            <Textarea 
                              className="pl-10 min-h-[120px]" 
                              placeholder="Describe your request..." 
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <FormLabel>Attachments (Max 25MB total)</FormLabel>
                    <div className="border-2 border-dashed border-border rounded-md p-6 bg-secondary hover:bg-secondary/90 transition-colors text-center cursor-pointer group" onClick={() => document.getElementById('file-upload')?.click()}>
                      <input 
                        type="file" 
                        id="file-upload" 
                        multiple 
                        className="hidden" 
                        onChange={handleFileChange}
                      />
                      <div className="bg-background border border-border w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                        <Paperclip className="w-5 h-5 text-foreground" />
                      </div>
                      <p className="text-sm font-bold uppercase tracking-wide text-foreground">Click to select files</p>
                      <p className="text-[10px] text-muted-foreground">PDF, Images, Documentation</p>
                    </div>

                    {files.length > 0 && (
                      <div className="space-y-2 mt-4">
                        {files.map((f, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-card rounded-md border border-border animate-in fade-in duration-200">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText className="w-4 h-4 text-accent shrink-0" />
                              <span className="text-xs font-medium truncate">{f.name}</span>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFile(i)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-lg mt-4"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Transmitting...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-5 w-5" />
                        Send Securely
                      </>
                    )}
                  </Button>
                  
                  <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground mt-4 opacity-70">
                    <ShieldCheck className="w-3 h-3" />
                    Encrypted transmission to jeff@designersink.us
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
