import React from "react";
import { useParams, Link } from "wouter";
import { useGetCodeAnalysis, useGetEvaluation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Database, BookOpen, AlertTriangle, ShieldCheck } from "lucide-react";

export default function CodeAnalysisDetail() {
  const { id, analysisId } = useParams<{ id: string; analysisId: string }>();
  const evalId = parseInt(id || "0", 10);
  const aId = parseInt(analysisId || "0", 10);

  const { data: evaluation } = useGetEvaluation(evalId);
  const { data: analysis, isLoading } = useGetCodeAnalysis(evalId, aId);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!analysis) return <div>Not found</div>;

  let segments = [];
  try {
    if (analysis.segments) {
      segments = JSON.parse(analysis.segments);
    }
  } catch (e) {
    console.error("Failed to parse segments", e);
  }

  const getConfidenceColor = (conf: string) => {
    switch(conf?.toLowerCase()) {
      case 'high': return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
      case 'medium': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
      case 'low': return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-6">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-muted-foreground">
        <Link href={`/evaluations/${evalId}`}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Evaluation
        </Link>
      </Button>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className="font-mono">{analysis.language}</Badge>
            <Badge variant={analysis.status === 'complete' ? 'default' : 'secondary'}>{analysis.status}</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{analysis.title || "Code Analysis"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Evaluating traceability against <span className="font-medium text-foreground">{evaluation?.title}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground mb-1">Traceability Score</div>
          <div className={`text-4xl font-bold ${
            (analysis.overallTraceability || 0) > 70 ? 'text-green-500' : 
            (analysis.overallTraceability || 0) > 40 ? 'text-amber-500' : 'text-red-500'
          }`}>
            {analysis.overallTraceability || 0}
          </div>
        </div>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6 prose dark:prose-invert max-w-none text-sm">
          {analysis.summary || "No summary generated for this analysis."}
        </CardContent>
      </Card>

      <div className="space-y-4 pt-4">
        <h2 className="text-xl font-semibold">Segment Traceability</h2>
        
        {segments.length > 0 ? (
          <div className="space-y-6">
            {segments.map((seg: any, i: number) => (
              <Card key={i} className="overflow-hidden border-border shadow-sm">
                <div className="bg-muted px-4 py-2 border-b border-border flex justify-between items-center">
                  <span className="font-mono text-xs font-semibold">{seg.label || `Segment ${i+1}`}</span>
                  <Badge variant="outline" className={getConfidenceColor(seg.confidence)}>
                    {seg.confidence} Confidence
                  </Badge>
                </div>
                <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                  <div className="p-4 bg-muted/10">
                    <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                      {seg.code || "No code snippet provided"}
                    </pre>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                        <Database className="w-3 h-3" /> Data Source
                      </h4>
                      <p className="text-sm">{seg.dataSource || "None identified"}</p>
                    </div>
                    <div>
                      <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                        <BookOpen className="w-3 h-3" /> Paper Citation
                      </h4>
                      <p className="text-sm">{seg.citation || "No citation mapping found"}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
            <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No segment breakdown available for this code.</p>
          </div>
        )}
      </div>
    </div>
  );
}