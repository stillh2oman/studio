import * as z from "zod";

export const clientOnboardingQuestionnaireFormSchema = z
  .object({
    clientNames: z.string().min(1, "This question is required"),
    phone: z.string().min(10, "This question is required"),
    emails: z.string().min(1, "Please enter at least one e-mail address"),
    projectTypes: z
      .array(z.enum(["new_construction", "remodel", "addition", "other"]))
      .min(1, "Choose any of the options that apply"),
    otherElaboration: z.string().optional(),
    projectStreetAddress: z.string().min(1, "Street address is required"),
    projectCity: z.string().min(1, "City is required"),
    projectState: z.string().min(2, "State is required"),
    subdivisionName: z.string().max(500),
    permittingAgency: z.string().max(500),
    siteDescription: z.string().min(1, "Site description is required"),
    generalContractor: z
      .string()
      .min(1, "Please indicate who will be the general contractor for your project"),
    projectDescription: z.string().min(1, "This question is required"),
  })
  .superRefine((data, ctx) => {
    if (data.projectTypes.includes("other") && !data.otherElaboration?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please elaborate when “Other” is selected",
        path: ["otherElaboration"],
      });
    }
  });

export type ClientOnboardingQuestionnaireFormValues = z.infer<
  typeof clientOnboardingQuestionnaireFormSchema
>;

export const clientOnboardingQuestionnaireDefaultValues: ClientOnboardingQuestionnaireFormValues = {
  clientNames: "",
  phone: "",
  emails: "",
  projectTypes: [],
  otherElaboration: "",
  projectStreetAddress: "",
  projectCity: "",
  projectState: "",
  subdivisionName: "",
  permittingAgency: "",
  siteDescription: "",
  generalContractor: "",
  projectDescription: "",
};
