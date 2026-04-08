
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, BrainCircuit, ChevronRight, Loader2 } from "lucide-react";
import { extractBlueprintInsights } from "@/ai/flows/ai-blueprint-insight";

interface InsightPanelProps {
  blueprintId: string;
}

export function InsightPanel({ blueprintId }: InsightPanelProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      // In a real scenario, we'd fetch the base64 of the PDF.
      // For this demo, we simulate a small base64 PDF input.
      const mockPdfUri = "data:application/pdf;base64,JVBERi0xLjQKJ..."; 
      const result = await extractBlueprintInsights({ pdfDataUri: mockPdfUri });
      setInsight(result.summary);
    } catch (error) {
      setInsight("Error extracting insights. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardHeader className="pb-2 border-b border-border">
        <CardTitle className="text-lg flex items-center gap-2 text-primary">
          <Sparkles className="w-5 h-5 text-accent" />
          AI Blueprint Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {!insight && !loading && (
          <div className="text-center py-6 space-y-4">
            <div className="bg-accent/20 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
              <BrainCircuit className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground px-4">
              Extract key measurements and critical specifications automatically.
            </p>
            <Button 
              onClick={handleGenerate} 
              className="bg-primary hover:bg-primary/90 text-white w-full"
            >
              Analyze This Blueprint
            </Button>
          </div>
        )}

        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <p className="text-sm font-medium animate-pulse text-primary">AI is analyzing layers...</p>
          </div>
        )}

        {insight && !loading && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="prose prose-sm text-primary/80">
              <p className="leading-relaxed whitespace-pre-line bg-secondary p-4 rounded-md border border-border text-foreground">
                {insight}
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setInsight(null)}
              className="text-xs border-border"
            >
              Regenerate Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
