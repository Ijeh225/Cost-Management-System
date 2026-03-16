import { useState } from "react";
import { useGetContainerTasks, useCreateContainerTask, useUpdateContainerTask, useDeleteContainerTask, useListUsers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Trash2, CheckSquare, Calendar, User, Flag, ChevronDown } from "lucide-react";

const PRIORITIES = [
  { value: "low", label: "Low", color: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
  { value: "medium", label: "Medium", color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  { value: "high", label: "High", color: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  { value: "urgent", label: "Urgent", color: "text-destructive border-destructive/30 bg-destructive/10" },
];

const STATUSES = [
  { value: "pending", label: "Pending", color: "text-muted-foreground border-border bg-muted/30" },
  { value: "in_progress", label: "In Progress", color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  { value: "completed", label: "Completed", color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
  { value: "overdue", label: "Overdue", color: "text-destructive border-destructive/30 bg-destructive/10" },
  { value: "cancelled", label: "Cancelled", color: "text-muted-foreground border-border/50 bg-muted/20 line-through" },
];

function priorityColor(p: string) { return PRIORITIES.find(x => x.value === p)?.color ?? ""; }
function statusColor(s: string) { return STATUSES.find(x => x.value === s)?.color ?? ""; }
function statusLabel(s: string) { return STATUSES.find(x => x.value === s)?.label ?? s; }
function isOverdue(task: any) { return task.dueDate && new Date(task.dueDate) < new Date() && !["completed","cancelled"].includes(task.status); }

export function TasksTab({ containerId }: { containerId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", assignedStaffId: "", dueDate: "", priority: "medium", notes: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("");

  const { data: tasks = [], isLoading } = useGetContainerTasks(containerId);
  const { data: usersData } = useListUsers();
  const staffUsers = (usersData as any)?.users?.filter((u: any) => u.role === "staff") ?? [];

  const createMutation = useCreateContainerTask();
  const updateMutation = useUpdateContainerTask();
  const deleteMutation = useDeleteContainerTask();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["getContainerTasks", containerId] });

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    try {
      await createMutation.mutateAsync({
        id: containerId,
        data: {
          title: form.title,
          assignedStaffId: form.assignedStaffId ? parseInt(form.assignedStaffId) : undefined,
          dueDate: form.dueDate || undefined,
          priority: form.priority,
          notes: form.notes,
        }
      });
      invalidate();
      toast({ title: "Task created" });
      setForm({ title: "", assignedStaffId: "", dueDate: "", priority: "medium", notes: "" });
      setShowForm(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to create task" });
    }
  };

  const handleStatusChange = async (taskId: number, status: string) => {
    try {
      await updateMutation.mutateAsync({ id: containerId, taskId, data: { status } });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Failed to update task" });
    }
  };

  const handleDelete = async (taskId: number) => {
    try {
      await deleteMutation.mutateAsync({ id: containerId, taskId });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Failed to delete task" });
    }
  };

  const overdueTasks = (tasks as any[]).filter(t => isOverdue(t));
  const activeTasks = (tasks as any[]).filter(t => !["completed","cancelled"].includes(t.status));
  const doneTasks = (tasks as any[]).filter(t => ["completed","cancelled"].includes(t.status));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{activeTasks.length} active</span>
          {overdueTasks.length > 0 && <span className="text-destructive font-semibold">{overdueTasks.length} overdue</span>}
          <span>{doneTasks.length} done</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)} className="gap-2">
          <Plus className="w-3.5 h-3.5" /> New Task
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Task Title *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Follow up on terminal charges" className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Assigned To</Label>
                <Select value={form.assignedStaffId || "unassigned"} onValueChange={v => setForm(p => ({ ...p, assignedStaffId: v === "unassigned" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staffUsers.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={!form.title.trim() || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (tasks as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No tasks yet. Create the first task above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(tasks as any[]).map((task: any) => (
            <div key={task.id} className={`rounded-lg border p-3.5 flex items-start gap-3 group transition-colors ${
              isOverdue(task) ? "border-destructive/30 bg-destructive/5" : "border-border/40 bg-card/40 hover:bg-accent/20"
            }`}>
              <button
                onClick={() => handleStatusChange(task.id, task.status === "completed" ? "pending" : "completed")}
                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center transition-colors ${task.status === "completed" ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground hover:border-primary"}`}
              >
                {task.status === "completed" && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className={`font-medium text-sm ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${priorityColor(task.priority)}`}>{task.priority.toUpperCase()}</span>
                    <Select value={task.status} onValueChange={v => handleStatusChange(task.id, v)}>
                      <SelectTrigger className={`h-5 text-[10px] px-1.5 border rounded gap-1 font-semibold ${statusColor(task.status)}`} style={{ width: "auto", minWidth: "70px" }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {task.assignedStaffName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{task.assignedStaffName}</span>}
                  {task.dueDate && (
                    <span className={`flex items-center gap-1 ${isOverdue(task) ? "text-destructive font-semibold" : ""}`}>
                      <Calendar className="w-3 h-3" />
                      {new Date(task.dueDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      {isOverdue(task) && " (OVERDUE)"}
                    </span>
                  )}
                </div>
                {task.notes && <p className="text-xs text-muted-foreground mt-1">{task.notes}</p>}
              </div>
              <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
