/**
 * Knowledge base for the in-app Help assistant. Mirrors the Client Onboarding Packet
 * (Welcome, Questionnaire, FAQs, Design Process, Consultation) and public firm info
 * aligned with www.designersink.us — condensed for keyword matching, not a live crawl.
 */

import { OK_ARCHITECT_STATUTES_URL } from "@/lib/client-onboarding-faq-data";

export const DESIGNERS_INK_WEB = "https://www.designersink.us";

export type HelpFaqItem = { keywords: string[]; answer: string };

/** Opening assistant message (shown when the panel first opens). */
export const HELP_ASSISTANT_OPENING =
  "Hi! I’m the PlanPort Help Assistant. I use the full in-app onboarding FAQs, PlanPort how-tos, and live web search (including designersink.us) to answer in plain language. For anything specific to your project, use Message Designer in your hub.";

/** When no FAQ keyword match scores high enough. */
export const HELP_ASSISTANT_FALLBACK = `I draw answers from the Onboarding Packet (in PlanPort) and from what’s published at ${DESIGNERS_INK_WEB.replace("https://", "")} — services, building & graphic design, Chief Architect help, and how to reach the office. Try keywords like: onboarding, questionnaire, fees, payment, office hours, design process, consultation, PlanPort portal, blueprints, or message designer.`;

