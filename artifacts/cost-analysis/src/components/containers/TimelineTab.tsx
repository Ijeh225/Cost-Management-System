import { useState } from "react";
import { useGetContainerTimeline, useAddTimelineEvent, useDeleteTimelineEvent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/layout/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Clock, CheckCircle2, AlertCircle, FileText, Truck, Ship, Package } from "lucide-react";

const EVENT_TYPES = [
  { value: "note", label: "Note", icon: FileText },
  { value: "uploaded", label: "Uploaded", icon: Package },
  { value: "shipping_entered", label: "Shipping Entered", icon: Ship },
  { value: "customs_entered", label: "Customs Entered", icon: FileText },
  { value: "duty_paid", label: "Duty Paid", icon: CheckCircle2 },
  { value: "terminal_updated", label: "Terminal Updated", icon: Package },
  { value: "pullout_completed", label: "Pullout Completed", icon: Truck },
  { value: "delivery_completed", label: "Delivery Completed", icon: Truck },
  { value: "empty_return", label: "Empty Return Completed", icon: Package },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "closed", label: "Closed", icon: CheckCircle2 },
  { value: "alert", label: "Alert", icon: AlertCircle },
];

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500",
  pending: "bg-amber-500",
  cancelled: "bg-muted",
  alert: "bg-destructive",
};

function EventIcon({ type }: { type: string }) {
  const found = EVENT_TYPES.find(e => e.value === type);
  const Icon = found?.icon ?? Clock;
  return <Icon className="w-3.5 h-3.5 text-white" />;
}

export function TimelineTab({ containerId }: { containerId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("note");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("completed");

  const { data: events = [], isLoading } = useGetContainerTimeline(containerId);
  const addMutation = useAddTimelineEvent();
  const deleteMutation = useDeleteTimelineEvent();

  const handleAdd = async () => {
    if (!title.trim()) return;
    try {
      await addMutation.mutateAsync({ id: containerId, data: { title, eventType, description, status } });
      qc.invalidateQueries({ queryKey: ["getContainerTimeline", containerId] });
      toast({ title: "Event added to timeline" });
      setTitle(""); setDescription(""); setEventType("note"); setStatus("completed"); setShowForm(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to add event" });
    }
  };

  const handleDelete = async (eventId: number) => {
    try {
      await deleteMutation.mutateAsync({ id: containerId, eventId });
      qc.invalidateQueries({ queryKey: ["getContainerTimeline", containerId] });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete event" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Container event log — record what happened and when.</p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)} className="gap-2">
          <Plus className="w-3.5 h-3.5" /> Add Event
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Event Type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="alert">Alert</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Duty paid at customs" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Additional details…" rows={2} className="resize-none text-sm" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={!title.trim() || addMutation.isPending}>
                {addMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No timeline events yet. Add the first event above.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border/50" />
          <div className="space-y-0">
            {(events as any[]).map((event, i) => (
              <div key={event.id} className="relative flex gap-4 pb-6">
                <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md ${statusColors[event.status] ?? "bg-muted"}`}>
                  <EventIcon type={event.eventType} />
                </div>
                <div className="flex-1 pt-1 group">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{event.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {event.userName} · {new Date(event.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {event.description && <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{event.description}</p>}
                    </div>
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
