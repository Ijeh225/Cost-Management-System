import { useEffect, useState } from "react";
import { useGetCustomSections, useCreateCustomSection, useUpdateCustomSection, useDeleteCustomSection, useAddCustomField, useDeleteCustomField, useUpdateCustomField } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Layers, ChevronDown, ChevronRight, Archive, Eye, EyeOff, Hash, Type, AlignLeft, Calendar, ToggleLeft, List } from "lucide-react";

const FIELD_TYPES = [
  { value: "number", label: "Number", icon: Hash },
  { value: "text", label: "Text", icon: Type },
  { value: "textarea", label: "Textarea", icon: AlignLeft },
  { value: "date", label: "Date", icon: Calendar },
  { value: "checkbox", label: "Checkbox", icon: ToggleLeft },
  { value: "dropdown", label: "Dropdown", icon: List },
];

const COLORS = ["#6366f1","#8b5cf6","#ec4899","#ef4444","#f59e0b","#10b981","#06b6d4","#3b82f6"];

const ROLES = [
  { value: "all", label: "All Roles" },
  { value: "admin", label: "Admin Only" },
  { value: "staff", label: "Staff Only" },
];

function FieldTypeIcon({ type }: { type: string }) {
  const found = FIELD_TYPES.find(t => t.value === type);
  const Icon = found?.icon ?? Type;
  return <Icon className="w-3.5 h-3.5" />;
}

