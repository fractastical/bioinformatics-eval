import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetEvaluation, useListCodeAnalyses, useCreateCodeAnalysis, useRerunEvaluation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Database, Activity, RefreshCw, FileCode2, ChevronRight, ExternalLink } from "lucide-react";
import { format } from "date-fns";

function ScoreGauge({ score, label, description }: { score: number | null | undefined, label: string, description?: string }) {
  if (score === null || score === undefined) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-muted/20 rounded-xl border border-border">
        <div className="w-24 h-24 rounded-full border-4 border-muted flex items-center justify-center mb-4">
          <span className="text-muted-foreground">N/A</span>
        </div>
        <div className="text-center">
          <div className="font-semibold">{label}</div>
        </div>
      </div>
    );
  }

  const getColor = (s: number) => {
    if (s > 70) return "text-green-500 border-green-500";
    if (s > 40) return "text-amber-500 border-amber-500";
    return "text-red-500 border-red-500";
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-card rounded-xl border border-border shadow-sm">
      <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center mb-4 ${getColor(score)}`}>
        <span className="text-3xl font-bold">{score}</span>
      </div>
      <div className="text-center">
        <div className="font-semibold">{label}</div>
        {description && <div className="text-xs text-muted-foreground mt-1">{description}</div>}
      </div>
    </div>
  );
}

export default function EvaluationDetail() {
  const { id } = useParams<{ id: string }>();
  const evalId = parseInt(id || "0", 10);
  const { toast } = useToast();

  const { data: evaluation, isLoading: isEvalLoading, refetch } = useGetEvaluation(evalId);
  const { data: codeAnalyses, isLoading: isCodeLoading } = useListCodeAnalyses(evalId);
  const createCodeAnalysis = useCreateCodeAnalysis();
  const rerunEval = useRerunEvaluation();

  const [codeTitle, setCodeTitle] = useState("");
  const [codeLanguage, setCodeLanguage] = useState("python");
  const [codeSnippet, setCodeSnippet] = useState("");

  const handleRerun = () => {
    rerunEval.mutate({ id: evalId }, {
      onSuccess: () => {
        toast({ title: "Analysis Restarted", description: "The evaluation is running again." });
        refetch();
      }
    });
  };

  const handleSubmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeSnippet) return;

    createCodeAnalysis.mutate({
      id: evalId,
      data: { title: codeTitle, language: codeLanguage, codeSnippet }
    }, {
      onSuccess: () => {
        toast({ title: "Code Submitted", description: "Analysis started." });
        setCodeTitle("");
        setCodeSnippet("");
      }
    });
  };

  if (isEvalLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      </div>
    );
  }

  if (!evaluation) return <div>Not found</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant={evaluation.status === 'complete' ? 'default' : evaluation.status === 'error' ? 'destructive' : 'secondary'} className="capitalize">
              {evaluation.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Evaluated {format(new Date(evaluation.createdAt), "MMM d, yyyy")}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{evaluation.title || "Untitled Paper"}</h1>
          {evaluation.paperUrl && (
            <a href={evaluation.paperUrl} target="_blank" rel="noreferrer" className="text-sm text-primary flex items-center gap-1 hover:underline">
              <ExternalLink className="w-3 h-3" /> {evaluation.paperUrl}
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRerun} disabled={rerunEval.isPending || evaluation.status === 'analyzing'}>
            <RefreshCw className={`w-4 h-4 mr-2 ${rerunEval.isPending || evaluation.status === 'analyzing' ? 'animate-spin' : ''}`} />
            Re-run Analysis
          </Button>
        </div>
      </div>

      {(evaluation.status === 'pending' || evaluation.status === 'analyzing') ? (
        <div className="py-20 text-center space-y-4">
          <Activity className="w-12 h-12 text-primary animate-pulse mx-auto" />
          <h3 className="text-xl font-medium">Analysis in Progress</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            BioEval is reading the paper, extracting data sources, checking datasets, and evaluating computational reproducibility. This usually takes a minute.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ScoreGauge score={evaluation.overallScore} label="Overall Score" />
            <ScoreGauge score={evaluation.dataSourceScore} label="Data Sources" description={`${evaluation.dataSourcesFound || 0} found`} />
            <ScoreGauge score={evaluation.datasetScore} label="Dataset Access" description={`${evaluation.datasetsFound || 0} found`} />
            <ScoreGauge score={evaluation.reproducibilityScore} label="Reproducibility" description={`${evaluation.citationsFound || 0} citations`} />
          </div>

          <Tabs defaultValue="report" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="report">Audit Report</TabsTrigger>
              <TabsTrigger value="code">Simulation Code Analysis</TabsTrigger>
            </TabsList>
            
            <TabsContent value="report" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                </CardHeader>
                <CardContent className="prose dark:prose-invert max-w-none text-sm">
                  {evaluation.summary || "No summary available."}
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="border-green-500/20">
                  <CardHeader className="bg-green-500/5">
                    <CardTitle className="text-green-700 dark:text-green-400">Findings & Strengths</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 prose dark:prose-invert max-w-none text-sm">
                    {evaluation.findings || "No findings recorded."}
                  </CardContent>
                </Card>

                <Card className="border-red-500/20">
                  <CardHeader className="bg-red-500/5">
                    <CardTitle className="text-red-700 dark:text-red-400">Gaps & Issues</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 prose dark:prose-invert max-w-none text-sm">
                    {evaluation.gaps || "No gaps recorded."}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recommendations</CardTitle>
                </CardHeader>
                <CardContent className="prose dark:prose-invert max-w-none text-sm">
                  {evaluation.recommendations || "No recommendations provided."}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="code" className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                  <h3 className="text-lg font-medium mb-4">Analyzed Code Segments</h3>
                  {isCodeLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : codeAnalyses && codeAnalyses.length > 0 ? (
                    codeAnalyses.map(analysis => (
                      <Card key={analysis.id} className="hover:border-primary transition-colors">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-base">{analysis.title || `Analysis #${analysis.id}`}</CardTitle>
                              <CardDescription className="font-mono text-xs mt-1">{analysis.language}</CardDescription>
                            </div>
                            <Badge variant={analysis.status === 'complete' ? 'default' : 'secondary'}>
                              {analysis.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between mt-2">
                            <div className="text-sm">
                              Traceability Score: <span className="font-bold">{analysis.overallTraceability || '-'}</span>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/evaluations/${evalId}/code/${analysis.id}`}>
                                View Details <ChevronRight className="w-4 h-4 ml-1" />
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
                      <FileCode2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">No code analyses run for this paper yet.</p>
                    </div>
                  )}
                </div>

                <div>
                  <Card className="sticky top-6">
                    <CardHeader>
                      <CardTitle className="text-base">Submit Code for Audit</CardTitle>
                      <CardDescription>Upload simulation scripts to verify traceability against the paper.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleSubmitCode} className="space-y-4">
                        <div className="space-y-2">
                          <Label>Title/Filename</Label>
                          <Input value={codeTitle} onChange={e => setCodeTitle(e.target.value)} placeholder="e.g. figure1_sim.R" />
                        </div>
                        <div className="space-y-2">
                          <Label>Language</Label>
                          <Input value={codeLanguage} onChange={e => setCodeLanguage(e.target.value)} placeholder="R, Python, Bash..." />
                        </div>
                        <div className="space-y-2">
                          <Label>Code Snippet</Label>
                          <Textarea 
                            value={codeSnippet} 
                            onChange={e => setCodeSnippet(e.target.value)} 
                            placeholder="Paste code here..."
                            className="font-mono text-xs h-32"
                            required
                          />
                        </div>
                        <Button type="submit" disabled={createCodeAnalysis.isPending || !codeSnippet} className="w-full">
                          {createCodeAnalysis.isPending ? 'Submitting...' : 'Analyze Code'}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}