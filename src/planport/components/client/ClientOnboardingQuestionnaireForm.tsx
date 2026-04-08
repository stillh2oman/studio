"use client";

import { useCallback, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { CloudUpload, X, FileIcon } from "lucide-react";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ClientOnboardingQuestionnaireFormValues } from "@/lib/client-onboarding-questionnaire-schema";

export const MAX_QUESTIONNAIRE_FILES = 10;
export const MAX_QUESTIONNAIRE_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_QUESTIONNAIRE_TOTAL_BYTES = 24 * 1024 * 1024;

type ProjectTypeKey = "new_construction" | "remodel" | "addition" | "other";

const PROJECT_OPTIONS: { key: ProjectTypeKey; label: string }[] = [
  { key: "new_construction", label: "New Construction — Residential" },
  { key: "remodel", label: "Remodel — Residential" },
  { key: "addition", label: "Addition — Residential" },
  { key: "other", label: "Other" },
];

export type QuestionnaireFileEntry = { file: File; dataUri: string };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-primary mb-3 border-b border-primary/15 pb-2">
      {children}
    </h4>
  );
}

function RequiredHint() {
  return <p className="text-[11px] text-muted-foreground mt-1.5">* This question is required</p>;
}

export function ClientOnboardingQuestionnaireForm({
  files,
  setFiles,
}: {
  files: QuestionnaireFileEntry[];
  setFiles: React.Dispatch<React.SetStateAction<QuestionnaireFileEntry[]>>;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const form = useFormContext<ClientOnboardingQuestionnaireFormValues>();

  const projectTypes = form.watch("projectTypes") || [];

  const toggleProjectType = useCallback(
    (key: ProjectTypeKey, checked: boolean) => {
      const cur = form.getValues("projectTypes") || [];
      const next = checked ? [...new Set([...cur, key])] : cur.filter((t) => t !== key);
      form.setValue("projectTypes", next, { shouldValidate: true });
    },
    [form]
  );

  const totalFileBytes = files.reduce((a, f) => a + f.file.size, 0);

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const arr = Array.from(list);
      if (arr.length === 0) return;

      const allowed = /\.(jpe?g|png|gif|pdf)$/i;
      let next = [...files];
      let nextBytes = totalFileBytes;

      for (const file of arr) {
        if (next.length >= MAX_QUESTIONNAIRE_FILES) {
          toast({
            variant: "destructive",
            title: "File limit",
            description: `You can upload up to ${MAX_QUESTIONNAIRE_FILES} files.`,
          });
          break;
        }
        if (!allowed.test(file.name)) {
          toast({
            variant: "destructive",
            title: "File type not allowed",
            description: "Use JPG, PNG, GIF, or PDF only.",
          });
          continue;
        }
        if (file.size > MAX_QUESTIONNAIRE_FILE_BYTES) {
          toast({
            variant: "destructive",
            title: "File too large",
            description: "Each file must be 15MB or smaller.",
          });
          continue;
        }
        if (nextBytes + file.size > MAX_QUESTIONNAIRE_TOTAL_BYTES) {
          toast({
            variant: "destructive",
            title: "Total size limit",
            description: "Combined attachments must stay under 24MB for delivery.",
          });
          break;
        }

        const dataUri: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("read"));
          reader.readAsDataURL(file);
        });
        next = [...next, { file, dataUri }];
        nextBytes += file.size;
      }

      setFiles(next);
    },
    [files, totalFileBytes, setFiles, toast]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-10 max-w-2xl">
      <div className="space-y-2">
        <SectionTitle>Client name(s)</SectionTitle>
        <p className="text-sm text-muted-foreground -mt-1 mb-2">
          Same format as your PlanPort client profile (e.g. <span className="text-foreground/80">John &amp; Jane Smith</span>).
        </p>
        <FormField
          control={form.control}
          name="clientNames"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="e.g. John & Jane Smith"
                  className="h-11 rounded-md border-primary/20 bg-background"
                  autoComplete="name"
                  {...field}
                />
              </FormControl>
              <RequiredHint />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle>Phone number</SectionTitle>
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  type="tel"
                  placeholder="(405) 555-1212"
                  className="h-11 rounded-md border-primary/20 bg-background"
                  autoComplete="tel"
                  {...field}
                />
              </FormControl>
              <RequiredHint />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle>Email address(es)</SectionTitle>
        <p className="text-sm text-muted-foreground -mt-1 mb-2">
          Primary contact first, then others separated by commas — matches the New Client / project setup form.
        </p>
        <FormField
          control={form.control}
          name="emails"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  type="email"
                  placeholder="you@example.com, partner@example.com"
                  className="h-11 rounded-md border-primary/20 bg-background"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <RequiredHint />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-3">
        <SectionTitle>Type of Project</SectionTitle>
        <p className="text-sm text-muted-foreground">Choose all options that apply.</p>
        <FormField
          control={form.control}
          name="projectTypes"
          render={() => (
            <FormItem>
              <div className="space-y-3">
                {PROJECT_OPTIONS.map(({ key, label }) => (
                  <div key={key} className="flex items-start space-x-3">
                    <Checkbox
                      id={`pt-${key}`}
                      checked={projectTypes.includes(key)}
                      onCheckedChange={(c) => toggleProjectType(key, c === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor={`pt-${key}`} className="font-normal leading-snug cursor-pointer">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle>If You Selected &quot;Other,&quot; Please Elaborate</SectionTitle>
        <FormField
          control={form.control}
          name="otherElaboration"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="e.g. Graphic design work, renderings, Chief Architect tutoring services, etc."
                  className="min-h-[100px] rounded-md border-primary/20 bg-background resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-6">
        <SectionTitle>Physical address of project</SectionTitle>
        <p className="text-sm text-muted-foreground -mt-2 mb-1">Street address, city, and state — used for the project address in PlanPort.</p>
        <FormField
          control={form.control}
          name="projectStreetAddress"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="Street address"
                  className="h-11 rounded-md border-primary/20 bg-background"
                  autoComplete="street-address"
                  {...field}
                />
              </FormControl>
              <RequiredHint />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="projectCity"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder="City"
                    className="h-11 rounded-md border-primary/20 bg-background"
                    autoComplete="address-level2"
                    {...field}
                  />
                </FormControl>
                <RequiredHint />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="projectState"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder="State (e.g. OK)"
                    className="h-11 rounded-md border-primary/20 bg-background"
                    autoComplete="address-level1"
                    {...field}
                  />
                </FormControl>
                <RequiredHint />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>Subdivision name</SectionTitle>
        <p className="text-sm text-muted-foreground -mt-2 mb-1">If applicable.</p>
        <FormField
          control={form.control}
          name="subdivisionName"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="Leave blank if not in a subdivision"
                  className="h-11 rounded-md border-primary/20 bg-background"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle>Permitting agency</SectionTitle>
        <p className="text-sm text-muted-foreground -mt-2 mb-1">Building department or jurisdiction, if required.</p>
        <FormField
          control={form.control}
          name="permittingAgency"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="Leave blank if unknown or not applicable"
                  className="h-11 rounded-md border-primary/20 bg-background"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle>Site description</SectionTitle>
        <p className="text-sm text-muted-foreground -mt-2 mb-1">
          Property size, limitations, terrain, access, or other site notes.
        </p>
        <FormField
          control={form.control}
          name="siteDescription"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="e.g. 2-acre lot, sloped toward the east, narrow driveway, utilities at the street…"
                  className="min-h-[120px] rounded-md border-primary/20 bg-background resize-y"
                  {...field}
                />
              </FormControl>
              <RequiredHint />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle>General contractor</SectionTitle>
        <p className="text-sm text-muted-foreground -mt-2 mb-1">
          Contractor&apos;s name, Self-Contractor, or Pending.
        </p>
        <FormField
          control={form.control}
          name="generalContractor"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder="e.g. ABC Builders, Self-Contractor, or Pending"
                  className="h-11 rounded-md border-primary/20 bg-background"
                  {...field}
                />
              </FormControl>
              <RequiredHint />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle>General Description of the Project</SectionTitle>
        <FormField
          control={form.control}
          name="projectDescription"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  placeholder="e.g., a four-bedroom, three-bath new-construction home in a farmhouse style, approximately 2,350 heated square feet."
                  className="min-h-[120px] rounded-md border-primary/20 bg-background resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-3">
        <SectionTitle>
          Sketches, Photos, and Plan Ideas (Optional)
        </SectionTitle>
        <div
          className={cn(
            "relative rounded-md border-2 border-dashed border-border bg-secondary px-4 py-8 text-center transition-colors",
            dragActive && "border-ledger-yellow/50 bg-background"
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            void addFiles(e.dataTransfer.files);
          }}
        >
          <CloudUpload className="mx-auto h-10 w-10 text-muted-foreground mb-3" strokeWidth={1.25} />
          <p className="text-sm text-foreground/90">
            Drag and drop files here, or{" "}
            <button
              type="button"
              className="text-accent text-xs font-semibold uppercase tracking-wide underline-offset-2 hover:underline"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose files
            </button>
          </p>
          <p className="text-xs text-muted-foreground mt-2">Max. file size 15MB (JPG, PNG, GIF, PDF)</p>
          <p className="text-xs text-muted-foreground">Upload up to {MAX_QUESTIONNAIRE_FILES} files</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.pdf,image/jpeg,image/png,image/gif,application/pdf"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 ? (
          <ul className="space-y-2 pt-1">
            {files.map((f, i) => (
              <li
                key={`${f.file.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-primary/10 bg-card px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({(f.file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </span>
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeFile(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