function AddFieldDialog({ sectionId, onClose }: { sectionId: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const addFieldMutation = useAddCustomField();
  const [form, setForm] = useState({
    name: "", fieldType: "text", placeholder: "", helpText: "",
    defaultValue: "", isRequired: false, includeInTotal: false,
    visibleByRole: "all", editableByRole: "all", dropdownOptions: "",
  });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    try {
      await addFieldMutation.mutateAsync({
        id: sectionId,
        data: {
          ...form,
          dropdownOptions: form.dropdownOptions ? JSON.stringify(form.dropdownOptions.split("\n").map(o => o.trim()).filter(Boolean)) : "[]",
        }
      });
      qc.invalidateQueries({ queryKey: ["getCustomSections"] });
      toast({ title: "Field added" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Failed to add field" });
    }
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader><DialogTitle>Add Custom Field</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Field Name *</Label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Port Levy" className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Field Type</Label>
              <Select value={form.fieldType} onValueChange={v => setForm(p => ({ ...p, fieldType: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Visible By Role</Label>
              <Select value={form.visibleByRole} onValueChange={v => setForm(p => ({ ...p, visibleByRole: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Placeholder</Label>
            <Input value={form.placeholder} onChange={e => setForm(p => ({ ...p, placeholder: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Help Text</Label>
            <Input value={form.helpText} onChange={e => setForm(p => ({ ...p, helpText: e.target.value }))} className="h-8 text-sm" />
          </div>
          {form.fieldType === "dropdown" && (
            <div className="space-y-1">
              <Label className="text-xs">Dropdown Options (one per line)</Label>
              <textarea value={form.dropdownOptions} onChange={e => setForm(p => ({ ...p, dropdownOptions: e.target.value }))} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" placeholder={"Option 1\nOption 2\nOption 3"} />
            </div>
          )}
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.isRequired} onCheckedChange={v => setForm(p => ({ ...p, isRequired: v }))} />
              <span className="text-xs">Required</span>
            </label>
            {form.fieldType === "number" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={form.includeInTotal} onCheckedChange={v => setForm(p => ({ ...p, includeInTotal: v }))} />
                <span className="text-xs">Include in Total Cost</span>
              </label>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!form.name.trim() || addFieldMutation.isPending}>
              {addFieldMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Add Field
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SectionsBuilderPage() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (!isAdmin) setLocation("/"); }, [isAdmin]);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: sections = [], isLoading } = useGetCustomSections();
  const createMutation = useCreateCustomSection();
  const updateMutation = useUpdateCustomSection();
  const deleteMutation = useDeleteCustomSection();
  const deleteFieldMutation = useDeleteCustomField();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newRequired, setNewRequired] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addFieldFor, setAddFieldFor] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createMutation.mutateAsync({ data: { name: newName, color: newColor, isRequired: newRequired } });
      qc.invalidateQueries({ queryKey: ["getCustomSections"] });
      toast({ title: "Section created" });
      setNewName(""); setNewColor("#6366f1"); setNewRequired(false); setShowCreate(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to create section" });
    }
  };

  const handleToggleArchive = async (s: any) => {
    try {
      await updateMutation.mutateAsync({ id: s.id, data: { isArchived: !s.isArchived } });
      qc.invalidateQueries({ queryKey: ["getCustomSections"] });
    } catch {
      toast({ variant: "destructive", title: "Failed to update section" });
    }
  };

  const handleDeleteSection = async (id: number) => {
    if (!confirm("Delete this section and all its fields?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["getCustomSections"] });
      toast({ title: "Section deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete section" });
    }
  };

  const handleDeleteField = async (sectionId: number, fieldId: number) => {
    try {
      await deleteFieldMutation.mutateAsync({ id: sectionId, fieldId });
      qc.invalidateQueries({ queryKey: ["getCustomSections"] });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete field" });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" /> Section & Field Builder
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage custom sections and fields for container data collection.</p>
        </div>
        <Button onClick={() => setShowCreate(v => !v)} className="gap-2 shadow-md">
          <Plus className="w-4 h-4" /> New Section
        </Button>
      </div>

      {showCreate && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex gap-3 flex-wrap items-end">
              <div className="space-y-1 flex-1 min-w-[180px]">
                <Label className="text-xs">Section Name *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Bank Charges" className="h-8 text-sm" onKeyDown={e => e.key === "Enter" && handleCreate()} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <div className="flex gap-1 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setNewColor(c)} className={`w-6 h-6 rounded-full border-2 transition-all ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ background: c }} />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pb-1">
                <Switch checked={newRequired} onCheckedChange={setNewRequired} />
                <span className="text-xs">Required in Workflow</span>
              </label>
              <div className="flex gap-2 pb-1">
                <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); setNewName(""); }}>Cancel</Button>
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Create
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (sections as any[]).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No custom sections yet</p>
          <p className="text-sm">Create a section above to start adding custom fields.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(sections as any[]).map((section: any) => (
            <Card key={section.id} className={`border-border/40 bg-card/40 backdrop-blur overflow-hidden ${section.isArchived ? "opacity-50" : ""}`}>
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/20 transition-colors"
                onClick={() => setExpanded(expanded === section.id ? null : section.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: section.color }} />
                  <div>
                    <span className="font-semibold text-sm">{section.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{section.fields?.length ?? 0} fields</span>
                      {section.isRequired && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary">Required</Badge>}
                      {section.isArchived && <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-muted-foreground/40 text-muted-foreground">Archived</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setAddFieldFor(section.id)} title="Add field" className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleToggleArchive(section)} title={section.isArchived ? "Restore" : "Archive"} className="p-1.5 text-muted-foreground hover:text-amber-400 transition-colors rounded">
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteSection(section.id)} title="Delete section" className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {expanded === section.id ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" /> : <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />}
                </div>
              </div>

              {expanded === section.id && (
                <div className="border-t border-border/40">
                  {section.fields?.length === 0 ? (
                    <div className="px-6 py-4 text-sm text-muted-foreground flex items-center justify-between">
                      <span>No fields yet.</span>
                      <Button size="sm" variant="outline" onClick={() => setAddFieldFor(section.id)} className="gap-1.5">
                        <Plus className="w-3.5 h-3.5" /> Add Field
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-secondary/20 text-muted-foreground uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium">Field Name</th>
                              <th className="px-4 py-2 text-left font-medium">Type</th>
                              <th className="px-4 py-2 text-center font-medium">Required</th>
                              <th className="px-4 py-2 text-center font-medium">In Total</th>
                              <th className="px-4 py-2 text-left font-medium">Visible To</th>
                              <th className="px-4 py-2 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {section.fields.map((field: any) => (
                              <tr key={field.id} className="hover:bg-accent/20">
                                <td className="px-4 py-2.5 font-medium">{field.name}</td>
                                <td className="px-4 py-2.5">
                                  <span className="flex items-center gap-1.5 text-muted-foreground capitalize">
                                    <FieldTypeIcon type={field.fieldType} /> {field.fieldType}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">{field.isRequired ? "✓" : "—"}</td>
                                <td className="px-4 py-2.5 text-center">
                                  {field.includeInTotal ? <span className="text-emerald-400 font-semibold">✓</span> : "—"}
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground capitalize">{field.visibleByRole}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <button onClick={() => handleDeleteField(section.id, field.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-3 border-t border-border/30">
                        <Button size="sm" variant="outline" onClick={() => setAddFieldFor(section.id)} className="gap-1.5 h-7 text-xs">
                          <Plus className="w-3 h-3" /> Add Field
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {addFieldFor !== null && (
        <AddFieldDialog sectionId={addFieldFor} onClose={() => setAddFieldFor(null)} />
      )}
    </motion.div>
  );
}