export const PLANPORT_HELP_FAQ: HelpFaqItem[] = [
  // —— PlanPort product (existing) ——
  {
    keywords: ["login", "log in", "access", "code", "signin", "sign in", "password"],
    answer:
      "Use the shared access code from your designer or contractor on the login screen. If you are blocked, ask your designer to confirm your code in Admin > Client & Contractor Database.",
  },
  {
    keywords: ["blueprint", "blueprints", "pdf", "plan", "view"],
    answer:
      "Open a project, go to the Blueprints tab, and select the version from Revision History. Use pan/zoom tools in the viewer to inspect details.",
  },
  {
    keywords: ["message", "designer", "contact", "email", "send message"],
    answer:
      "Click Message Designer in the sidebar. It opens an in-app form and sends your message directly to your assigned designer.",
  },
  {
    keywords: ["upload", "transmit", "file", "files", "attach"],
    answer:
      "Use Send Project Files or Transmit Files. You can upload multiple files up to 25MB total and include notes for the designer.",
  },
  {
    keywords: ["download", "print", "prints", "pdf download"],
    answer:
      "If downloads are enabled for your hub, use the Download button in the viewer. For prints, use the Print Order option from the blueprint tools.",
  },
  {
    keywords: ["rendering", "renderings", "image", "images", "picture"],
    answer:
      "Project renderings are under the Renderings tab. Click the external-link icon on an image card to open full size.",
  },
  {
    keywords: ["project", "projects", "switch", "open project", "folder"],
    answer:
      "From the contractor/client dashboard, pick a project card to enter it. Inside a project, use the Directories list on the left to switch projects quickly.",
  },
  {
    keywords: ["archive", "older version", "previous version", "history"],
    answer:
      "Use the Archives tab to view older blueprint versions. In Revision History, select any entry to open that specific version.",
  },
  {
    keywords: ["error", "not loading", "broken", "blank", "issue", "bug"],
    answer:
      "If something is not loading, first refresh the page. If it continues, sign out/in and confirm your access code is correct. If still failing, use Message Designer and include the project name plus a screenshot.",
  },

  // —— Onboarding packet — overview ——
  {
    keywords: ["onboarding", "on boarding", "packet", "welcome packet", "client packet", "information packet"],
    answer:
      "The Client Onboarding Packet in PlanPort has tabs: Welcome, Questionnaire, FAQs, Design Process, and Consultation. Review each section, complete the Questionnaire, submit the packet once, then schedule a consultation when you’re ready. The bottom of the packet shows Designer's Ink contact info (phone, address, website).",
  },
  {
    keywords: ["questionnaire", "survey", "submit packet", "onboarding form", "intake"],
    answer:
      "Open the Questionnaire tab. Enter client name(s) (same style as your PlanPort profile, e.g. John & Jane Smith), phone, emails, project type, location fields, site description, and project description. Attach optional sketches/photos. Submit once; if something’s missing, the form will highlight errors.",
  },
  {
    keywords: ["consultation", "schedule", "initial meeting", "meeting", "calendar", "book"],
    answer:
      "Use the Consultation tab. You can open the scheduling calendar (when enabled for your designer) to pick a time, or email your designer from the packet. The meeting can be in person in Stillwater or online. Afterward, if you proceed, you’ll receive a Design Agreement to sign.",
  },
  {
    keywords: ["faq", "faqs", "frequently asked"],
    answer:
      "The FAQs tab explains office hours, how we use PlanPort for communication (instead of scattered texts/emails for routine work), fees, payment, holidays, vacations, rush work, printing plan sets, material takeoffs, collaboration with builders/engineers, GC selection, and Oklahoma architect rules where applicable.",
  },
  {
    keywords: ["design process", "process tab", "initial design", "3d modeling", "construction documents", "bids"],
    answer:
      "The Design Process tab outlines: initial layout and revisions, 3D modeling to visualize the home, construction documents (plans, elevations, schedules, etc. tailored to builder and jurisdiction), getting builder bids, optional budget-driven changes, and a free final review meeting with your selected builder.",
  },
  {
    keywords: ["planport", "portal", "client portal", "why planport"],
    answer:
      "The Onboarding FAQs explain that with many active projects, routine communication runs through your PlanPort Client Portal so files and messages stay with the project. Urgent issues can still go by phone. You’ll review drafts in PlanPort during design; after invoices are paid in full, you get non-watermarked PDFs of CDs and renderings.",
  },

  // —— Onboarding FAQs (condensed) ——
  {
    keywords: ["office hours", "appointment", "when open", "kevin", "jeff", "evening", "weekend"],
    answer:
      "Office hours are generally 8:00 AM–10:00 PM by appointment (designers split shifts). Kevin Walthall is typically 8–5 weekdays; Jeff Dillon is typically 1:00 PM–10:00 PM weekdays and weekends by appointment. Details are in the packet FAQs.",
  },
  {
    keywords: ["communication", "email", "text", "phone", "how reach", "contact office"],
    answer:
      "Routine communication is through your PlanPort portal so everything stays on the project. The firm typically has around 120 active projects. For urgent matters you can still call. See the Communication section in the packet FAQs.",
  },
  {
    keywords: ["fee", "fees", "cost", "hourly", "square foot", "per foot", "115", "1.50"],
    answer:
      "On new residential construction, design through approved design and one set of construction documents is estimated at $1.50 per heated square foot. Changes after CDs are billed at $115/hour. Billing is roughly every two weeks (1st and 15th); invoices due in 10 days. Once paid in full, you receive non-watermarked PDF CDs and renderings; drafts are visible in PlanPort during the project.",
  },
  {
    keywords: ["payment", "invoice", "pay now", "ach", "check", "late fee", "upfront"],
    answer:
      "Clients in good standing are not required to pay upfront; work is billed every two weeks. Pay online (card/ACH) via the invoice Pay Now link; ACH avoids card convenience fees. Payment is due upon receipt, late after 10 days (work pauses if unpaid). After 30 days a 3% late fee may apply; repeat late payment may require prepayment for future work.",
  },
  {
    keywords: ["holiday", "closed", "vacation", "out of office"],
    answer:
      "Offices close on nationally recognized holidays (plan deadlines accordingly). You’ll get notice of designer vacations; a team still works your project when someone is away — see Vacation Policy in the packet FAQs.",
  },
  {
    keywords: ["rush", "rush fee", "overtime", "24 hours"],
    answer:
      "Rush requests with less than 24 hours’ notice that require overtime may incur an extra fee; you’d be told in advance.",
  },
  {
    keywords: ["print", "printing", "plan set", "36", "24", "sheet"],
    answer:
      "You receive PDF plan sets to share digitally; print locally as needed. Local clients can have plans printed at cost (e.g. $4.25/sheet 36×24 and $6.25/sheet 48×36 — amounts in the packet may be updated).",
  },
  {
    keywords: ["takeoff", "material takeoff", "lumber"],
    answer:
      "Material takeoffs usually come from suppliers using your plan set; Designer's Ink does not provide takeoff services.",
  },
  {
    keywords: ["general contractor", "gc", "builder", "own contractor"],
    answer:
      "Choosing the right GC matters. You can pick any contractor; we’ll work with them on the plan set. Being your own GC is discouraged unless you have strong construction-management experience — see the packet FAQs.",
  },
  {
    keywords: ["architect", "oklahoma", "engineer", "stamp", "permit"],
    answer:
      `Oklahoma allows building designers on certain residential/light commercial scopes; other states and local jurisdictions differ. If an architect is required, we can refer you. For Oklahoma, review the state act and board rules on the Oklahoma Board of Architects publications page: ${OK_ARCHITECT_STATUTES_URL}. Always confirm with your permitting agency — see Architect Requirements in the packet FAQs.`,
  },
  {
    keywords: [
      "restaurant",
      "retail",
      "store",
      "shop",
      "office building",
      "warehouse",
      "medical",
      "clinic",
      "salon",
      "bar",
      "cafe",
      "hotel",
      "motel",
      "commercial type",
      "kind of building",
      "what can you design",
      "can you design",
      "design a",
    ],
    answer:
      `Whether Designer's Ink can design a specific commercial or public building type depends on the building code occupancy/use, project scope, and the laws of the state (and often the city or county) where the project is located. Each state has its own statutes and board rules for architects and building designers—look up your state's architectural board or equivalent. For Oklahoma projects, start with the Oklahoma Board of Architects Act & Rules: ${OK_ARCHITECT_STATUTES_URL}. Your local permitting authority makes official determinations. For your specific job, use Message Designer in PlanPort.`,
  },
  {
    keywords: [
      "assembly",
      "assemblies",
      "occupancy",
      "building code",
      "ibc",
      "church",
      "churches",
      "daycare",
      "school",
      "schools",
      "gymnasium",
      "gym",
      "stadium",
      "theater",
      "theatre",
      "auditorium",
      "public assembly",
    ],
    answer:
      `Under the building code, Designer's Ink does not provide design for buildings classified as Assembly occupancies. Typical examples include churches, daycares, schools, gymnasiums, stadiums, and theaters. Rules still vary by state and locality—review your state's design-practice laws (in Oklahoma: ${OK_ARCHITECT_STATUTES_URL}) and confirm occupancy classification with your permitting authority. Use Message Designer in PlanPort to ask whether we can assist or refer you.`,
  },

  // —— Designer's Ink / website (public site summary) ——
  {
    keywords: [
      "designers ink",
      "designer ink",
      "designer",
      "company",
      "who are you",
      "firm",
      "stillwater",
    ],
    answer:
      "Designer's Ink Graphic & Building Designs, LLC is an award-winning full-service design firm in Stillwater, Oklahoma, serving clients worldwide. They use Chief Architect for 3D models and construction documents. Services include residential/light commercial building design, graphic design, and Chief Architect assistance/training. More: www.designersink.us — phone 405-293-5515; office 2324 West 7th Place, Suite 1, Stillwater, OK.",
  },
  {
    keywords: ["website", "designersink", "www", "internet"],
    answer:
      "The public site is www.designersink.us — services, firm overview, and links. The client portal (PlanPort) is separate; you reach it with your access code from your designer.",
  },
  {
    keywords: ["building design", "residential", "commercial", "custom home", "remodel"],
    answer:
      `Per designersink.us, the firm handles custom residential and light commercial design, remodels/additions, and new construction — from concept through construction documents, with 3D visualization. Whether a particular commercial building type is in scope depends on code classification and state law; check your state's statutes and, for Oklahoma, ${OK_ARCHITECT_STATUTES_URL}. Scope details are on the website’s service pages.`,
  },
  {
    keywords: ["graphic design", "logo", "brochure", "sign"],
    answer:
      "Designer's Ink also offers graphic design (logos, cards, brochures, vehicle graphics, signs, apparel, websites, etc.) — see the Graphic Design section on www.designersink.us.",
  },
  {
    keywords: ["chief architect", "training", "tutor", "x17", "software"],
    answer:
      "The firm uses Chief Architect Premier and offers one-on-one training and assistance to other designers using the program, plus project support — described under Chief Architect Assistance on www.designersink.us.",
  },
  {
    keywords: ["405", "293", "5515", "phone", "call office"],
    answer:
      "Main office phone: 405-293-5515. You can also use Message Designer in PlanPort for project-specific questions.",
  },
  {
    keywords: ["address", "location", "visit", "office address", "7th place"],
    answer:
      "Office: 2324 West 7th Place, Suite 1, Stillwater, Oklahoma. Open the address from the map link in the Onboarding Packet footer or search in Google Maps.",
  },
];

