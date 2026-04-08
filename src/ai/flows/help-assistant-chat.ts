"use server";

import { z } from "zod";
import {
  getClientOnboardingFaqPlaintextDocument,
  OK_ARCHITECT_STATUTES_URL,
} from "@/lib/client-onboarding-faq-data";
import { DESIGNERS_INK_WEB, getHelpKnowledgeBaseDocument } from "@/lib/planport-help-knowledge";

const HelpChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

const HelpAssistantChatInputSchema = z.object({
  messages: z.array(HelpChatMessageSchema).min(1).max(24),
});

export type HelpAssistantChatInput = z.infer<typeof HelpAssistantChatInputSchema>;

export type HelpAssistantChatResult =
  | { ok: true; reply: string }
  | { ok: false; reason: "llm_unconfigured" | "invalid_input" | "llm_error" };

function helpLlmApiKeyPresent(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY
  );
}

function webSearchGroundingEnabled(): boolean {
  return process.env.HELP_ASSISTANT_DISABLE_WEB_SEARCH !== "1";
}

function formatConversation(messages: HelpAssistantChatInput["messages"]): string {
  const recent = messages.slice(-16);
  return recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`)
    .join("\n\n");
}

function buildInternalKnowledgeCorpus(): string {
  const condensed = getHelpKnowledgeBaseDocument();
  const fullFaq = getClientOnboardingFaqPlaintextDocument();
  return [
    "# PlanPort quick-reference topics",
    condensed,
    "",
    "# Full Client Onboarding Packet — FAQs tab (in-app)",
    fullFaq,
  ].join("\n");
}

const SYSTEM_INSTRUCTIONS = `You are the PlanPort Help Assistant for Designer's Ink clients and contractors.

Information sources (use in this order):
1) INTERNAL KNOWLEDGE — curated PlanPort topics plus the full in-app Client Onboarding FAQ text. Treat this as authoritative for policies, fees, office practices, and how PlanPort works.
2) GOOGLE SEARCH — You have access to Google Search grounding. Use it to answer questions about:
   - Current public information on ${DESIGNERS_INK_WEB} (services, team, portfolio pages, contact, Chief Architect offerings, etc.).
   - Broader public web context when it helps clarify industry terms or general how-tos — but never contradict INTERNAL KNOWLEDGE for Designer's Ink policies, fees, or PlanPort behavior.

Rules:
- Prefer INTERNAL KNOWLEDGE when it answers the question. When you also use search results, make clear which came from the website vs. the packet.
- When users ask whether Designer's Ink can design a specific commercial or public building type (e.g. restaurant, retail, office, church, school), explain that scope depends on code classification and that licensed-design requirements vary by state and locality. Tell them to review their state's architectural board / practice statutes and to confirm with the local permitting authority. For projects in Oklahoma, point them to the Oklahoma Board of Architects Act & Rules publications at ${OK_ARCHITECT_STATUTES_URL} (do not substitute a different URL).
- For project-specific questions (this client's job, timelines, files), say to use Message Designer in PlanPort.
- If search results conflict with INTERNAL KNOWLEDGE, trust INTERNAL KNOWLEDGE and mention that the website should be double-checked for the latest marketing copy.
- Be concise, friendly, and natural. When web search materially informs the answer, mention the source in plain language (e.g. "Designer's Ink's site lists…"). Do not fabricate URLs.
- Never invent invoice amounts, legal advice, or portal features not described in internal knowledge.`;

export async function runHelpAssistantChat(
  raw: HelpAssistantChatInput
): Promise<HelpAssistantChatResult> {
  const parsed = HelpAssistantChatInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "invalid_input" };
  }

  if (!helpLlmApiKeyPresent()) {
    return { ok: false, reason: "llm_unconfigured" };
  }

  const internalKnowledge = buildInternalKnowledgeCorpus();
  const conversation = formatConversation(parsed.data.messages);

  try {
    const flow = await getHelpAssistantFlow();
    const reply = await flow({ internalKnowledge, conversation });
    const trimmed = reply.trim();
    if (!trimmed) {
      return { ok: false, reason: "llm_error" };
    }
    return { ok: true, reply: trimmed };
  } catch {
    return { ok: false, reason: "llm_error" };
  }
}

type HelpFlowInput = { internalKnowledge: string; conversation: string };

let cachedFlow: ((input: HelpFlowInput) => Promise<string>) | null = null;

async function getHelpAssistantFlow() {
  if (cachedFlow) return cachedFlow;

  const [{ ai }, genkitZ] = await Promise.all([import("@/ai/genkit"), import("genkit")]);

  const useSearch = webSearchGroundingEnabled();

  const flow = ai.defineFlow(
    {
      name: "helpAssistantChatFlow",
      inputSchema: (genkitZ as unknown as { z: typeof z }).z.object({
        internalKnowledge: z.string(),
        conversation: z.string(),
      }),
      outputSchema: (genkitZ as unknown as { z: typeof z }).z.object({
        reply: z.string(),
      }),
    },
    async (input: HelpFlowInput) => {
      const userPrompt = `INTERNAL KNOWLEDGE (authoritative for Designer's Ink + PlanPort):
${input.internalKnowledge}

CONVERSATION (chronological; respond to the latest User message):
${input.conversation}

Answer the latest User message as the Assistant. When using web search, prioritize results from ${new URL(DESIGNERS_INK_WEB).host} for firm-specific facts not fully covered above.`;

      const response = await ai.generate({
        model: "googleai/gemini-2.5-flash",
        config: useSearch
          ? {
              googleSearchRetrieval: true,
            }
          : {},
        system: SYSTEM_INSTRUCTIONS,
        prompt: userPrompt,
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error("helpAssistantChatFlow empty response");
      }
      return { reply: text };
    }
  );

  cachedFlow = async (input: HelpFlowInput) => {
    const out = await flow(input);
    return out.reply;
  };
  return cachedFlow;
}
