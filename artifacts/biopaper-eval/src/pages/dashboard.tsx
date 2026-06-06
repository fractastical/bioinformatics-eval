import React, { useMemo } from "react";
import { Link } from "wouter";
import { useListEvaluations, useGetStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell,
} from "recharts";
import { ChevronRight, TrendingUp, Award, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { scoreText as scoreColor, scoreHex as scoreBg } from "@/lib/score-color";

const DIMENSIONS = [
  { key: "dataSourceScore",        label: "Data Disclosure",     weight: "18%", short: "Data" },
  { key: "datasetScore",           label: "Dataset Resolvability", weight: "14%", short: "Dataset" },
  { key: "reproducibilityScore",   label: "Code Availability",   weight: "14%", short: "Code" },
  { key: "citationScore",          label: "Traceability",        weight: "18%", short: "Trace" },
  { key: "simulationClarityScore", label: "Sim. Clarity",        weight: "18%", short: "Sim" },
  { key: "reproPackageScore",      label: "Repro Package",       weight: "8%", short: "Repro" },
  { key: "informationTheoryScore", label: "Info-Theoretic Rigor", weight: "10%", short: "Info" },
] as const;

type DimKey = typeof DIMENSIONS[number]["key"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill }}>{p.name}: {p.value ?? "N/A"}</p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { data: evaluations, isLoading: evalsLoading } = useListEvaluations();
  const { data: stats, isLoading: statsLoading } = useGetStats();

  const completed = useMemo(
    () => (evaluations ?? []).filter(e => e.status === "complete"),
    [evaluations]
  );

  // Per-dimension averages from completed evaluations
  const dimAverages = useMemo(() => {
    if (!completed.length) return DIMENSIONS.map(d => ({ ...d, avg: 0 }));
    return DIMENSIONS.map(d => {
      const vals = completed.map(e => (e as any)[d.key] as number | null).filter((v): v is number => v != null);
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return { ...d, avg };
    });
  }, [completed]);

  // Score distribution buckets: 0-25, 26-50, 51-75, 76-100
  const overallDist = useMemo(() => {
    const buckets = [
      { label: "0–25", min: 0,  max: 25,  count: 0 },
      { label: "26–50", min: 26, max: 50,  count: 0 },
      { label: "51–75", min: 51, max: 75,  count: 0 },
      { label: "76–100", min: 76, max: 100, count: 0 },
    ];
    for (const e of completed) {
      const s = e.overallScore ?? 0;
      for (const b of buckets) { if (s >= b.min && s <= b.max) { b.count++; break; } }
    }
    return buckets;
  }, [completed]);

  // Sorted table (descending overall score)
  const sorted = useMemo(
    () => [...(evaluations ?? [])].sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1)),
    [evaluations]
  );

  const topScore = completed.reduce((best, e) => Math.max(best, e.overallScore ?? 0), 0);
  const lowScore = completed.reduce((worst, e) => Math.min(worst, e.overallScore ?? 100), 100);
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, e) => s + (e.overallScore ?? 0), 0) / completed.length)
    : 0;

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8" data-testid="dashboard-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scores Dashboard</h1>
        <p className="text-muted-foreground mt-1">Aggregate reproducibility metrics across all evaluated papers.</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-3xl font-bold" data-testid="kpi-total">
              {statsLoading ? <Skeleton className="h-9 w-12" /> : stats?.totalEvaluations ?? 0}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Papers Evaluated</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className={`text-3xl font-bold ${scoreColor(avgScore)}`} data-testid="kpi-avg">
              {evalsLoading ? <Skeleton className="h-9 w-12" /> : completed.length ? avgScore : "—"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Average Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-3xl font-bold text-teal-600 dark:text-teal-400 flex items-center gap-2" data-testid="kpi-top">
              {evalsLoading ? <Skeleton className="h-9 w-12" /> : completed.length ? <><Award className="w-6 h-6" />{topScore}</> : "—"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Highest Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-3xl font-bold text-red-500 flex items-center gap-2" data-testid="kpi-low">
              {evalsLoading ? <Skeleton className="h-9 w-12" /> : completed.length ? <><AlertTriangle className="w-5 h-5" />{lowScore}</> : "—"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Lowest Score</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Dimension averages bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Average Score by Dimension</CardTitle>
            <CardDescription>Mean across {completed.length} completed evaluation{completed.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            {evalsLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dimAverages} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="short" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avg" name="Avg Score" radius={[4, 4, 0, 0]}>
                    {dimAverages.map((d, i) => (
                      <Cell key={i} fill={scoreBg(d.avg)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Overall score distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score Distribution</CardTitle>
            <CardDescription>Overall score across all completed papers</CardDescription>
          </CardHeader>
          <CardContent>
            {evalsLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={overallDist} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Papers" radius={[4, 4, 0, 0]}>
                    {overallDist.map((b, i) => (
                      <Cell key={i} fill={scoreBg(b.min + 12.5)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dimension averages detail */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dimension Breakdown</CardTitle>
          <CardDescription>Average performance on each of the 7 rubric dimensions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {evalsLoading
            ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
            : dimAverages.map(d => (
                <div key={d.key} className="flex items-center gap-3">
                  <div className="w-44 text-sm font-medium shrink-0">{d.label}</div>
                  <div className="text-xs text-muted-foreground w-8 shrink-0">{d.weight}</div>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${d.avg}%`, backgroundColor: scoreBg(d.avg) }}
                    />
                  </div>
                  <div className={`w-8 text-right text-sm font-bold shrink-0 ${scoreColor(d.avg)}`}>{d.avg}</div>
                </div>
              ))
          }
        </CardContent>
      </Card>

      {/* Full score table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Evaluations — Score Matrix</CardTitle>
          <CardDescription>Sorted by overall score, descending</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table data-testid="scores-matrix-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[260px] pl-4">Paper</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Overall</TableHead>
                {DIMENSIONS.map(d => (
                  <TableHead key={d.key} title={d.label} className="whitespace-nowrap text-xs">
                    {d.short}
                  </TableHead>
                ))}
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {evalsLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : sorted.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                        No evaluations yet. <Link href="/" className="text-primary underline">Submit a paper</Link> to get started.
                      </TableCell>
                    </TableRow>
                  )
                : sorted.map(e => {
                    const dimScores = DIMENSIONS.map(d => (e as any)[d.key] as number | null);
                    return (
                      <TableRow key={e.id} className="group" data-testid={`score-row-${e.id}`}>
                        <TableCell className="pl-4">
                          <div className="font-medium text-sm line-clamp-1" title={e.title ?? ""}>{e.title || "Untitled"}</div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                            {e.paperUrl || e.pdfFilename || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={e.status === "complete" ? "default" : e.status === "error" ? "destructive" : "secondary"}
                            className="capitalize text-[10px] px-1.5"
                          >
                            {e.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-bold ${scoreColor(e.overallScore)}`}>
                            {e.overallScore ?? "—"}
                          </span>
                        </TableCell>
                        {dimScores.map((s, i) => (
                          <TableCell key={i}>
                            <span className={`text-xs font-medium ${scoreColor(s)}`}>{s ?? "—"}</span>
                          </TableCell>
                        ))}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(e.createdAt), "MMM d, yy")}
                        </TableCell>
                        <TableCell>
                          <Link href={`/evaluations/${e.id}`}>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
              }
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
