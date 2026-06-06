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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, RefreshCw, FileCode2, ChevronRight, ExternalLink, Database, SearchX, CheckCircle, ShieldAlert, AlertCircle, Quote, Megaphone } from "lucide-react";
import { format } from "date-fns";
import OutreachTab from "@/components/outreach-tab";
import { scoreText, scoreBgClass, scoreTextBorder } from "@/lib/score-color";

export interface ResolvedAccession {
  identifier: string;
  repository: string;
  type: string;
  resolved: boolean;
  title: string | null;
  accessStatus: "public" | "controlled" | "unknown" | "not_found";
  organism: string | null;
  sampleCount: number | null;
  problems: string[];
  apiUrl: string | null;
}

export interface EvidenceItem {
  claim: string;
  evidenceType: "positive" | "missing" | "partial";
  section: string;
  span: string;
  identifier?: string;
  issue?: string;
  confidence: "high" | "medium" | "low";
}

function DimensionBar({ score, label, weight }: { score: number | null | undefined, label: string, weight?: string }) {
  if (score === null || score === undefined) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-1/3 text-sm font-medium">{label} {weight && <span className="text-xs text-muted-foreground ml-1">({weight})</span>}</div>
        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"></div>
        <div className="w-10 text-right text-sm text-muted-foreground">N/A</div>
      </div>
    );
  }

  const getColor = (s: number) => scoreBgClass(s);

  return (
    <div className="flex items-center gap-3">
      <div className="w-1/3 text-sm font-medium">{label} {weight && <span className="text-xs text-muted-foreground ml-1">({weight})</span>}</div>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${getColor(score)}`} style={{ width: `${score}%` }} />
      </div>
      <div className={`w-10 text-right text-sm font-bold ${scoreText(score)}`}>
        {score}
      </div>
    </div>
  );
}

function AccessionBadge({ status }: { status: string }) {
  switch (status) {
    case 'public': return <Badge className="bg-green-500 hover:bg-green-600">Resolved</Badge>;
    case 'controlled': return <Badge variant="outline" className="text-amber-600 border-amber-500">Controlled Access</Badge>;
    case 'not_found': return <Badge variant="destructive">Not Found</Badge>;
    default: return <Badge variant="secondary">Unverified</Badge>;
  }
}

export default function EvaluationDetail() {
  const { id } = useParams<{ id: string }>();
  const evalId = parseInt(id || "0", 10);
  const { toast } = useToast();

  const { data: evaluation, isLoading: isEvalLoading, refetch } = useGetEvaluation(evalId, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: {
      refetchInterval: (query: any) => {
        const status = query?.state?.data?.status;
        return (status === 'pending' || status === 'analyzing') ? 3000 : false;
      }
    } as any,
  });
  
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
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!evaluation) return <div className="p-8 text-center" data-testid="not-found">Evaluation not found</div>;

  // Safe parsing for JSON fields
  let accessions: ResolvedAccession[] = [];
  let evidenceItems: EvidenceItem[] = [];
  
  try {
    // @ts-ignore
    if (evaluation.accessions) accessions = JSON.parse(evaluation.accessions);
    // @ts-ignore
    if (evaluation.evidenceItems) evidenceItems = JSON.parse(evaluation.evidenceItems);
  } catch (e) {
    console.error("Failed to parse evaluation JSON fields", e);
  }

  const positiveEvidence = evidenceItems.filter(e => e.evidenceType === 'positive');
  const gapsEvidence = evidenceItems.filter(e => e.evidenceType !== 'positive');

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-8" data-testid="evaluation-detail-page">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge variant={evaluation.status === 'complete' ? 'default' : evaluation.status === 'error' ? 'destructive' : 'secondary'} className="capitalize" data-testid="eval-status">
              {evaluation.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Evaluated {format(new Date(evaluation.createdAt), "MMM d, yyyy")}
            </span>
            {evaluation.status === 'complete' && (
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground" data-testid="rubric-version">
                {evaluation.rubricVersion ? `Rubric v${evaluation.rubricVersion}` : "Rubric: unversioned"}
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="eval-title">{evaluation.title || "Untitled Paper"}</h1>
          {evaluation.paperUrl && (
            <a href={evaluation.paperUrl} target="_blank" rel="noreferrer" className="text-sm text-primary flex items-center gap-1 hover:underline" data-testid="eval-url">
              <ExternalLink className="w-3 h-3" /> {evaluation.paperUrl}
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRerun} disabled={rerunEval.isPending || evaluation.status === 'analyzing'} data-testid="btn-rerun">
            <RefreshCw className={`w-4 h-4 mr-2 ${rerunEval.isPending || evaluation.status === 'analyzing' ? 'animate-spin' : ''}`} />
            Re-run Analysis
          </Button>
        </div>
      </div>

      {(evaluation.status === 'pending' || evaluation.status === 'analyzing') ? (
        <div className="py-20 text-center space-y-4" data-testid="analyzing-state">
          <Activity className="w-12 h-12 text-primary animate-pulse mx-auto" />
          <h3 className="text-xl font-medium">Analysis in Progress</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            BioEval is reading the paper, extracting data sources, checking datasets, and evaluating computational reproducibility.
          </p>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="md:col-span-1 shadow-sm border-primary/20 bg-card">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg">Overall Score</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center">
                <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center mb-4 ${scoreTextBorder(evaluation.overallScore || 0)}`}>
                  <span className="text-4xl font-bold" data-testid="overall-score">{evaluation.overallScore || 0}</span>
                </div>
                <p className="text-sm text-muted-foreground text-center">Weighted aggregate of all dimensions</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Evaluation Dimensions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DimensionBar score={evaluation.dataSourceScore} label="Data Disclosure" weight="15%" />
                {/* @ts-ignore */}
                <DimensionBar score={evaluation.datasetScore} label="Dataset Resolvability" weight="12%" />
                <DimensionBar score={evaluation.reproducibilityScore} label="Code Availability" weight="12%" />
                {/* @ts-ignore */}
                <DimensionBar score={evaluation.citationScore} label="Traceability" weight="15%" />
                {/* @ts-ignore */}
                <DimensionBar score={evaluation.simulationClarityScore} label="Simulation Clarity" weight="14%" />
                {/* @ts-ignore */}
                <DimensionBar score={evaluation.reproPackageScore} label="Repro Package Quality" weight="7%" />
                {/* @ts-ignore */}
                <DimensionBar score={evaluation.informationTheoryScore} label="Information-Theoretic Rigor" weight="25%" />
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="report" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="report" data-testid="tab-report">Audit Report</TabsTrigger>
              <TabsTrigger value="datasets" data-testid="tab-datasets">Datasets ({accessions.length})</TabsTrigger>
              <TabsTrigger value="evidence" data-testid="tab-evidence">Evidence Items</TabsTrigger>
              <TabsTrigger value="code" data-testid="tab-code">Code Analysis</TabsTrigger>
              <TabsTrigger value="outreach" data-testid="tab-outreach">
                <Megaphone className="w-3.5 h-3.5 mr-1.5" /> Outreach
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="report" className="space-y-6" data-testid="content-report">
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
            </TabsContent>

            <TabsContent value="datasets" className="space-y-6" data-testid="content-datasets">
              <Card>
                <CardHeader>
                  <CardTitle>Dataset Inventory</CardTitle>
                  <CardDescription>All external data sources and accession IDs detected in the paper.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table data-testid="accessions-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Repository</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accessions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                            <SearchX className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            No accession IDs detected
                          </TableCell>
                        </TableRow>
                      ) : (
                        accessions.map((acc, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-sm font-medium">
                              {acc.apiUrl ? (
                                <a href={acc.apiUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                  {acc.identifier} <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : acc.identifier}
                            </TableCell>
                            <TableCell>{acc.repository}</TableCell>
                            <TableCell className="capitalize text-muted-foreground">{acc.type}</TableCell>
                            <TableCell>
                              <AccessionBadge status={acc.accessStatus} />
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div className="font-medium line-clamp-1">{acc.title || "-"}</div>
                                {(acc.organism || acc.sampleCount) && (
                                  <div className="text-xs text-muted-foreground">
                                    {acc.organism} {acc.sampleCount ? `(${acc.sampleCount} samples)` : ''}
                                  </div>
                                )}
                                {acc.problems && acc.problems.length > 0 && (
                                  <div className="text-xs text-red-500 mt-1 flex items-start gap-1">
                                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                    <span className="line-clamp-1">{acc.problems[0]}</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="evidence" className="space-y-6" data-testid="content-evidence">
              {evidenceItems.length === 0 ? (
                <Card>
                  <CardContent className="h-40 flex flex-col items-center justify-center text-muted-foreground">
                    <Database className="w-8 h-8 mb-2 opacity-20" />
                    <p>No structured evidence extracted.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle className="w-5 h-5" /> Positive Evidence
                    </h3>
                    {positiveEvidence.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">None found.</p>
                    ) : (
                      positiveEvidence.map((item, i) => (
                        <Card key={i} className="border-l-4 border-l-green-500 overflow-hidden">
                          <CardHeader className="p-4 pb-2 bg-muted/30">
                            <div className="flex justify-between items-start">
                              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.section}</div>
                              <Badge variant="outline" className="text-[10px]">{item.confidence} conf</Badge>
                            </div>
                            <CardTitle className="text-sm mt-1">{item.claim}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 pt-2">
                            <blockquote className="border-l-2 border-primary/20 pl-3 italic text-sm text-muted-foreground bg-primary/5 p-2 rounded-r">
                              "{item.span}"
                            </blockquote>
                            {item.identifier && (
                              <div className="mt-3 text-xs font-mono bg-muted inline-block px-2 py-1 rounded">
                                ID: {item.identifier}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                      <ShieldAlert className="w-5 h-5" /> Gaps & Concerns
                    </h3>
                    {gapsEvidence.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">None found.</p>
                    ) : (
                      gapsEvidence.map((item, i) => (
                        <Card key={i} className={`border-l-4 overflow-hidden ${item.evidenceType === 'missing' ? 'border-l-red-500' : 'border-l-amber-500'}`}>
                          <CardHeader className="p-4 pb-2 bg-muted/30">
                            <div className="flex justify-between items-start">
                              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.section}</div>
                              <Badge variant="outline" className={`text-[10px] ${item.evidenceType === 'missing' ? 'text-red-500 border-red-200' : 'text-amber-500 border-amber-200'}`}>
                                {item.evidenceType}
                              </Badge>
                            </div>
                            <CardTitle className="text-sm mt-1">{item.claim}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 pt-2">
                            {item.span && (
                              <blockquote className="border-l-2 border-border pl-3 italic text-sm text-muted-foreground bg-muted p-2 rounded-r mb-3">
                                "{item.span}"
                              </blockquote>
                            )}
                            {item.issue && (
                              <div className="text-sm text-red-600 dark:text-red-400 flex items-start gap-1.5 mt-2 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{item.issue}</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="code" className="space-y-6" data-testid="content-code">
              
              {/* @ts-ignore */}
              {evaluation.codeRepoUrl ? (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <FileCode2 className="w-5 h-5 text-primary" />
                        Code Repository Detected
                      </h3>
                      {/* @ts-ignore */}
                      <p className="text-sm text-muted-foreground mt-1">Found linked repository in the paper.</p>
                    </div>
                    <Button variant="default" asChild>
                      {/* @ts-ignore */}
                      <a href={evaluation.codeRepoUrl} target="_blank" rel="noreferrer">
                        View Repository <ExternalLink className="w-4 h-4 ml-2" />
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-4 flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">No code repository detected in paper.</p>
                  </CardContent>
                </Card>
              )}

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
                              Traceability Score: <span className={`font-bold ${scoreText(analysis.overallTraceability || 0)}`}>{analysis.overallTraceability || '-'}</span>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/evaluations/${evalId}/code/${analysis.id}`}>
                                View Matrix <ChevronRight className="w-4 h-4 ml-1" />
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
                          <Input value={codeTitle} onChange={e => setCodeTitle(e.target.value)} placeholder="e.g. figure1_sim.R" data-testid="input-code-title" />
                        </div>
                        <div className="space-y-2">
                          <Label>Language</Label>
                          <Input value={codeLanguage} onChange={e => setCodeLanguage(e.target.value)} placeholder="R, Python, Bash..." data-testid="input-code-lang" />
                        </div>
                        <div className="space-y-2">
                          <Label>Code Snippet</Label>
                          <Textarea 
                            value={codeSnippet} 
                            onChange={e => setCodeSnippet(e.target.value)} 
                            placeholder="Paste code here..."
                            className="font-mono text-xs h-32"
                            required
                            data-testid="input-code-snippet"
                          />
                        </div>
                        <Button type="submit" disabled={createCodeAnalysis.isPending || !codeSnippet} className="w-full" data-testid="btn-submit-code">
                          {createCodeAnalysis.isPending ? 'Submitting...' : 'Analyze Code'}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="outreach" data-testid="content-outreach-tab">
              <OutreachTab evalId={evalId} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}