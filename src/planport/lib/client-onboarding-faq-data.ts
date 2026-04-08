/**
 * Single source for Client Onboarding Packet FAQ copy (FAQs tab).
 * Used by the in-app UI and the Help assistant knowledge context.
 */

export const OK_ARCHITECT_STATUTES_URL =
  "https://oklahoma.gov/architects/publications/statutes-and-laws.html";

export type FaqRichSegment = { text: string; bold?: boolean };

export type FaqBodyBlock =
  | { kind: "plain"; text: string }
  | { kind: "rich"; segments: FaqRichSegment[] }
  | {
      kind: "link";
      before: string;
      linkText: string;
      href: string;
      after: string;
    };

export type ClientOnboardingFaqSection = {
  heading: string;
  blocks: FaqBodyBlock[];
};

export const CLIENT_ONBOARDING_FAQ_SECTIONS: ClientOnboardingFaqSection[] = [
  {
    heading: "Office Hours",
    blocks: [
      {
        kind: "rich",
        segments: [
          {
            text:
              "To accommodate our clients' schedules and to offer expanded hours for our clients in other time zones, our office hours during the week are generally from 8:00 AM until 10:00 PM by appointment only. Our designers split hours to cover morning, afternoon and evening appointments. Designer ",
          },
          { text: "Kevin Walthall", bold: true },
          {
            text:
              " is generally available for appointments from 8:00 AM until 5:00 PM (Monday through Friday). Designer ",
          },
          { text: "Jeff Dillon", bold: true },
          {
            text:
              " is generally available from 1:00 PM until 10:00 PM (Monday through Friday). Jeff is also available on weekends by appointment.",
          },
        ],
      },
    ],
  },
  {
    heading: "Communication",
    blocks: [
      {
        kind: "plain",
        text:
          "We typically have around 120 active projects going in our office at one time. As you can imagine, it would be extremely difficult to track communications with clients from phone calls, text messages, and emails throughout the day. All routine communications are handled through your customized Client Portal. This allows us to keep all communications attached to your project in one place so that everyone on the team who is working on your project stays on the same page. Certainly, if you have an urgent situation or something comes up that can't be handled in the portal, you can always call us.",
      },
    ],
  },
  {
    heading: "Fees",
    blocks: [
      {
        kind: "plain",
        text:
          "On new residential construction projects, we estimate the fees for all 3D modeling, design work and construction documents at $1.50 per heated square foot. This includes everything through your approved design and one set of construction documents. Once we have completed construction documents, any changes to the design after that will be billed out at our hourly rate of $115 per hour.",
      },
      {
        kind: "plain",
        text:
          "We bill out our hours every two weeks, generally on the 1st and 15th of each month. You will receive your invoice via email and can pay online or by check. All invoices are due within 10 days of receipt.",
      },
      {
        kind: "plain",
        text:
          "Once your invoices are paid in full, you will receive a non-watermarked, downloadable PDF of the construction documents as well as any renderings we have done for you during your project. During the process, you will be able to access drafts through our PlanPort app to review and approve.",
      },
    ],
  },
  {
    heading: "Holiday Policy",
    blocks: [
      {
        kind: "plain",
        text:
          "Holidays do sometimes affect client project deadlines, so plan accordingly. Our offices are closed on nationally recognized holidays.",
      },
    ],
  },
  {
    heading: "Vacation Policy",
    blocks: [
      {
        kind: "plain",
        text:
          "We'll provide you with notice of any upcoming vacations so that we can plan work together appropriately and ensure that you have everything you need while we're out. Generally, your project is handled by a team of designers and drafting specialists, so even if one of us is on vacation, there are others still working on your project.",
      },
    ],
  },
  {
    heading: "Rush Policy",
    blocks: [
      {
        kind: "plain",
        text:
          "The design process takes time. We work as fast as we can on all projects to get them out to our clients as soon as possible. We work on many projects at one time for various clients, and we try to prioritize those projects to meet any specific deadlines you might have. If you have a rush request (less than 24 hours notice) which requires us to pay our employees overtime to accommodate, you may be charged an additional fee for that time to cover our additional costs. If that occurs, you will be advised of that fee in advance.",
      },
    ],
  },
  {
    heading: "Payment Policy",
    blocks: [
      {
        kind: "plain",
        text:
          "Unlike many designers, we do not require upfront payment for clients in good standing. All projects are billed out at our current hourly rate every two weeks throughout the design process. You will receive an invoice via email, and you can make a payment instantly by credit card, debit card, or ACH (electronic check) by clicking the Pay Now button on the invoice.",
      },
      {
        kind: "plain",
        text:
          "We encourage clients to utilize the ACH (electronic check) method of payment or writing a paper check to avoid us paying the convenience fee charged by the processing services. ACH is the most secure way of making payment since your account number is encrypted and never seen by us. ACH payments are also immediately credited to your account. Paper checks can get lost in the mail and your account number is written on the bottom of each check.",
      },
      {
        kind: "plain",
        text:
          "Since we don't require any upfront payment, payment is due upon receipt and considered late after 10 days. If payment is not received within 10 days, no additional work will be performed on your project until payment is received. After 30 days, a 3% late fee is automatically applied to the account. If your account is assessed a late fee, you may be asked to pay for future work in advance.",
      },
    ],
  },
  {
    heading: "Printing",
    blocks: [
      {
        kind: "plain",
        text:
          'As we move into the digital age, more and more jurisdictions are requiring digital submittals for plans. You will receive a PDF of your plan set to share with your permitting agency and builder. You can print as many of those plan sets as you like at a variety of different print shops. For our local clients, we can also print plan sets at our cost, which is currently $4.25 per sheet for 36" × 24" paper and $6.25 per sheet for 48" × 36" paper.',
      },
    ],
  },
  {
    heading: "Material Takeoffs",
    blocks: [
      {
        kind: "plain",
        text:
          "Material takeoffs can be obtained from building supply companies that will use our plan sets to calculate all of the materials needed for your project. Many will charge a small fee for this service, but most will then apply the fee towards the purchase of the materials. We do not provide material takeoff services.",
      },
    ],
  },
  {
    heading: "Collaboration",
    blocks: [
      {
        kind: "plain",
        text:
          "Building your project is a team effort that includes many different people. The design part that we handle is just one part of a much larger system of builders, subcontractors, inspectors, engineers, bankers, realtors, and others who will likely be involved in your project. We will work with any of these other partners to try to communicate clearly what you want to see in the end result of your build.",
      },
      {
        kind: "plain",
        text:
          "For example, your builder may want to have certain parts of your design engineered such as the large beams, foundation details, foundation walls, lot drainage, etc. We don't provide those services, but we will assist your builder with connecting with an engineer and provide that engineer with CAD drawings so that they can complete their part of the project. Your HVAC contractor will be in charge of designing your HVAC system since they are the most qualified to handle that part of the project, but we will work with them to ensure they have the required mechanical spaces they need for the systems they specify for your project. Your plumber will specify items related to the plumbing of your home. We do provide them with a layout and dimensions of plumbing fixtures for slab foundation to assist them with the placement of drainage pipes.",
      },
    ],
  },
  {
    heading: "General Contractor",
    blocks: [
      {
        kind: "plain",
        text:
          "This will be a huge investment, and our experience has shown that hiring the right General Contractor makes a huge difference in how smoothly the project goes. Although it is common to have your design completed before you select a General Contractor, the General Contractor is the one in charge of the entire project. Cost is only one of many items to consider when determining who to hire for this critical component of the project. You will be working with this person throughout the building process, so you want to select a person that shares your vision, is easy to communicate with, has a history of building quality projects in a timely manner, and who stands behind their work.",
      },
      {
        kind: "plain",
        text:
          "We will work with any General Contractor you choose to hire for your project. Once a General Contractor is selected, we will work with them to ensure the plan set contains all the information they want included to obtain any necessary permits (if required) and to build your project.",
      },
      {
        kind: "rich",
        segments: [
          {
            text:
              "Before you make a decision on becoming your own General Contractor, we encourage you to do a lot of research so that you know all of the pros and cons for taking on that responsibility. There are many hidden costs which need to be considered, and we'd be happy to discuss those with you to ensure you are making an informed decision. Unless you have extensive experience with construction management, ",
          },
          {
            text: "we do not generally recommend clients be their own General Contractors.",
            bold: true,
          },
        ],
      },
    ],
  },
  {
    heading: "Architect Requirements",
    blocks: [
      {
        kind: "link",
        before:
          "We are based in Stillwater, Oklahoma; however, we work with clients all over the United States and even in other countries. If your project is located in Oklahoma, we are allowed, as a Building Designer, by state law under the ",
        linkText: "Oklahoma State Architectural and Registered Commercial Interior Designers Act",
        href: OK_ARCHITECT_STATUTES_URL,
        after:
          " to work on certain residential and light commercial projects. Each state and even some local jurisdictions have their own set of laws and standards on when a licensed architect is required for certain projects. It is important that we have a good understanding of the scope of your project up front to determine if an architect will be required. If one is, we can refer you to a local, licensed architect. If there is a question on whether or not an architect is required for your project, the local permitting agency should be contacted to make that determination before you begin the design process. Architects generally are not allowed to stamp the work of another designer.",
      },
    ],
  },
];

function blockToPlaintext(block: FaqBodyBlock): string {
  if (block.kind === "plain") return block.text;
  if (block.kind === "rich") return block.segments.map((s) => s.text).join("");
  return `${block.before}${block.linkText} (${block.href})${block.after}`;
}

/** Full onboarding FAQ as plain text for LLM context. */
export function getClientOnboardingFaqPlaintextDocument(): string {
  return CLIENT_ONBOARDING_FAQ_SECTIONS.map((sec) => {
    const body = sec.blocks.map(blockToPlaintext).join("\n\n");
    return `### ${sec.heading}\n${body}`;
  }).join("\n\n");
}
