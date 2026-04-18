import { useState } from "react";
import {
  useGetCustomSections,
  useCreateCustomSection,
  useUpdateCustomSection,
  useDeleteCustomSection,
  useAddCustomField,
  useDeleteCustomField,
  useUpdateCustomField,
  getGetCustomSectionsQueryKey,
  useGetSettings,
  useUpdateSettings,
  BUILT_IN_SECTIONS,
  BUILT_IN_FIELD_DEFAULTS,
  builtInFieldLabelKey,
  builtInFieldHiddenKey,
  isBuiltInFieldHidden,
  useGetBuiltinExtras,
  useAddBuiltinExtra,
  useUpdateBuiltinExtra,
  useDeleteBuiltinExtra,
  type BuiltinExtraField,
} from "@workspace/api-client-react";
import type { CustomSectionWithFields, CustomField } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Pencil, Trash2, Layers,
  ChevronDown, ChevronRight, Archive, ArchiveRestore,
  Check, X, Hash, Type, AlignLeft, Calendar,
  ToggleLeft, List, Save, AlertTriangle, Eye, EyeOff,
} from "lucide-react";

const FIELD_TYPES = [
  { value: "number", label: "Number", icon: Hash },
  { value: "text", label: "Text", icon: Type },
  { value: "textarea", label: "Textarea", icon: AlignLeft },
  { value: "date", label: "Date", icon: Calendar },
  { value: "checkbox", label: "Checkbox", icon: ToggleLeft },
  { value: "dropdown", label: "Dropdown", icon: List },
];

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f59e0b", "#10b981", "#06b6d4", "#3b82f6",
];

const ROLES = [
  { value: "all", label: "All Roles" },
  { value: "admin", label: "Admin Only" },
  { value: "staff", label: "Staff Only" },
];


type FieldForm = {
  name: string;
  fieldType: string;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  isRequired: boolean;
  includeInTotal: boolean;
  visibleByRole: string;
  editableByRole: string;
  dropdownOptions: string;
};

const EMPTY_FIELD: FieldForm = {
  name: "",
  fieldType: "number",
  placeholder: "",
  helpText: "",
  defaultValue: "",
  isRequired: false,
  includeInTotal: true,
  visibleByRole: "all",
  editableByRole: "all",
  dropdownOptions: "",
};

function smartIncludeInTotal(fieldType: string): boolean {
  return fieldType === "number";
}

function fieldToForm(f: CustomField): FieldForm {
  let opts = "";
  try {
    const parsed = JSON.parse(f.dropdownOptions || "[]");
    opts = Array.isArray(parsed) ? parsed.join("\n") : "";
  } catch {
    opts = "";
  }
  return {
    name: f.name ?? "",
    fieldType: f.fieldType ?? "text",
    placeholder: f.placeholder ?? "",
    helpText: f.helpText ?? "",
    defaultValue: f.defaultValue ?? "",
    isRequired: !!f.isRequired,
    includeInTotal: !!f.includeInTotal,
    visibleByRole: f.visibleByRole ?? "all",
    editableByRole: f.editableByRole ?? "all",
    dropdownOptions: opts,
  };
}

function serializeDropdownOptions(raw: string): string {
  return raw
    ? JSON.stringify(raw.split("\n").map((o) => o.trim()).filter(Boolean))
    : "[]";
}

