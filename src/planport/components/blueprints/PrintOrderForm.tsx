"use client";

import { useState, useEffect } from "react";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Printer, Calculator, FileCheck, Loader2, MessageSquare } from "lucide-react";
import { sendPrintOrder } from "@/ai/flows/send-print-order";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@planport/firebase";

const formSchema = z.object({
  requesterName: z.string().min(1, "Enter the name of the person requesting prints").trim(),
  requesterEmail: z.string().min(1, "Enter an email address").email("Enter a valid email address").trim(),
  paperSize: z.enum(["36x24", "48x36"]),
  quantity: z.coerce.number().min(1, "Must order at least 1 set"),
  pageOption: z.enum(["all", "range", "selection", "custom"]),
  pageRangeStart: z.coerce.number().optional(),
  pageRangeEnd: z.coerce.number().optional(),
  specificPages: z.string().optional(),
  customSelection: z.string().optional(),
  specialInstructions: z.string().optional(),
  totalPagesInFile: z.coerce.number().optional(),
  manualSheetCount: z.coerce.number().optional(),
});

interface PrintOrderFormProps {
  blueprintName: string;
  gcName: string;
  projectName: string;
  totalPages?: number;
  detectedPaperSize?: "36x24" | "48x36";
  /** Dialog + select menus render here so they work in native browser fullscreen. */
  portalContainer?: HTMLElement | null;
}