/**
 * Policy sections shown only to the Help assistant (not on the onboarding FAQs tab).
 * Keep in sync with business rules for commercial scope and Assembly occupancies.
 */
const HELP_ONLY_POLICY_APPENDIX = `
# Additional policy (Help assistant only — not shown on the onboarding FAQ page)

## Commercial building types & state law

If you are asking whether Designer's Ink can design a particular kind of commercial or public building (for example a restaurant, retail store, office, medical suite, church, daycare, or school), the answer depends on how the project is classified under the building code and on the laws of the state — and often the locality — where the building will be built. Each state sets its own requirements for when a licensed architect or other design professional must be involved. Review your state's architectural board statutes and rules, and always confirm with your local permitting authority (authority having jurisdiction). For Oklahoma projects, see the Oklahoma Board of Architects publications, including the Oklahoma State Architectural and Licensed Interior Designers Act and OAC rules, at ${OK_ARCHITECT_STATUTES_URL}. To ask whether we can take your specific project, use Message Designer in PlanPort.

## Assembly occupancies (building code)

Designer's Ink does not design buildings that are classified by the building code as Assembly occupancies. Assembly buildings are those used for gathering of groups for civic, social, religious, recreation, food/drink, or similar purposes. Common examples include churches, daycares, schools, gymnasiums, stadiums, and theaters. Code requirements and occupancy classification are determined by the authority having jurisdiction; if you are unsure whether your project is Assembly, check with your permitting agency early and use Message Designer in PlanPort so your designer can advise whether we can help or refer you to another professional.
`.trim();

/**
 * Flattened knowledge text for LLM grounding (same facts as PLANPORT_HELP_FAQ, no keyword scoring).
 */
export function getHelpKnowledgeBaseDocument(): string {
  const header = `Designer's Ink / PlanPort — curated help facts (not a live web crawl). Public site: ${DESIGNERS_INK_WEB}\n\n`;
  const body = PLANPORT_HELP_FAQ.map((item, i) => {
    const label = item.keywords.slice(0, 8).join(", ");
    return `## Topic ${i + 1} (keywords: ${label})\n${item.answer.trim()}\n`;
  }).join("\n");
  return `${header}${body}\n\n${HELP_ONLY_POLICY_APPENDIX}\n`;
}
