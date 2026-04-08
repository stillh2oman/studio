'use server';
/**
 * @fileOverview This file provides a Genkit flow for extracting key insights from a blueprint PDF.
 *
 * - extractBlueprintInsights - A function that extracts and summarizes key specifications, measurements,
 *   and critical notes from a blueprint PDF.
 * - ExtractBlueprintInsightsInput - The input type for the extractBlueprintInsights function.
 * - ExtractBlueprintInsightsOutput - The return type for the extractBlueprintInsights function.
 */

import { z } from "zod";

const ExtractBlueprintInsightsInputSchema = z.object({
  pdfDataUri: z
    .string()
    .describe(
      "A blueprint PDF, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractBlueprintInsightsInput = z.infer<typeof ExtractBlueprintInsightsInputSchema>;

const ExtractBlueprintInsightsOutputSchema = z.object({
  summary: z
    .string()
    .describe('A concise summary of key specifications, measurements, and critical notes from the blueprint.')
    .default('No significant insights could be extracted.'),
});
export type ExtractBlueprintInsightsOutput = z.infer<typeof ExtractBlueprintInsightsOutputSchema>;

export async function extractBlueprintInsights(
  input: ExtractBlueprintInsightsInput
): Promise<ExtractBlueprintInsightsOutput> {
  const flow = await getBlueprintInsightFlow();
  return flow(input);
}

let cachedFlow:
  | ((input: ExtractBlueprintInsightsInput) => Promise<ExtractBlueprintInsightsOutput>)
  | null = null;

async function getBlueprintInsightFlow() {
  if (cachedFlow) return cachedFlow;

  const [{ ai }, genkitZ] = await Promise.all([
    import("@/ai/genkit"),
    import("genkit"),
  ]);

  const extractBlueprintInsightsPrompt = ai.definePrompt({
    name: "extractBlueprintInsightsPrompt",
    input: { schema: ExtractBlueprintInsightsInputSchema },
    output: { schema: ExtractBlueprintInsightsOutputSchema },
    prompt: `You are an expert assistant for contractors. Your task is to analyze the provided blueprint PDF and extract the most important information for a contractor.
Specifically, identify and summarize:
1.  Key specifications (e.g., materials, finishes, structural components).
2.  Important measurements (e.g., dimensions, clearances, heights).
3.  Any critical notes or special instructions.

Present this information as a concise summary. Prioritize details that would be crucial for a contractor to quickly understand the project and avoid common errors.

Blueprint PDF: {{media url=pdfDataUri}}`,
  });

  const flow = ai.defineFlow(
    {
      name: "aiBlueprintInsightFlow",
      // Use Genkit's zod bindings for output schema typing at runtime.
      inputSchema: (genkitZ as unknown as { z: typeof z }).z.object({
        pdfDataUri: z.string(),
      }),
      outputSchema: (genkitZ as unknown as { z: typeof z }).z.object({
        summary: z.string(),
      }),
    },
    async (input: ExtractBlueprintInsightsInput) => {
      const { output } = await extractBlueprintInsightsPrompt(input);
      if (!output) {
        return {
          summary: "Failed to extract blueprint insights or no specific details found.",
        };
      }
      return output as ExtractBlueprintInsightsOutput;
    }
  );

  cachedFlow = flow as unknown as (
    input: ExtractBlueprintInsightsInput
  ) => Promise<ExtractBlueprintInsightsOutput>;
  return cachedFlow;
}
