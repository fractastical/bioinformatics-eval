import React, { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useGetCodeAnalysis, useGetEvaluation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Database, BookOpen, AlertTriangle, FileCode2, LayoutList, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { scoreTextBorder } from "@/lib/score-color";

export interface CodeSegment {
  label: string;
  role: string;
  code: string;
  filesRead?: string[];
  filesWritten?: string[];
  hardCodedParams?: Array<{ name: string; value: string; line: number | null }>;
  dataSource: string;
  citation: string;
  paramSource: string;
  confidence: "high" | "medium" | "low";
  issues?: string[];
}

export interface TraceabilityRow {
  codeUnit: string;
  role: string;
  inputOrParam: string;
  claimedSource: string;
  evidence: string;
  paramSource: string;
  confidence: string;
  status: "traceable" | "weak" | "unexplained" | "undisclosed";
  issues: string[];
}

const PARAM_SOURCE_LABELS: Record<string, string> = {
  "empirical_estimate": "Empirical Estimate",
  "literature_value": "Literature Value",
  "calibrated_value": "Calibrated",
  "synthetic_assumption": "Stated Assumption",
  "default_software_value": "Software Default",
  "hard_coded_unexplained": "Hard-Coded (No Source)",
  "derived_empirical": "Derived from Data",
  "undisclosed_external": "Undisclosed External",
  "unresolvable_reference": "Unresolvable Reference",
};

export default function CodeAnalysisDetail() {
  const { id, analysisId } = useParams<{ id: string; analysisId: string }>();
  const evalId = parseInt(id || "0", 10);
  const aId = parseInt(analysisId || "0", 10);

  const { data: evaluation } = useGetEvaluation(evalId);
  const { data: analysis, isLoading } = useGetCodeAnalysis(evalId, aId);

  const [viewMode, setViewMode] = useState<"matrix" | "cards">("matrix");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!analysis) return <div className="p-8 text-center" data-testid="not-found">Code analysis not found</div>;

  let segments: CodeSegment[] = [];
  let matrix: TraceabilityRow[] = [];
  
  try {
    if (analysis.segments) segments = JSON.parse(analysis.segments);
    // @ts-ignore
    if (analysis.traceabilityMatrix) matrix = JSON.parse(analysis.traceabilityMatrix);
  } catch (e) {
    console.error("Failed to parse JSON arrays", e);
  }

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'traceable': return <Badge className="bg-green-500">Traceable</Badge>;
      case 'weak': return <Badge variant="outline" className="text-amber-600 border-amber-500 bg-amber-50">Weak</Badge>;
      case 'unexplained': return <Badge variant="destructive">Unexplained</Badge>;
      case 'undisclosed': return <Badge className="bg-slate-800 text-white">Undisclosed</Badge>;
      default: return <Badge variant="secondary" className="capitalize">{status}</Badge>;
    }
  };

  // Issue aggregation
  const paramStats = useMemo(() => {
    const counts: Record<string, number> = {};
    let totalIssues = 0;
    
    matrix.forEach(row => {
      counts[row.paramSource] = (counts[row.paramSource] || 0) + 1;
      if (row.issues && row.issues.length) totalIssues += row.issues.length;
    });
    
    segments.forEach(seg => {
      if (seg.issues && seg.issues.length) totalIssues += seg.issues.length;
    });
    
    return { counts, totalIssues };
  }, [matrix, segments]);

  const score = analysis.overallTraceability || 0;
  const scoreColor = scoreTextBorder(score);

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-6" data-testid="code-analysis-page">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-muted-foreground" data-testid="btn-back">
        <Link href={`/evaluations/${evalId}`}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Evaluation
        </Link>
      </Button>

      <div className="flex flex-col md:flex-row gap-6 border-b border-border pb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className="font-mono">{analysis.language}</Badge>
            <Badge variant={analysis.status === 'complete' ? 'default' : 'secondary'}>{analysis.status}</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{analysis.title || "Code Analysis"}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Evaluating traceability against <span className="font-medium text-foreground">{evaluation?.title}</span>
          </p>
        </div>
        
        <div className="shrink-0 flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium mb-1">Traceability Score</div>
            <div className="text-xs text-muted-foreground">0-100 normalized</div>
          </div>
          <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center bg-card ${scoreColor}`}>
            <span className="text-2xl font-bold" data-testid="traceability-score">{score}</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        <div className="md:col-span-3 space-y-6">
          <div className="flex justify-between items-end">
            <h2 className="text-xl font-semibold">Code Analysis Results</h2>
            <div className="flex items-center bg-muted/50 p-1 rounded-lg border border-border">
              <Button 
                variant={viewMode === 'matrix' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('matrix')}
                className="h-8 text-xs"
                data-testid="btn-view-matrix"
              >
                <LayoutList className="w-4 h-4 mr-1.5" /> Matrix
              </Button>
              <Button 
                variant={viewMode === 'cards' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('cards')}
                className="h-8 text-xs"
                data-testid="btn-view-cards"
              >
                <FileCode2 className="w-4 h-4 mr-1.5" /> Segments
              </Button>
            </div>
          </div>

          {viewMode === 'matrix' ? (
            <Card className="shadow-sm border-border">
              <CardContent className="p-0 overflow-x-auto">
                <Table data-testid="matrix-table">
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[150px]">Code Unit</TableHead>
                      <TableHead>Input / Parameter</TableHead>
                      <TableHead>Claimed Source</TableHead>
                      <TableHead>Source Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrix.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No traceability matrix generated.
                        </TableCell>
                      </TableRow>
                    ) : (
                      matrix.map((row, i) => (
                        <React.Fragment key={i}>
                          <TableRow className="cursor-pointer hover:bg-muted/10" onClick={() => toggleRow(i)}>
                            <TableCell className="font-mono text-xs font-semibold align-top">{row.codeUnit}</TableCell>
                            <TableCell className="text-sm font-medium align-top">{row.inputOrParam}</TableCell>
                            <TableCell className="text-sm text-muted-foreground align-top line-clamp-2" title={row.claimedSource}>{row.claimedSource || "-"}</TableCell>
                            <TableCell className="align-top">
                              <span className="text-xs px-2 py-1 bg-muted rounded whitespace-nowrap">
                                {PARAM_SOURCE_LABELS[row.paramSource] || row.paramSource}
                              </span>
                            </TableCell>
                            <TableCell className="align-top">{getStatusBadge(row.status)}</TableCell>
                            <TableCell className="align-top">
                              {expandedRows[i] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            </TableCell>
                          </TableRow>
                          {expandedRows[i] && (
                            <TableRow className="bg-muted/5 hover:bg-muted/5">
                              <TableCell colSpan={6} className="p-0 border-b">
                                <div className="p-4 px-6 space-y-4 shadow-inner">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Evidence Reference</h4>
                                      <p className="text-sm">{row.evidence || "No specific evidence cited."}</p>
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Role</h4>
                                      <p className="text-sm capitalize">{row.role.replace(/_/g, ' ')}</p>
                                    </div>
                                  </div>
                                  
                                  {row.issues && row.issues.length > 0 && (
                                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-md p-3">
                                      <h4 className="text-sm font-semibold text-red-800 dark:text-red-400 flex items-center gap-2 mb-2">
                                        <AlertTriangle className="w-4 h-4" /> Traceability Issues
                                      </h4>
                                      <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300 space-y-1">
                                        {row.issues.map((issue, idx) => (
                                          <li key={idx}>{issue}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6" data-testid="segments-list">
              {segments.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
                  <FileCode2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No segment breakdown available.</p>
                </div>
              ) : (
                segments.map((seg, i) => (
                  <Card key={i} className="overflow-hidden border-border shadow-sm">
                    <div className="bg-muted/50 px-4 py-2 border-b border-border flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold">{seg.label || `Segment ${i+1}`}</span>
                        <Badge variant="outline" className="capitalize text-[10px]">{seg.role?.replace(/_/g, ' ')}</Badge>
                      </div>
                      <Badge variant={seg.confidence === 'high' ? 'default' : seg.confidence === 'medium' ? 'secondary' : 'outline'} className={seg.confidence === 'low' ? 'text-red-500 border-red-200' : ''}>
                        {seg.confidence} Conf
                      </Badge>
                    </div>
                    <div className="grid md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border">
                      <div className="md:col-span-3 bg-slate-950 p-4 overflow-x-auto">
                        <pre className="text-[11px] font-mono text-slate-300">
                          <code>{seg.code || "// No code snippet"}</code>
                        </pre>
                      </div>
                      <div className="md:col-span-2 p-4 space-y-5 bg-card">
                        <div>
                          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <Database className="w-3 h-3" /> Data Source
                          </h4>
                          <p className="text-sm font-medium">{seg.dataSource || "None identified"}</p>
                        </div>
                        
                        <div>
                          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <BookOpen className="w-3 h-3" /> Parameter Source
                          </h4>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{PARAM_SOURCE_LABELS[seg.paramSource] || seg.paramSource || "Unknown"}</Badge>
                          </div>
                        </div>

                        {seg.hardCodedParams && seg.hardCodedParams.length > 0 && (
                          <div>
                            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                              <FileText className="w-3 h-3" /> Hard-coded Parameters
                            </h4>
                            <div className="space-y-1.5">
                              {seg.hardCodedParams.map((p, idx) => (
                                <div key={idx} className="flex items-baseline justify-between text-xs bg-muted/50 p-1.5 rounded">
                                  <span className="font-mono text-primary">{p.name}</span>
                                  <span className="font-mono text-muted-foreground">{p.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {seg.issues && seg.issues.length > 0 && (
                          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-2 rounded border border-red-100 dark:border-red-900/30">
                            <span className="font-semibold block mb-1">Issues:</span>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {seg.issues.map((iss, idx) => <li key={idx}>{iss}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Analysis Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="prose dark:prose-invert max-w-none text-sm text-muted-foreground">
                {analysis.summary || "No summary generated."}
              </div>
              
              <div className="pt-4 border-t border-border">
                <div className="text-sm font-semibold mb-3">Parameter Sources</div>
                <div className="space-y-2">
                  {Object.entries(paramStats.counts).sort((a,b) => b[1]-a[1]).map(([source, count]) => {
                    const label = PARAM_SOURCE_LABELS[source] || source;
                    const maxCount = Math.max(...Object.values(paramStats.counts));
                    const width = `${(count / maxCount) * 100}%`;
                    const isBad = source.includes('hard_coded') || source.includes('undisclosed') || source.includes('unresolvable');
                    
                    return (
                      <div key={source} className="flex items-center text-xs">
                        <div className="w-28 truncate" title={label}>{label}</div>
                        <div className="flex-1 h-1.5 bg-muted rounded-full mx-2 overflow-hidden">
                          <div className={`h-full ${isBad ? 'bg-red-400' : 'bg-primary/60'}`} style={{ width }} />
                        </div>
                        <div className="w-4 text-right font-medium">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {paramStats.totalIssues > 0 && (
                <div className="pt-4 border-t border-border flex items-center justify-between">
                  <div className="text-sm font-semibold flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4" /> Total Issues Found
                  </div>
                  <Badge variant="destructive">{paramStats.totalIssues}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}