import React, { useState } from "react";
import {
  useListReviewers,
  useCreateReviewer,
  useUpdateReviewer,
  useDeleteReviewer,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Mail,
  Building2,
  Trash2,
  Send,
  MessageSquareReply,
  CheckCircle2,
  Clock,
  XCircle,
  UserPlus,
} from "lucide-react";

type Status = "not_contacted" | "contacted" | "responded" | "declined";

const STATUSES: Status[] = ["not_contacted", "contacted", "responded", "declined"];

const STATUS_LABELS: Record<Status, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  responded: "Responded",
  declined: "Declined",
};

const STATUS_STYLES: Record<Status, string> = {
  not_contacted: "bg-muted text-muted-foreground border-border",
  contacted: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  responded: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  declined: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

function StatusIcon({ status }: { status: Status }) {
  switch (status) {
    case "responded":
      return <CheckCircle2 className="w-4 h-4" />;
    case "contacted":
      return <Clock className="w-4 h-4" />;
    case "declined":
      return <XCircle className="w-4 h-4" />;
    default:
      return <Send className="w-4 h-4" />;
  }
}

interface Reviewer {
  id: number;
  name: string;
  email?: string | null;
  affiliation?: string | null;
  expertise?: string | null;
  status: string;
  feedback?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

function ReviewerCard({
  reviewer,
  onChanged,
}: {
  reviewer: Reviewer;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateReviewer();
  const del = useDeleteReviewer();

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState(reviewer.feedback ?? "");

  const status = (STATUSES.includes(reviewer.status as Status) ? reviewer.status : "not_contacted") as Status;

  const handleStatus = (next: string) => {
    update.mutate(
      { reviewerId: reviewer.id, data: { status: next as Status } },
      {
        onSuccess: onChanged,
        onError: () => toast({ title: "Could not update status", variant: "destructive" }),
      },
    );
  };

  const handleSaveFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        reviewerId: reviewer.id,
        data: {
          feedback: feedbackDraft.trim() || undefined,
          // Recording feedback implies they responded.
          status: feedbackDraft.trim() && status === "not_contacted" ? "responded" : status,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Feedback saved" });
          setShowFeedback(false);
          onChanged();
        },
        onError: () => toast({ title: "Could not save feedback", variant: "destructive" }),
      },
    );
  };

  const handleDelete = () => {
    del.mutate(
      { reviewerId: reviewer.id },
      {
        onSuccess: () => {
          toast({ title: "Reviewer removed" });
          onChanged();
        },
        onError: () => toast({ title: "Could not remove reviewer", variant: "destructive" }),
      },
    );
  };

  return (
    <Card data-testid={`reviewer-${reviewer.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {reviewer.name}
              <Badge variant="outline" className={`capitalize gap-1.5 ${STATUS_STYLES[status]}`}>
                <StatusIcon status={status} />
                {STATUS_LABELS[status]}
              </Badge>
            </CardTitle>
            <div className="mt-1.5 space-y-1 text-sm text-muted-foreground">
              {reviewer.affiliation && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{reviewer.affiliation}</span>
                </div>
              )}
              {reviewer.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <a href={`mailto:${reviewer.email}`} className="text-primary hover:underline">
                    {reviewer.email}
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={status} onValueChange={handleStatus}>
              <SelectTrigger className="w-[150px] h-8" data-testid={`status-select-${reviewer.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={del.isPending}
              data-testid={`btn-delete-reviewer-${reviewer.id}`}
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {reviewer.expertise && (
          <p className="text-sm">
            <span className="font-medium text-muted-foreground">Relevance: </span>
            {reviewer.expertise}
          </p>
        )}
        {reviewer.notes && (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5 whitespace-pre-wrap">
            {reviewer.notes}
          </p>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquareReply className="w-4 h-4 text-muted-foreground" />
              Feedback
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFeedbackDraft(reviewer.feedback ?? "");
                setShowFeedback((v) => !v);
              }}
              data-testid={`btn-edit-feedback-${reviewer.id}`}
            >
              {reviewer.feedback ? "Edit" : "Record feedback"}
            </Button>
          </div>

          {showFeedback ? (
            <form onSubmit={handleSaveFeedback} className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <Textarea
                value={feedbackDraft}
                onChange={(e) => setFeedbackDraft(e.target.value)}
                placeholder="What feedback did they give?"
                className="text-sm h-24"
                data-testid={`feedback-input-${reviewer.id}`}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowFeedback(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={update.isPending}>
                  Save feedback
                </Button>
              </div>
            </form>
          ) : reviewer.feedback ? (
            <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-md p-3 border border-border">
              {reviewer.feedback}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No feedback recorded yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Reviewers() {
  const { toast } = useToast();
  const { data: reviewers, isLoading, refetch } = useListReviewers();
  const create = useCreateReviewer();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [expertise, setExpertise] = useState("");
  const [notes, setNotes] = useState("");

  const list = (reviewers ?? []) as Reviewer[];

  const counts = list.reduce(
    (acc, r) => {
      const s = (STATUSES.includes(r.status as Status) ? r.status : "not_contacted") as Status;
      acc[s] += 1;
      return acc;
    },
    { not_contacted: 0, contacted: 0, responded: 0, declined: 0 } as Record<Status, number>,
  );

  const onChanged = () => {
    refetch();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        data: {
          name: name.trim(),
          email: email.trim() || undefined,
          affiliation: affiliation.trim() || undefined,
          expertise: expertise.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Reviewer added" });
          setName("");
          setEmail("");
          setAffiliation("");
          setExpertise("");
          setNotes("");
          refetch();
        },
        onError: () => toast({ title: "Could not add reviewer", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8" data-testid="page-reviewers">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Reviewers
        </h1>
        <p className="text-muted-foreground mt-1">
          People who could review the work or give feedback. Track who you've reached out to and what they said.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(
          [
            ["Total", list.length, "text-foreground"],
            ["Responded", counts.responded, "text-green-600 dark:text-green-400"],
            ["Contacted", counts.contacted, "text-blue-600 dark:text-blue-400"],
            ["Not contacted", counts.not_contacted, "text-muted-foreground"],
          ] as const
        ).map(([label, value, color]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className={`text-2xl font-semibold ${color}`}>{value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : list.length > 0 ? (
            list.map((reviewer) => (
              <ReviewerCard key={reviewer.id} reviewer={reviewer} onChanged={onChanged} />
            ))
          ) : (
            <div className="text-center py-16 bg-muted/20 rounded-xl border border-dashed border-border">
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No reviewers added yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add researchers who could review the work or give feedback.
              </p>
            </div>
          )}
        </div>

        <div>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Add reviewer
              </CardTitle>
              <CardDescription>Add someone who could review the work or give feedback.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Jane Researcher"
                    required
                    data-testid="new-reviewer-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@university.edu"
                    data-testid="new-reviewer-email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Affiliation</Label>
                  <Input
                    value={affiliation}
                    onChange={(e) => setAffiliation(e.target.value)}
                    placeholder="University / Lab"
                    data-testid="new-reviewer-affiliation"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Relevance / expertise</Label>
                  <Input
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                    placeholder="e.g. swarm intelligence, info theory"
                    data-testid="new-reviewer-expertise"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="How you found them, links, etc."
                    className="text-sm h-20"
                    data-testid="new-reviewer-notes"
                  />
                </div>
                <Button type="submit" disabled={create.isPending} className="w-full" data-testid="btn-add-reviewer">
                  {create.isPending ? "Adding..." : "Add Reviewer"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
