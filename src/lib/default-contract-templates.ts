import { COMMERCIAL_ADDITIONS_REMODELS_AGREEMENT_BODY_HTML } from "@/data/commercial-additions-remodels-agreement-html";
import { COMMERCIAL_DESIGN_SERVICE_AGREEMENT_BODY_HTML } from "@/data/commercial-design-service-agreement-html";
import { RESIDENTIAL_NEW_CONSTRUCTION_AGREEMENT_BODY_HTML } from "@/data/residential-new-construction-agreement-html";
import { RESIDENTIAL_REMODELS_ADDITIONS_AGREEMENT_BODY_HTML } from "@/data/residential-remodels-additions-agreement-html";
import { DIGITAL_FILE_RELEASE_WAIVER_BODY_HTML } from "@/data/digital-file-release-waiver-html";

export type DefaultContractTemplateSlug =
  | "commercial-design-service"
  | "commercial-additions-remodels"
  | "residential-new-construction"
  | "residential-remodels-additions"
  | "digital-file-release-waiver";

export const DEFAULT_CONTRACT_TEMPLATE_SLUGS: readonly DefaultContractTemplateSlug[] = [
  "commercial-design-service",
  "commercial-additions-remodels",
  "residential-new-construction",
  "residential-remodels-additions",
  "digital-file-release-waiver",
];

const REGISTRY: Record<
  DefaultContractTemplateSlug,
  { title: string; description: string; bodyHtml: string }
> = {
  "commercial-design-service": {
    title: "DESIGN SERVICE AGREEMENT (COMMERCIAL)",
    description:
      "New construction commercial buildings — hourly design services, Oklahoma law & Payne County venue.",
    bodyHtml: COMMERCIAL_DESIGN_SERVICE_AGREEMENT_BODY_HTML,
  },
  "commercial-additions-remodels": {
    title: "DESIGN SERVICE AGREEMENT (COMMERCIAL ADDITIONS & REMODELS)",
    description:
      "Commercial additions and remodels — as-builts, existing-condition limits, Oklahoma law & Payne County venue.",
    bodyHtml: COMMERCIAL_ADDITIONS_REMODELS_AGREEMENT_BODY_HTML,
  },
  "residential-new-construction": {
    title: "DESIGN SERVICE AGREEMENT (NEW CONSTRUCTION RESIDENTIAL)",
    description:
      "New residential construction — $1.50/sf cap fee structure, HOA/site terms, Oklahoma law & Payne County venue.",
    bodyHtml: RESIDENTIAL_NEW_CONSTRUCTION_AGREEMENT_BODY_HTML,
  },
  "residential-remodels-additions": {
    title: "DESIGN SERVICE AGREEMENT (RESIDENTIAL REMODELS / ADDITIONS)",
    description:
      "Residential remodels and additions — as-builts, hourly $115, HOA/site terms, Oklahoma law & Payne County venue.",
    bodyHtml: RESIDENTIAL_REMODELS_ADDITIONS_AGREEMENT_BODY_HTML,
  },
  "digital-file-release-waiver": {
    title: "DIGITAL FILE RELEASE AND WAIVER OF LIABILITY",
    description:
      "CAD/PDF file release — as-is transfer, metadata removal, indemnity, Oklahoma law & Payne County venue. Same sign workflow as design agreements.",
    bodyHtml: DIGITAL_FILE_RELEASE_WAIVER_BODY_HTML,
  },
};

export function getDefaultContractTemplate(
  slug: string
): { title: string; description: string; bodyHtml: string } | undefined {
  if (slug in REGISTRY) return REGISTRY[slug as DefaultContractTemplateSlug];
  return undefined;
}