export function PrintOrderForm({ blueprintName, gcName, projectName, totalPages = 1, detectedPaperSize = "36x24", portalContainer }: PrintOrderFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      requesterName: "",
      requesterEmail: "",
      paperSize: detectedPaperSize,
      quantity: 1,
      pageOption: "all",
      totalPagesInFile: totalPages,
      manualSheetCount: 1,
      pageRangeStart: 1,
      pageRangeEnd: totalPages,
      specificPages: "",
      specialInstructions: "",
      customSelection: "",
    },
  });

  // Automatically update form when PDF page count or paper size is detected/changed
  useEffect(() => {
    if (totalPages > 0) {
      form.setValue("totalPagesInFile", totalPages);
      // Update range end if it was at default
      const currentEnd = form.getValues("pageRangeEnd");
      if (!currentEnd || currentEnd === 1) {
        form.setValue("pageRangeEnd", totalPages);
      }
    }
    if (detectedPaperSize) {
      form.setValue("paperSize", detectedPaperSize);
    }
  }, [totalPages, detectedPaperSize, form]);

  useEffect(() => {
    if (!open || !user) return;
    const { requesterName, requesterEmail } = form.getValues();
    if (!requesterName.trim() && user.displayName) {
      form.setValue("requesterName", user.displayName);
    }
    if (!requesterEmail.trim() && user.email) {
      form.setValue("requesterEmail", user.email);
    }
  }, [open, user, form]);

  const watchAll = form.watch();
  const [totalPrice, setTotalPrice] = useState(0);
  const [sheetsPerSet, setSheetsPerSet] = useState(0);

  useEffect(() => {
    let sheets = 0;
    if (watchAll.pageOption === "all") {
      sheets = watchAll.totalPagesInFile || 0;
    } else if (watchAll.pageOption === "range") {
      const start = watchAll.pageRangeStart || 0;
      const end = watchAll.pageRangeEnd || 0;
      sheets = Math.max(0, end - start + 1);
    } else if (watchAll.pageOption === "selection") {
      sheets = watchAll.specificPages?.split(",").filter(s => s.trim() !== "").length || 0;
    } else if (watchAll.pageOption === "custom") {
      sheets = watchAll.manualSheetCount || 0;
    }

    const pricePerSheet = watchAll.paperSize === "36x24" ? 4.25 : 6.25;
    setSheetsPerSet(sheets);
    setTotalPrice(sheets * watchAll.quantity * pricePerSheet);
  }, [watchAll]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      const result = await sendPrintOrder({
        blueprintName,
        gcName,
        projectName,
        requesterName: values.requesterName,
        requesterEmail: values.requesterEmail,
        paperSize: values.paperSize,
        quantity: values.quantity,
        pageOption: values.pageOption,
        pageRange: values.pageOption === 'range' ? `${values.pageRangeStart}-${values.pageRangeEnd}` : undefined,
        specificPages: values.specificPages,
        customSelection: values.customSelection,
        specialInstructions: values.specialInstructions,
        totalSheets: sheetsPerSet * values.quantity,
        estimatedTotal: totalPrice,
      });

      if (result.success) {
        toast({
          title: "Order Placed",
          description: result.message,
        });
        setOpen(false);
        form.reset();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Order Failed",
        description: "There was an error sending your request. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="secondary" 
          size="sm" 
          className="bg-accent text-accent-foreground hover:bg-accent/80 font-bold border-none"
        >
          <Printer className="w-4 h-4 mr-2" />
          Request Prints
        </Button>
      </DialogTrigger>
      <DialogContent portalContainer={portalContainer} className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary flex items-center gap-2">
            <Printer className="w-6 h-6 text-accent" />
            Print Order Request
          </DialogTitle>
          <DialogDescription>
            Submit an order for {blueprintName}. All prints are processed by Designer's Ink.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <div className="space-y-4 rounded-md border border-border bg-secondary p-4">
              <p className="text-sm text-muted-foreground">
                Who should Designer's Ink contact about this order? This may differ from the project contractor if someone else is requesting prints (for example a shared collaborator).
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="requesterName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your name</FormLabel>
                      <FormControl>
                        <Input placeholder="Full name" autoComplete="name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requesterEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="paperSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paper Size</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent portalContainer={portalContainer}>
                        <SelectItem value="36x24">36" x 24" ($4.25)</SelectItem>
                        <SelectItem value="48x36">48" x 36" ($6.25)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-[10px]">Detected from PDF dimensions.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Sets</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="pageOption"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Page Selection</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select page option" />
                      </SelectTrigger>
                      <SelectContent portalContainer={portalContainer}>
                        <SelectItem value="all">All Pages</SelectItem>
                        <SelectItem value="range">Range of Pages</SelectItem>
                        <SelectItem value="selection">Specific Page Selection</SelectItem>
                        <SelectItem value="custom">Custom Order Structure</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />

            {watchAll.pageOption === "all" && (
              <FormField
                control={form.control}
                name="totalPagesInFile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Pages in Document</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} readOnly className="bg-secondary/50" />
                    </FormControl>
                    <FormDescription>Automatically detected from PDF file.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {watchAll.pageOption === "range" && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
                <FormField
                  control={form.control}
                  name="pageRangeStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Page</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pageRangeEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Page</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {watchAll.pageOption === "selection" && (
              <FormField
                control={form.control}
                name="specificPages"
                render={({ field }) => (
                  <FormItem className="animate-in fade-in duration-300">
                    <FormLabel>Specific Pages</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 1, 3, 5, 12" {...field} />
                    </FormControl>
                    <FormDescription>Comma separated list of page numbers</FormDescription>
                  </FormItem>
                )}
              />
            )}

            {watchAll.pageOption === "custom" && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <FormField
                  control={form.control}
                  name="customSelection"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Order Details</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="e.g. 2 full sets, 5 floor plans and 1 electrical plan" 
                          className="min-h-[100px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>Describe exactly which pages and quantities you need.</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="manualSheetCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Total Sheets per Set</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>Needed for price estimation.</FormDescription>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="specialInstructions"
              render={({ field }) => (
                <FormItem className="border-t pt-4">
                  <FormLabel className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    Special Instructions / Comments
                  </FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Add any additional notes for Designer's Ink here..." 
                      className="bg-background border border-border"
                      {...field} 
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="bg-secondary/50 p-4 rounded-xl border space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" />
                  Price Per Sheet:
                </span>
                <span className="font-bold text-primary">
                  ${watchAll.paperSize === "36x24" ? "4.25" : "6.25"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5" />
                  Total Sheets Ordered:
                </span>
                <span className="font-bold text-primary">
                  {sheetsPerSet * watchAll.quantity} sheets
                </span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between items-center">
                <span className="font-bold uppercase tracking-wide text-foreground">Estimated Total:</span>
                <span className="text-xl font-bold text-accent">${totalPrice.toFixed(2)}</span>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-white h-12"
              disabled={loading || totalPrice === 0}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending Order...
                </>
              ) : (
                "Submit Print Order"
              )}
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">
              Order form will be emailed to jeff@designersink.us upon submission.
            </p>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}