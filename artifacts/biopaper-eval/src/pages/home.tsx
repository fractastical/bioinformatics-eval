import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCreateEvaluation, useGetStats, useListEvaluations } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUp, Link as LinkIcon, Activity, Database, CheckCircle2, FlaskConical, AlertCircle, Clock, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createEval = useCreateEvaluation();
  const { data: stats, isLoading: isStatsLoading } = useGetStats();
  const { data: evaluations, isLoading: isEvalsLoading } = useListEvaluations();
  
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    createEval.mutate({ data: { paperUrl: url } }, {
      onSuccess: (data) => {
        toast({ title: "Evaluation started", description: "The paper is now being analyzed." });
        setLocation(`/evaluations/${data.id}`);
      },
      onError: (error) => {
        toast({ title: "Failed to submit", description: "There was an error submitting the URL.", variant: "destructive" });
      }
    });
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/evaluations/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      
      toast({ title: "Upload successful", description: "The paper is now being analyzed." });
      setLocation(`/evaluations/${data.id}`);
    } catch (error) {
      toast({ title: "Failed to upload", description: "There was an error uploading the file.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const renderMiniScore = (score: number | null | undefined, label: string) => {
    if (score === null || score === undefined) return null;
    const color = score > 70 ? 'bg-green-500' : score > 40 ? 'bg-amber-500' : 'bg-red-500';
    return (
      <div className="flex items-center gap-2 text-xs" data-testid={`mini-score-${label}`}>
        <span className="w-16 truncate text-muted-foreground" title={label}>{label}</span>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
        </div>
        <span className="w-6 text-right font-medium">{score}</span>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-8" data-testid="home-page">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Scientific Integrity Audit</h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
          Submit bioinformatics research papers for automated evaluation of data transparency, dataset availability, and computational reproducibility.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 shadow-sm border-primary/20">
          <CardHeader>
            <CardTitle>Submit a Paper</CardTitle>
            <CardDescription>Provide a URL or upload a PDF to begin analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="url" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="url" className="flex gap-2" data-testid="tab-url"><LinkIcon className="w-4 h-4" /> URL</TabsTrigger>
                <TabsTrigger value="file" className="flex gap-2" data-testid="tab-file"><FileUp className="w-4 h-4" /> PDF Upload</TabsTrigger>
              </TabsList>
              
              <TabsContent value="url">
                <form onSubmit={handleSubmitUrl} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="url">Paper URL</Label>
                    <Input 
                      id="url" 
                      placeholder="https://doi.org/10.1038/..." 
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                      data-testid="input-url"
                    />
                    <p className="text-xs text-muted-foreground">Supported: bioRxiv, PubMed, PMC, Nature, Science, standard DOIs.</p>
                  </div>
                  <Button type="submit" disabled={createEval.isPending || !url} className="w-full" data-testid="btn-submit-url">
                    {createEval.isPending ? <Activity className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
                    Begin Evaluation
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="file">
                <form onSubmit={handleFileUpload} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="file">PDF Document</Label>
                    <Input 
                      id="file" 
                      type="file" 
                      accept="application/pdf"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      required
                      className="cursor-pointer"
                      data-testid="input-file"
                    />
                  </div>
                  <Button type="submit" disabled={isUploading || !file} className="w-full" data-testid="btn-submit-file">
                    {isUploading ? <Activity className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
                    Upload & Evaluate
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm bg-primary/5 border-primary/10" data-testid="system-stats">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm uppercase tracking-wider text-primary">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isStatsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="text-3xl font-bold text-foreground" data-testid="stat-total">{stats?.totalEvaluations || 0}</div>
                    <div className="text-sm text-muted-foreground">Total Papers Evaluated</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Completed</span>
                      <span className="font-medium" data-testid="stat-complete">{stats?.statusBreakdown?.complete || 0}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" /> Processing</span>
                      <span className="font-medium" data-testid="stat-processing">{(stats?.statusBreakdown?.analyzing || 0) + (stats?.statusBreakdown?.pending || 0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4 pt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Recent Evaluations</h2>
          <Button variant="outline" size="sm" asChild data-testid="btn-view-all">
            <Link href="/evaluations">View All</Link>
          </Button>
        </div>
        
        {isEvalsLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="recent-evaluations">
            {evaluations?.slice(0, 3).map(evaluation => (
              <Link key={evaluation.id} href={`/evaluations/${evaluation.id}`}>
                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer shadow-sm group flex flex-col" data-testid={`eval-card-${evaluation.id}`}>
                  <CardHeader className="pb-2 flex-none">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant={evaluation.status === 'complete' ? 'default' : evaluation.status === 'error' ? 'destructive' : 'secondary'} className="capitalize" data-testid={`eval-status-${evaluation.id}`}>
                        {evaluation.status}
                      </Badge>
                      {evaluation.overallScore !== null && evaluation.overallScore !== undefined && (
                         <div className={`font-bold text-lg ${evaluation.overallScore > 70 ? 'text-green-600 dark:text-green-400' : evaluation.overallScore > 40 ? 'text-amber-500' : 'text-red-500'}`} data-testid={`eval-score-${evaluation.id}`}>
                           {evaluation.overallScore}/100
                         </div>
                      )}
                    </div>
                    <CardTitle className="text-base line-clamp-2 group-hover:text-primary transition-colors" title={evaluation.title || "Untitled Paper"}>
                      {evaluation.title || "Untitled Paper"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between pt-2">
                    <div className="space-y-1.5 mb-4">
                      {/* @ts-ignore - API schema might not type these yet */}
                      {renderMiniScore(evaluation.dataSourceScore, "Data Discl.")}
                      {/* @ts-ignore */}
                      {renderMiniScore(evaluation.datasetScore, "Dataset Res.")}
                      {/* @ts-ignore */}
                      {renderMiniScore(evaluation.reproducibilityScore, "Code Avail.")}
                      {/* @ts-ignore */}
                      {renderMiniScore(evaluation.citationScore, "Traceability")}
                      {/* @ts-ignore */}
                      {renderMiniScore(evaluation.simulationClarityScore, "Sim. Clarity")}
                      {/* @ts-ignore */}
                      {renderMiniScore(evaluation.reproPackageScore, "Repro Pack.")}
                      {/* @ts-ignore */}
                      {renderMiniScore(evaluation.informationTheoryScore, "Info-Theoretic")}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {evaluation.paperUrl || evaluation.pdfFilename || "No source available"}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
