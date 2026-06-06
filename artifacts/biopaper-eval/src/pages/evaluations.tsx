import React, { useState } from "react";
import { Link } from "wouter";
import { useListEvaluations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ChevronRight, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { scoreText } from "@/lib/score-color";

export default function Evaluations() {
  const { data: evaluations, isLoading } = useListEvaluations();
  const [search, setSearch] = useState("");

  const filtered = evaluations
    ?.filter(e =>
      e.title?.toLowerCase().includes(search.toLowerCase()) ||
      e.paperUrl?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1));

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-6" data-testid="evaluations-page">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Evaluations Directory</h1>
          <p className="text-muted-foreground">Browse all analyzed papers and their reproducibility scores.</p>
        </div>
      </div>

      <Card className="shadow-sm border-border">
        <CardHeader className="bg-muted/30 border-b border-border py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by title or URL..." 
                className="pl-9 bg-background"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="search-input"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span data-testid="results-count">{filtered?.length || 0} results</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="evaluations-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[300px]">Paper</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Overall</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Trace</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-6 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No evaluations found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered?.map(evaluation => {
                  const getScoreClass = (s: number | null | undefined) =>
                    `${scoreText(s)} font-medium`;

                  return (
                    <TableRow key={evaluation.id} className="group cursor-pointer">
                      <TableCell className="font-medium">
                        <Link href={`/evaluations/${evaluation.id}`} className="block">
                          <div className="line-clamp-2 text-sm">{evaluation.title || "Untitled"}</div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate mt-1">
                            {evaluation.paperUrl || evaluation.pdfFilename || "Local file"}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={evaluation.status === 'complete' ? 'default' : evaluation.status === 'error' ? 'destructive' : 'secondary'} className="capitalize text-[10px] px-1.5 py-0">
                          {evaluation.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className={`text-sm ${getScoreClass(evaluation.overallScore)}`}>
                          {evaluation.overallScore ?? '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`text-xs ${getScoreClass(evaluation.dataSourceScore)}`}>
                          {evaluation.dataSourceScore ?? '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* @ts-ignore */}
                        <div className={`text-xs ${getScoreClass(evaluation.datasetScore)}`}>
                          {/* @ts-ignore */}
                          {evaluation.datasetScore ?? '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* @ts-ignore */}
                        <div className={`text-xs ${getScoreClass(evaluation.reproducibilityScore)}`}>
                          {/* @ts-ignore */}
                          {evaluation.reproducibilityScore ?? '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* @ts-ignore */}
                        <div className={`text-xs ${getScoreClass(evaluation.citationScore)}`}>
                          {/* @ts-ignore */}
                          {evaluation.citationScore ?? '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(evaluation.createdAt), "MMM d, yy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/evaluations/${evaluation.id}`}>
                          <ChevronRight className="w-4 h-4 inline-block text-muted-foreground group-hover:text-primary transition-colors" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