function FieldTypeIcon({ type }: { type: string }) {
  const found = FIELD_TYPES.find((t) => t.value === type);
  const Icon = found?.icon ?? Type;
  return <Icon className="w-3.5 h-3.5" />;
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full border-2 transition-all ${value === c ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function InlineFieldForm({
  form, onChange, onSave, onCancel, saving, saveLabel,
}: {
  form: FieldForm;
  onChange: (f: FieldForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  const set = (patch: Partial<FieldForm>) => {
    const next = { ...form, ...patch };
    if (patch.fieldType !== undefined) {
      next.includeInTotal = smartIncludeInTotal(patch.fieldType);
    }
    onChange(next);
  };

  const showCostWarning =
    form.fieldType === "number" && !form.includeInTotal;

  return (
    <div className="space-y-3 p-4 bg-accent/10 rounded-lg border border-border/40">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Field Name *</Label>
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Port Levy"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Field Type</Label>
          <Select value={form.fieldType} onValueChange={(v) => set({ fieldType: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <span className="flex items-center gap-1.5">
                    <t.icon className="w-3 h-3" /> {t.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Placeholder</Label>
          <Input
            value={form.placeholder}
            onChange={(e) => set({ placeholder: e.target.value })}
            className="h-8 text-sm"
            placeholder="Placeholder text..."
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Help Text</Label>
          <Input
            value={form.helpText}
            onChange={(e) => set({ helpText: e.target.value })}
            className="h-8 text-sm"
            placeholder="Guidance for the user..."
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium">Visible By</Label>
          <Select value={form.visibleByRole} onValueChange={(v) => set({ visibleByRole: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Editable By</Label>
          <Select value={form.editableByRole} onValueChange={(v) => set({ editableByRole: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {form.fieldType === "dropdown" && (
        <div className="space-y-1">
          <Label className="text-xs font-medium">Dropdown Options (one per line)</Label>
          <textarea
            value={form.dropdownOptions}
            onChange={(e) => set({ dropdownOptions: e.target.value })}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={"Option 1\nOption 2\nOption 3"}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={form.isRequired}
            onCheckedChange={(v) => set({ isRequired: v })}
          />
          <span className="text-xs">Required</span>
        </label>
        {form.fieldType === "number" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch
              checked={form.includeInTotal}
              onCheckedChange={(v) => set({ includeInTotal: v })}
            />
            <span className="text-xs">Include in Total Cost</span>
          </label>
        )}
      </div>
      {showCostWarning && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <p className="text-xs">
            This is a Number field but is excluded from Total Cost. Only override this if it is intentionally non-financial (e.g. a count or reference number).
          </p>
        </div>
      )}
      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="outline" onClick={onCancel} className="h-7 text-xs gap-1">
          <X className="w-3 h-3" /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={!form.name.trim() || saving}
          className="h-7 text-xs gap-1"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  field, sectionId, isEditing, onStartEdit, onCancelEdit, sectionsQueryKey, isAdmin,
}: {
  field: CustomField;
  sectionId: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  sectionsQueryKey: readonly unknown[];
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateMutation = useUpdateCustomField();
  const deleteMutation = useDeleteCustomField();
  const [form, setForm] = useState<FieldForm>(fieldToForm(field));

  const showCostWarning = field.fieldType === "number" && !field.includeInTotal;

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      await updateMutation.mutateAsync({
        id: sectionId,
        fieldId: field.id,
        data: { ...form, dropdownOptions: serializeDropdownOptions(form.dropdownOptions) },
      });
      qc.invalidateQueries({ queryKey: sectionsQueryKey });
      toast({ title: "Field updated" });
      onCancelEdit();
    } catch {
      toast({ variant: "destructive", title: "Failed to update field" });
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete field "${field.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: sectionId, fieldId: field.id });
      qc.invalidateQueries({ queryKey: sectionsQueryKey });
      toast({ title: "Field deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete field" });
    }
  };

  if (isEditing) {
    return (
      <InlineFieldForm
        form={form}
        onChange={setForm}
        onSave={handleSave}
        onCancel={() => { setForm(fieldToForm(field)); onCancelEdit(); }}
        saving={updateMutation.isPending}
        saveLabel="Save Changes"
      />
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/10 transition-colors group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-muted-foreground w-20 flex-shrink-0">
          <FieldTypeIcon type={field.fieldType} />
          <span className="text-xs capitalize truncate">{field.fieldType}</span>
        </div>
        <span className="text-sm font-medium truncate">{field.name}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {field.isRequired && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary">Required</Badge>
          )}
          {field.includeInTotal && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-500/40 text-emerald-500">In Total</Badge>
          )}
          {showCostWarning && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-500/40 text-amber-500 gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" /> Excluded
            </Badge>
          )}
          {field.visibleByRole !== "all" && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-muted-foreground/40 text-muted-foreground capitalize">
              {field.visibleByRole}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={onStartEdit}
          title="Edit field"
          className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-accent/30"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        {isAdmin && (
          <button
            onClick={handleDelete}
            title="Delete field"
            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function SectionCard({ section, sectionsQueryKey, isAdmin }: { section: CustomSectionWithFields; sectionsQueryKey: readonly unknown[]; isAdmin: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateMutation = useUpdateCustomSection();
  const deleteMutation = useDeleteCustomSection();
  const addFieldMutation = useAddCustomField();

  const [expanded, setExpanded] = useState((section.fields ?? []).length > 0);
  const [editingSection, setEditingSection] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [editColor, setEditColor] = useState(section.color);
  const [editRequired, setEditRequired] = useState(section.isRequired);
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldForm, setNewFieldForm] = useState<FieldForm>(EMPTY_FIELD);

  const resetSectionEdit = () => {
    setEditName(section.name);
    setEditColor(section.color);
    setEditRequired(section.isRequired);
    setEditingSection(false);
  };

  const handleSaveSection = async () => {
    if (!editName.trim()) return;
    try {
      await updateMutation.mutateAsync({
        id: section.id,
        data: { name: editName, color: editColor, isRequired: editRequired },
      });
      qc.invalidateQueries({ queryKey: sectionsQueryKey });
      toast({ title: "Section updated" });
      setEditingSection(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to update section" });
    }
  };

  const handleToggleArchive = async () => {
    try {
      await updateMutation.mutateAsync({ id: section.id, data: { isArchived: !section.isArchived } });
      qc.invalidateQueries({ queryKey: sectionsQueryKey });
      toast({ title: section.isArchived ? "Section restored" : "Section archived" });
    } catch {
      toast({ variant: "destructive", title: "Failed to update section" });
    }
  };

  const handleDeleteSection = async () => {
    if (!confirm(`Delete "${section.name}" and all its fields?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: section.id });
      qc.invalidateQueries({ queryKey: sectionsQueryKey });
      toast({ title: "Section deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete section" });
    }
  };

  const handleAddField = async () => {
    if (!newFieldForm.name.trim()) return;
    try {
      await addFieldMutation.mutateAsync({
        id: section.id,
        data: { ...newFieldForm, dropdownOptions: serializeDropdownOptions(newFieldForm.dropdownOptions) },
      });
      qc.invalidateQueries({ queryKey: sectionsQueryKey });
      toast({ title: "Field added" });
      setNewFieldForm(EMPTY_FIELD);
      setShowAddField(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to add field" });
    }
  };

  const fields = (section.fields ?? []) as CustomField[];

  return (
    <Card className={`border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden transition-all ${section.isArchived ? "opacity-60" : ""}`}>
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/10 transition-colors"
        onClick={() => { if (!editingSection) setExpanded((v) => !v); }}
      >
        <div
          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
          style={{ background: section.color, boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${section.color}60` }}
        />

        {editingSection ? (
          <div className="flex-1 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-3 flex-wrap items-end">
              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label className="text-xs font-medium">Section Name *</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveSection(); if (e.key === "Escape") resetSectionEdit(); }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Color</Label>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={editRequired} onCheckedChange={setEditRequired} />
                <span className="text-xs">Required in Workflow</span>
              </label>
              <div className="flex gap-2 ml-auto">
                <Button size="sm" variant="outline" onClick={resetSectionEdit} className="h-7 text-xs gap-1">
                  <X className="w-3 h-3" /> Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveSection}
                  disabled={!editName.trim() || updateMutation.isPending}
                  className="h-7 text-xs gap-1"
                >
                  {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">{section.name}</span>
                {section.isRequired && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary flex-shrink-0">Required</Badge>
                )}
                {section.isArchived && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-500/40 text-amber-500 flex-shrink-0">Archived</Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{fields.length} {fields.length === 1 ? "field" : "fields"}</span>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setEditName(section.name); setEditColor(section.color); setEditRequired(section.isRequired); setEditingSection(true); }}
                title="Edit section"
                className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-accent/30"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleToggleArchive}
                title={section.isArchived ? "Restore" : "Archive"}
                className="p-1.5 text-muted-foreground hover:text-amber-500 transition-colors rounded-md hover:bg-amber-500/10"
              >
                {section.isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              </button>
              {isAdmin && (
                <button
                  onClick={handleDeleteSection}
                  title="Delete section"
                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {expanded
                ? <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
              }
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40">
              {fields.length === 0 && !showAddField ? (
                <div className="px-6 py-8 text-center text-muted-foreground">
                  <Hash className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-medium">No fields yet</p>
                  <p className="text-xs mt-1">Add fields to collect data in this section.</p>
                  <Button size="sm" variant="outline" onClick={() => setShowAddField(true)} className="mt-3 gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Add First Field
                  </Button>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-border/30">
                    {fields.map((field: CustomField) => (
                      <FieldRow
                        key={field.id}
                        field={field}
                        sectionId={section.id}
                        isEditing={editingFieldId === field.id}
                        onStartEdit={() => setEditingFieldId(field.id)}
                        onCancelEdit={() => setEditingFieldId(null)}
                        sectionsQueryKey={sectionsQueryKey}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                  {!showAddField && (
                    <div className="px-4 py-3 border-t border-border/30">
                      <Button size="sm" variant="outline" onClick={() => setShowAddField(true)} className="gap-1.5 h-7 text-xs">
                        <Plus className="w-3 h-3" /> Add Field
                      </Button>
                    </div>
                  )}
                </>
              )}
              {showAddField && (
                <div className="px-4 py-3 border-t border-border/30">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">New Field</p>
                  <InlineFieldForm
                    form={newFieldForm}
                    onChange={setNewFieldForm}
                    onSave={handleAddField}
                    onCancel={() => { setShowAddField(false); setNewFieldForm(EMPTY_FIELD); }}
                    saving={addFieldMutation.isPending}
                    saveLabel="Add Field"
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function ExtraFieldRow({
  field,
  onDeleted,
}: {
  field: BuiltinExtraField;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const updateMutation = useUpdateBuiltinExtra();
  const deleteMutation = useDeleteBuiltinExtra();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FieldForm>({
    name: field.name,
    fieldType: field.fieldType,
    placeholder: field.placeholder,
    helpText: field.helpText,
    defaultValue: field.defaultValue,
    isRequired: field.isRequired,
    includeInTotal: field.includeInTotal,
    visibleByRole: field.visibleByRole,
    editableByRole: field.editableByRole,
    dropdownOptions: (() => {
      try { const p = JSON.parse(field.dropdownOptions || "[]"); return Array.isArray(p) ? p.join("\n") : ""; } catch { return ""; }
    })(),
  });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      await updateMutation.mutateAsync({
        fieldId: field.id,
        data: { ...form, dropdownOptions: serializeDropdownOptions(form.dropdownOptions) },
      });
      toast({ title: "Field updated" });
      setIsEditing(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to update field" });
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete field "${field.name}"? This will also remove all saved values for this field.`)) return;
    try {
      await deleteMutation.mutateAsync(field.id);
      toast({ title: "Field deleted" });
      onDeleted();
    } catch {
      toast({ variant: "destructive", title: "Failed to delete field" });
    }
  };

  if (isEditing) {
    return (
      <div className="px-3 py-2">
        <InlineFieldForm
          form={form}
          onChange={setForm}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
          saving={updateMutation.isPending}
          saveLabel="Save Changes"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/10 group/extrafield transition-colors">
      <div className="flex items-center gap-1.5 text-muted-foreground w-14 flex-shrink-0">
        <FieldTypeIcon type={field.fieldType} />
        <span className="text-xs capitalize truncate">{field.fieldType}</span>
      </div>
      <span className="text-sm flex-1 min-w-0 truncate font-medium">{field.name}</span>
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/extrafield:opacity-100 transition-opacity">
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 text-muted-foreground hover:text-primary transition-colors rounded"
          title="Edit field"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
          title="Delete field"
        >
          {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

function BuiltInSectionRow({ sectionKey, defaultTitle, currentTitle, settings, onSaveMany }: {
  sectionKey: string;
  defaultTitle: string;
  currentTitle: string;
  settings: Record<string, string>;
  onSaveMany: (updates: Record<string, string>) => Promise<void>;
}) {
  const { toast } = useToast();
  const { data: extrasMap = {}, refetch: refetchExtras } = useGetBuiltinExtras();
  const addExtraMutation = useAddBuiltinExtra();

  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(currentTitle);
  const [savingName, setSavingName] = useState(false);
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [fieldLabelValue, setFieldLabelValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [togglingField, setTogglingField] = useState<string | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldForm, setNewFieldForm] = useState<FieldForm>(EMPTY_FIELD);
  const [addingSaved, setAddingSaved] = useState(false);

  const fieldDefs = Object.entries(BUILT_IN_FIELD_DEFAULTS[sectionKey] ?? {});
  const extraFields: BuiltinExtraField[] = extrasMap[sectionKey] ?? [];
  const visibleBuiltinCount = fieldDefs.filter(([k]) => !isBuiltInFieldHidden(settings, sectionKey, k)).length;
  const totalFieldCount = visibleBuiltinCount + extraFields.length;
  const allFieldCount = fieldDefs.length + extraFields.length;

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    setSavingName(true);
    await onSaveMany({ [sectionKey]: nameValue.trim() });
    setSavingName(false);
    setEditingName(false);
  };

  const handleToggleField = async (fieldKey: string) => {
    setTogglingField(fieldKey);
    const hiddenKey = builtInFieldHiddenKey(sectionKey, fieldKey);
    const nowHidden = isBuiltInFieldHidden(settings, sectionKey, fieldKey);
    await onSaveMany({ [hiddenKey]: nowHidden ? "" : "1" });
    setTogglingField(null);
  };

  const handleSaveFieldLabel = async (fieldKey: string) => {
    if (!fieldLabelValue.trim()) return;
    setSavingField(true);
    const labelKey = builtInFieldLabelKey(sectionKey, fieldKey);
    await onSaveMany({ [labelKey]: fieldLabelValue.trim() });
    setSavingField(false);
    setEditingFieldKey(null);
  };

  const handleResetFieldLabel = async (fieldKey: string) => {
    setSavingField(true);
    const labelKey = builtInFieldLabelKey(sectionKey, fieldKey);
    await onSaveMany({ [labelKey]: "" });
    setSavingField(false);
    setEditingFieldKey(null);
  };

  const handleAddExtraField = async () => {
    if (!newFieldForm.name.trim()) return;
    setAddingSaved(true);
    try {
      await addExtraMutation.mutateAsync({
        builtinSectionKey: sectionKey,
        ...newFieldForm,
        dropdownOptions: serializeDropdownOptions(newFieldForm.dropdownOptions),
      });
      toast({ title: "Field added" });
      setNewFieldForm(EMPTY_FIELD);
      setShowAddField(false);
      refetchExtras();
    } catch {
      toast({ variant: "destructive", title: "Failed to add field" });
    }
    setAddingSaved(false);
  };

  return (
    <div>
      {/* Section header row */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/10 transition-colors group rounded-md cursor-pointer"
        onClick={() => !editingName && setExpanded(v => !v)}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-muted-foreground/30" />
        {editingName ? (
          <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
            <Input
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              className="h-7 text-sm flex-1"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") { setNameValue(currentTitle); setEditingName(false); } }}
            />
            <Button size="sm" variant="outline" onClick={() => { setNameValue(currentTitle); setEditingName(false); }} className="h-7 text-xs px-2">
              <X className="w-3 h-3" />
            </Button>
            <Button size="sm" onClick={handleSaveName} disabled={!nameValue.trim() || savingName} className="h-7 text-xs gap-1 px-2">
              {savingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Save
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{currentTitle}</span>
              {currentTitle !== defaultTitle && (
                <span className="ml-1.5 text-xs text-muted-foreground">({defaultTitle})</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {totalFieldCount}/{allFieldCount} fields
            </span>
            <button
              onClick={e => { e.stopPropagation(); setNameValue(currentTitle); setEditingName(true); }}
              className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-accent/30 opacity-0 group-hover:opacity-100 flex-shrink-0"
              title="Rename section"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {expanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          </>
        )}
      </div>

      {/* Fields list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="ml-7 border-l border-border/40 pl-3 pb-2 pt-1">
              {/* Built-in default fields */}
              {fieldDefs.map(([fieldKey, defaultLabel]) => {
                const hidden = isBuiltInFieldHidden(settings, sectionKey, fieldKey);
                const customLabel = settings[builtInFieldLabelKey(sectionKey, fieldKey)];
                const displayLabel = customLabel || defaultLabel;
                const isEditingThis = editingFieldKey === fieldKey;

                return (
                  <div
                    key={fieldKey}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/10 group/field transition-colors ${hidden ? "opacity-40" : ""}`}
                  >
                    {isEditingThis ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={fieldLabelValue}
                          onChange={e => setFieldLabelValue(e.target.value)}
                          className="h-7 text-xs flex-1"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter") handleSaveFieldLabel(fieldKey); if (e.key === "Escape") setEditingFieldKey(null); }}
                        />
                        {customLabel && (
                          <button onClick={() => handleResetFieldLabel(fieldKey)} className="text-xs text-muted-foreground hover:text-destructive px-1 flex-shrink-0" title="Reset to default">
                            Reset
                          </button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setEditingFieldKey(null)} className="h-7 text-xs px-2 flex-shrink-0">
                          <X className="w-3 h-3" />
                        </Button>
                        <Button size="sm" onClick={() => handleSaveFieldLabel(fieldKey)} disabled={!fieldLabelValue.trim() || savingField} className="h-7 text-xs gap-1 px-2 flex-shrink-0">
                          {savingField ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm flex-1 min-w-0 truncate">{displayLabel}</span>
                        {customLabel && (
                          <span className="text-xs text-muted-foreground flex-shrink-0 truncate max-w-[120px]">({defaultLabel})</span>
                        )}
                        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/field:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setFieldLabelValue(displayLabel); setEditingFieldKey(fieldKey); }}
                            className="p-1 text-muted-foreground hover:text-primary transition-colors rounded"
                            title="Rename field"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleToggleField(fieldKey)}
                            disabled={togglingField === fieldKey}
                            className={`p-1 transition-colors rounded ${hidden ? "text-muted-foreground hover:text-emerald-500" : "text-muted-foreground hover:text-destructive"}`}
                            title={hidden ? "Restore this field" : "Remove this field"}
                          >
                            {togglingField === fieldKey
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : hidden
                                ? <Eye className="w-3 h-3" />
                                : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </>
                    )}
                    {!isEditingThis && hidden && (
                      <span className="text-[10px] text-muted-foreground italic flex-shrink-0">hidden</span>
                    )}
                  </div>
                );
              })}

              {/* Extra custom fields added to this section */}
              {extraFields.length > 0 && (
                <div className="mt-1 pt-1 border-t border-border/30">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-1">Added fields</p>
                  {extraFields.map(ef => (
                    <ExtraFieldRow
                      key={ef.id}
                      field={ef}
                      onDeleted={() => refetchExtras()}
                    />
                  ))}
                </div>
              )}

              {/* Add field button / form */}
              {showAddField ? (
                <div className="mt-2 px-1">
                  <InlineFieldForm
                    form={newFieldForm}
                    onChange={setNewFieldForm}
                    onSave={handleAddExtraField}
                    onCancel={() => { setShowAddField(false); setNewFieldForm(EMPTY_FIELD); }}
                    saving={addingSaved}
                    saveLabel="Add Field"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowAddField(true)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-accent/10 w-full"
                >
                  <Plus className="w-3 h-3" />
                  Add field to this section
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function EditSectionsTab({ containerId, isAdmin }: { containerId: number; isAdmin: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const SECTIONS_QUERY_KEY = getGetCustomSectionsQueryKey({ containerId });
  const { data: sections = [], isLoading } = useGetCustomSections({ containerId });
  const { data: settings = {} } = useGetSettings();
  const updateSettingsMutation = useUpdateSettings();
  const createMutation = useCreateCustomSection();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newRequired, setNewRequired] = useState(false);

  const handleSaveBuiltInSettings = async (updates: Record<string, string>) => {
    try {
      await updateSettingsMutation.mutateAsync(updates);
    } catch {
      toast({ variant: "destructive", title: "Failed to save" });
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createMutation.mutateAsync({ data: { name: newName, color: newColor, isRequired: newRequired, containerId } });
      qc.invalidateQueries({ queryKey: SECTIONS_QUERY_KEY });
      toast({ title: "Section created" });
      setNewName("");
      setNewColor("#6366f1");
      setNewRequired(false);
      setShowCreate(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to create section" });
    }
  };

  const sectionsList = sections as CustomSectionWithFields[];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Built-in sections renaming */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Built-in Sections</p>
          <p className="text-xs text-muted-foreground">Click to expand · hover to rename</p>
        </div>
        <Card className="border-border/40 bg-card/50">
          <div className="divide-y divide-border/30 py-1">
            {BUILT_IN_SECTIONS.map(s => (
              <BuiltInSectionRow
                key={s.key}
                sectionKey={s.key}
                defaultTitle={s.defaultTitle}
                currentTitle={(settings as Record<string, string>)[s.key] ?? s.defaultTitle}
                settings={settings as Record<string, string>}
                onSaveMany={handleSaveBuiltInSettings}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Custom sections */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom Sections</p>
          <Button onClick={() => setShowCreate((v) => !v)} className="gap-2 shadow-md" size="sm">
            <Plus className="w-4 h-4" /> New Section
          </Button>
        </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-medium text-primary uppercase tracking-wider">Create New Section</p>
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="space-y-1 flex-1 min-w-[180px]">
                    <Label className="text-xs font-medium">Section Name *</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Bank Charges"
                      className="h-8 text-sm"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Color</Label>
                    <ColorPicker value={newColor} onChange={setNewColor} />
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={newRequired} onCheckedChange={setNewRequired} />
                    <span className="text-xs">Required in Workflow</span>
                  </label>
                  <div className="flex gap-2 ml-auto">
                    <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); setNewName(""); }} className="h-7 text-xs gap-1">
                      <X className="w-3 h-3" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreate}
                      disabled={!newName.trim() || createMutation.isPending}
                      className="h-7 text-xs gap-1"
                    >
                      {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Create
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {sectionsList.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No custom sections yet</p>
          <p className="text-sm mt-1">Create your first section to start adding custom cost fields.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sectionsList.map((section) => (
            <SectionCard key={section.id} section={section} sectionsQueryKey={SECTIONS_QUERY_KEY} isAdmin={isAdmin} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
