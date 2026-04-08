
"use client";

import { useState } from "react";
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
  SendHorizontal, 
  Loader2, 
  ShieldCheck, 
  Image as ImageIcon,
  User,
  Mail,
  AlertCircle
} from "lucide-react";
import { sendContactForm } from "@/ai/flows/send-contact-form";

const revisionSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email address"),
  message: z.string().min(5, "Please describe the changes requested"),
});

interface SubmitRevisionDialogProps {
  blueprintName: string;
  designerEmail?: string;
  onCapture: () => string | null;
  trigger?: React.ReactNode;
  /** Render dialog inside this element so it appears over native browser fullscreen PDF viewers. */
  portalContainer?: HTMLElement | null;
}

export function SubmitRevisionDialog({ blueprintName, designerEmail, onCapture, trigger, portalContainer }: SubmitRevisionDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof revisionSchema>>({
    resolver: zodResolver(revisionSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });

  async function onSubmit(values: z.infer<typeof revisionSchema>) {
    const markupImage = onCapture();
    if (!markupImage) {
      toast({ variant: "destructive", title: "Capture Error", description: "Could not generate marked-up blueprint image." });
      return;
    }

    setLoading(true);
    try {
      const result = await sendContactForm({
        ...values,
        phone: "N/A",
        subject: `CHANGE REQUEST: ${blueprintName}`,
        recipientEmail: designerEmail,
        projectName: blueprintName,
        attachments: [{
          name: `Revision-${blueprintName}-${new Date().getTime()}.jpg`,
          dataUri: markupImage
        }],
      });

      if (result.success) {
        toast({ title: "Request Sent", description: `Your change request has been sent to ${designerEmail || 'Jeff Dillon'}.` });
        setOpen(false);
        form.reset();
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Transmission Failed", description: error.message || "Failed to deliver change request." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button>Submit Changes</Button>}
      </DialogTrigger>
      <DialogContent portalContainer={portalContainer} className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <SendHorizontal className="w-6 h-6 text-accent" />
            Submit Change Request
          </DialogTitle>
          <DialogDescription>
            Your current red-line markups will be attached to this email and sent directly to the Lead Designer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="bg-secondary/30 p-4 rounded-xl border border-dashed flex items-center gap-4">
            <div className="bg-card border border-border p-2 rounded-md">
              <ImageIcon className="w-8 h-8 text-accent" />
            </div>
            <div>
              <p className="text-xs font-bold text-primary">Marked Blueprint Attached</p>
              <p className="text-[10px] text-muted-foreground">Current view with all red pen and text notes included.</p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                        <Input className="pl-10" placeholder="John Doe" {...field} />
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
                    <FormLabel>Your Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                        <Input className="pl-10" type="email" placeholder="client@example.com" {...field} />
                      </div>
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
                    <FormLabel>Request Details</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe the specific changes you need based on your markups..." 
                        className="bg-secondary border border-border min-h-[120px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white text-lg"
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Sending Request...</>
                ) : (
                  <><SendHorizontal className="mr-2 h-5 w-5" /> Send to Lead Designer</>
                )}
              </Button>
              
              <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                <ShieldCheck className="w-3 h-3 text-accent" />
                Routing to: {designerEmail || 'jeff@designersink.us'}
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
