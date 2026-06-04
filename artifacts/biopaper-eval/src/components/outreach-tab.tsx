import React, { useState } from "react";
import {
  useListOutreach,
  useCreateOutreach,
  useUpdateOutreach,
  useDeleteOutreach,
  useSyncOutreach,
  useAddOutreachFeedback,
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
  Github,
  Mail,
  MessagesSquare,
  Link2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Send,
  Megaphone,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

type Channel = "github" | "email" | "forum" | "other";
type Status = "pending" | "contacted" | "responded" | "closed";

const STATUS_STYLES: Record<Status, string> = {
  pending: "bg-muted text-muted-foreground",
  contacted: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  responded: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  closed: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case "github":
      return <Github className="w-4 h-4" />;
    case "email":
      return <Mail className="w-4 h-4" />;
    case "forum":
      return <MessagesSquare className="w-4 h-4" />;
    default:
      return <Link2 className="w-4 h-4" />;
  }
}

function FeedbackList({
  feedback,
}: {
  feedback: Array<{
    id: number;
    source: string;
    author?: string | null;
    body: string;
    externalUrl?: string | null;
    externalCreatedAt?: string | null;
    createdAt: string;
  }>;
}) {
  if (!feedback || feedback.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic px-1 py-2">
        No responses recorded yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {feedback.map((f) => {
        const when = f.externalCreatedAt || f.createdAt;
        return (
          <div
            key={f.id}
            className="rounded-lg border border-border bg-muted/30 p-3 text-sm"
            data-testid={`feedback-${f.id}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-medium">{f.author || "Unknown"}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {f.source}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {when ? format(new Date(when), "MMM d, yyyy") : ""}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-muted-foreground">{f.body}</p>
            {f.externalUrl && (
              <a
                href={f.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary inline-flex items-center gap-1 mt-2 hover:underline"
              >
                View on GitHub <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OutreachCard({
  evalId,
  record,
  onChanged,
}: {
  evalId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: any;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateOutreach();
  const del = useDeleteOutreach();
  const sync = useSyncOutreach();
  const addFeedback = useAddOutreachFeedback();

  const [replyAuthor, setReplyAuthor] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [showReply, setShowReply] = useState(false);

  const handleSync = () => {
    sync.mutate(
      { id: evalId, outreachId: record.id },
      {
        onSuccess: () => {
          toast({ title: "Synced", description: "Pulled latest status and comments from GitHub." });
          onChanged();
        },
        onError: () => toast({ title: "Sync failed", description: "Could not reach GitHub.", variant: "destructive" }),
      },
    );
  };

  const handleStatus = (status: string) => {
    update.mutate(
      { id: evalId, outreachId: record.id, data: { status: status as Status } },
      { onSuccess: onChanged },
    );
  };

  const handleDelete = () => {
    del.mutate({ id: evalId, outreachId: record.id }, { onSuccess: onChanged });
  };

  const handleAddReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    addFeedback.mutate(
      { id: evalId, outreachId: record.id, data: { author: replyAuthor || undefined, body: replyBody } },
      {
        onSuccess: () => {
          toast({ title: "Response recorded" });
          setReplyAuthor("");
          setReplyBody("");
          setShowReply(false);
          onChanged();
        },
      },
    );
  };

  const target = record.githubUrl || record.contact;

  return (
    <Card data-testid={`outreach-${record.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="capitalize flex items-center gap-1.5">
                <ChannelIcon channel={record.channel} /> {record.channel}
              </Badge>
              <Badge variant="outline" className={`capitalize ${STATUS_STYLES[record.status as Status] ?? ""}`}>
                {record.status}
              </Badge>
              {record.channel === "github" && record.githubState && (
                <Badge variant="outline" className="capitalize text-xs">
                  issue {record.githubState}
                </Badge>
              )}
            </div>
            {target && (
              <CardDescription className="truncate">
                {record.githubUrl ? (
                  <a href={record.githubUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    {record.githubUrl} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  target
                )}
              </CardDescription>
            )}
            {record.lastSyncedAt && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Synced {format(new Date(record.lastSyncedAt), "MMM d, yyyy HH:mm")}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={record.status} onValueChange={handleStatus}>
              <SelectTrigger className="w-[130px] h-8" data-testid={`status-select-${record.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="responded">Responded</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            {record.channel === "github" && (
              <Button variant="outline" size="sm" onClick={handleSync} disabled={sync.isPending} data-testid={`btn-sync-${record.id}`}>
                <RefreshCw className={`w-4 h-4 ${sync.isPending ? "animate-spin" : ""}`} />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={del.isPending} data-testid={`btn-delete-${record.id}`}>
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {record.notes && (
          <p className="text-sm bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{record.notes}</p>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              Responses ({record.feedback?.length ?? 0})
            </h4>
            <Button variant="ghost" size="sm" onClick={() => setShowReply((v) => !v)} data-testid={`btn-add-reply-${record.id}`}>
              <Send className="w-3.5 h-3.5 mr-1.5" /> Record reply
            </Button>
          </div>

          {showReply && (
            <form onSubmit={handleAddReply} className="space-y-2 mb-3 rounded-lg border border-dashed border-border p-3">
              <Input
                value={replyAuthor}
                onChange={(e) => setReplyAuthor(e.target.value)}
                placeholder="Who replied? (name / email)"
                className="h-8"
                data-testid={`reply-author-${record.id}`}
              />
              <Textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Paste their response (e.g. an email reply)..."
                className="text-sm h-20"
                required
                data-testid={`reply-body-${record.id}`}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowReply(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={addFeedback.isPending || !replyBody.trim()}>
                  Save response
                </Button>
              </div>
            </form>
          )}

          <FeedbackList feedback={record.feedback ?? []} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function OutreachTab({ evalId }: { evalId: number }) {
  const { toast } = useToast();
  const { data: outreach, isLoading, refetch } = useListOutreach(evalId);
  const create = useCreateOutreach();

  const [channel, setChannel] = useState<Channel>("github");
  const [githubUrl, setGithubUrl] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");

  const onChanged = () => {
    refetch();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (channel === "github" && !githubUrl.trim()) return;
    if (channel !== "github" && !contact.trim()) return;

    create.mutate(
      {
        id: evalId,
        data: {
          channel,
          githubUrl: channel === "github" ? githubUrl.trim() : undefined,
          contact: channel !== "github" ? contact.trim() : undefined,
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Outreach added" });
          setGithubUrl("");
          setContact("");
          setNotes("");
          refetch();
        },
        onError: () => toast({ title: "Could not add outreach", description: "Check the link or details and try again.", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="grid md:grid-cols-3 gap-6" data-testid="content-outreach">
      <div className="md:col-span-2 space-y-4">
        <h3 className="text-lg font-medium">Outreach & Feedback</h3>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : outreach && outreach.length > 0 ? (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (outreach as any[]).map((record) => (
            <OutreachCard key={record.id} evalId={evalId} record={record} onChanged={onChanged} />
          ))
        ) : (
          <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No outreach tracked for this paper yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Link the GitHub feedback issue, or log an email/forum contact.
            </p>
          </div>
        )}
      </div>

      <div>
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="text-base">Add Outreach</CardTitle>
            <CardDescription>
              Link a GitHub issue to auto-pull replies, or log an email/forum contact manually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                  <SelectTrigger data-testid="new-outreach-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub issue</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="forum">Forum</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {channel === "github" ? (
                <div className="space-y-2">
                  <Label>GitHub issue URL</Label>
                  <Input
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo/issues/1"
                    data-testid="new-outreach-github-url"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Contact</Label>
                  <Input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="name, email, or forum link"
                    data-testid="new-outreach-contact"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Context about this outreach..."
                  className="text-sm h-20"
                  data-testid="new-outreach-notes"
                />
              </div>

              <Button type="submit" disabled={create.isPending} className="w-full" data-testid="btn-add-outreach">
                {create.isPending ? "Adding..." : "Add Outreach"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
