import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser, useListClients, useGetUserClientAssignments, useAddClientAssignment, useRemoveClientAssignment } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Shield, User as UserIcon, Pencil, PowerOff, Power, UploadCloud, Users2, X, Check, Truck, Info } from "lucide-react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { SECTION_LABELS, CHARGE_SECTIONS, parseSectionPermissions, type SectionPermLevel } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { useBranches, type Branch } from "@/pages/branches/index";

type SectionPermissionsMap = Record<string, SectionPermLevel>;

const PERM_LEVELS: { value: SectionPermLevel; label: string }[] = [
  { value: "no_access", label: "No Access" },
  { value: "view", label: "View Only" },
  { value: "edit", label: "Edit" },
];

function GranularPermissionsEditor({
  value,
  onChange,
  disabled,
}: {
  value: SectionPermissionsMap;
  onChange: (v: SectionPermissionsMap) => void;
  disabled?: boolean;
}) {
  const handleChange = (section: string, perm: SectionPermLevel) => {
    onChange({ ...value, [section]: perm });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Section Permissions</p>
      <div className="border border-border/50 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Section</th>
              {PERM_LEVELS.map(p => (
                <th key={p.value} className="px-3 py-2 text-center font-medium">{p.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {CHARGE_SECTIONS.map(section => {
              const current = value[section] ?? "no_access";
              return (
                <tr key={section} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-2.5 font-medium capitalize text-foreground/80">{SECTION_LABELS[section] ?? section}</td>
                  {PERM_LEVELS.map(p => (
                    <td key={p.value} className="px-3 py-2.5 text-center">
                      <input
                        type="radio"
                        name={`perm-${section}`}
                        value={p.value}
                        checked={current === p.value}
                        disabled={disabled}
                        onChange={() => handleChange(section, p.value)}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ALL_ROLES = [
  "super_admin", "admin", "staff",
  "documentation_user", "accounts_user", "operations_user",
  "transire_user", "shipping_user", "terminal_user", "pull_out_user",
  "shipping_terminal_user",
  "terminal_manager", "delivery_user", "security_user",
] as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrator",
  staff: "Staff",
  documentation_user: "Documentation",
  accounts_user: "Accounts",
  operations_user: "Operations (Legacy)",
  transire_user: "Transire",
  shipping_user: "Shipping",
  terminal_user: "Terminal",
  pull_out_user: "Pull-Out",
  shipping_terminal_user: "Shipping & Terminal (Legacy)",
  terminal_manager: "Terminal Manager",
  delivery_user: "Delivery / Transport",
  security_user: "Gate Security",
};

const createSchema = z.object({
  name:     z.string().min(2, "Name required"),
  email:    z.string().email("Valid email required"),
  password: z.string().min(6, "Min 6 characters"),
  role:     z.enum(ALL_ROLES),
});

const editSchema = z.object({
  name:     z.string().min(2, "Name required"),
  role:     z.enum(ALL_ROLES),
  password: z.string().optional(),
});

type UserRow = {
  id: number; name: string; email: string; role: string;
  roles?: string[];
  sectionPermission?: string | null;
  sectionPermissions?: string | null;
  canUpload?: boolean;
  branchId?: number | null;
  isActive: boolean; createdAt: string;
};

function BranchSelectField({
  branches, value, onChange, disabled,
}: {
  branches: Branch[] | undefined;
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium leading-none">Branch</label>
      <Select
        value={value != null ? String(value) : undefined}
        onValueChange={(v) => onChange(Number(v))}
        disabled={disabled}
      >
        <SelectTrigger><SelectValue placeholder="Select a branch..." /></SelectTrigger>
        <SelectContent>
          {(branches ?? []).filter(b => b.isActive || b.id === value).map(b => (
            <SelectItem key={b.id} value={String(b.id)}>
              {b.name}{b.shortCode ? ` (${b.shortCode})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        The user will only see data belonging to this branch.
      </p>
    </div>
  );
}

const WORKSPACE_ROLES: { value: string; label: string; color: string }[] = [
  { value: "transire_user",  label: "Transire",     color: "border-violet-500 text-violet-400 bg-violet-500/10" },
  { value: "shipping_user",  label: "Shipping",     color: "border-sky-500 text-sky-400 bg-sky-500/10"         },
  { value: "terminal_user",  label: "Terminal Ops", color: "border-amber-500 text-amber-400 bg-amber-500/10"   },
  { value: "pull_out_user",  label: "Pull-Out",     color: "border-emerald-500 text-emerald-400 bg-emerald-500/10" },
];

const DEPT_ROLES = [
  "documentation_user", "accounts_user", "operations_user",
  "transire_user", "shipping_user", "terminal_user", "pull_out_user",
  "shipping_terminal_user", "terminal_manager", "delivery_user", "security_user",
];

function formatPermissionsSummary(user: UserRow): string {
  if (user.role === "super_admin") return "Full system control";
  if (user.role === "admin") return "All sections";
  if (DEPT_ROLES.includes(user.role)) return `${ROLE_LABELS[user.role] ?? user.role} department access`;
  if (user.sectionPermissions) {
    const perms = parseSectionPermissions(user.sectionPermissions);
    const editSections = Object.entries(perms).filter(([, v]) => v === "edit").map(([k]) => SECTION_LABELS[k] ?? k);
    const viewSections = Object.entries(perms).filter(([, v]) => v === "view").map(([k]) => SECTION_LABELS[k] ?? k);
    const parts: string[] = [];
    if (editSections.length > 0) parts.push(`Edit: ${editSections.join(", ")}`);
    if (viewSections.length > 0) parts.push(`View: ${viewSections.join(", ")}`);
    return parts.length > 0 ? parts.join(" | ") : "No access";
  }
  if (user.sectionPermission) return `${SECTION_LABELS[user.sectionPermission] ?? user.sectionPermission} (legacy)`;
  return "All sections";
}

function WorkspaceRoleCheckboxes({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(r => r !== value) : [...selected, value]);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Department Workspace Access</p>
      <p className="text-xs text-muted-foreground">Tick all workspace queues this user can work in simultaneously.</p>
      <div className="grid grid-cols-2 gap-2">
        {WORKSPACE_ROLES.map(wr => (
          <button
            key={wr.value}
            type="button"
            onClick={() => toggle(wr.value)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              selected.includes(wr.value)
                ? `${wr.color} border-current`
                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground bg-secondary/10"
            }`}
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
              selected.includes(wr.value) ? "border-current bg-current/20" : "border-muted-foreground/40"
            }`}>
              {selected.includes(wr.value) && <Check className="w-2.5 h-2.5" />}
            </span>
            {wr.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [sectionPerms, setSectionPerms] = useState<SectionPermissionsMap>({});
  const [canUpload, setCanUpload] = useState(false);
  const [workspaceRoles, setWorkspaceRoles] = useState<string[]>([]);
  const { user: currentUser } = useAuth();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number | null>(
    currentUser?.branchId ?? null
  );
  const createMutation = useCreateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", email: "", password: "", role: "staff" as typeof ALL_ROLES[number] },
  });

  const watchedRole = form.watch("role");
  const isNonElevated = !["super_admin", "admin"].includes(watchedRole);

  const onSubmit = (data: any) => {
    const allRoles = [...new Set([data.role, ...workspaceRoles])];
    const payload: any = {
      name: data.name, email: data.email, password: data.password,
      role: data.role, roles: allRoles,
    };
    if (branchId != null) payload.branchId = branchId;
    if (data.role === "staff") {
      payload.sectionPermissions = JSON.stringify(sectionPerms);
      payload.canUpload = canUpload;
    }
    createMutation.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        toast({ title: "User created successfully." });
        setOpen(false);
        form.reset();
        setSectionPerms({});
        setCanUpload(false);
        setWorkspaceRoles([]);
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="hover-elevate active:scale-95 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" placeholder="Min. 6 characters" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Role</FormLabel>
                <Select onValueChange={(v) => { field.onChange(v); setWorkspaceRoles([]); }} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="documentation_user">Documentation</SelectItem>
                    <SelectItem value="accounts_user">Accounts</SelectItem>
                    <SelectItem value="transire_user">Transire</SelectItem>
                    <SelectItem value="shipping_user">Shipping</SelectItem>
                    <SelectItem value="terminal_user">Terminal</SelectItem>
                    <SelectItem value="pull_out_user">Pull-Out</SelectItem>
                    <SelectItem value="shipping_terminal_user">Shipping &amp; Terminal (Legacy)</SelectItem>
                    <SelectItem value="terminal_manager">Terminal Manager</SelectItem>
                    <SelectItem value="delivery_user">Delivery / Transport</SelectItem>
                    <SelectItem value="security_user">Gate Security</SelectItem>
                    <SelectItem value="operations_user">Operations (Legacy)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <BranchSelectField branches={branches} value={branchId} onChange={setBranchId} />
            {isNonElevated && (
              <WorkspaceRoleCheckboxes
                selected={workspaceRoles}
                onChange={setWorkspaceRoles}
              />
            )}
            {watchedRole === "delivery_user" && (
              <div className="flex items-start gap-3 rounded-lg border border-teal-500/30 bg-teal-500/5 px-4 py-3">
                <Truck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-teal-400">Delivery / Transport Account</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This user will only see containers in the <strong>Delivery</strong> and <strong>Empty Return</strong> stages. They can advance job status and view job details, but cannot access financial data, invoices, or admin tools.
                  </p>
                </div>
              </div>
            )}
            {watchedRole === "staff" && (
              <>
                <GranularPermissionsEditor value={sectionPerms} onChange={setSectionPerms} />
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <UploadCloud className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Upload Access</p>
                      <p className="text-xs text-muted-foreground">Allow this user to bulk-upload container data files</p>
                    </div>
                  </div>
                  <Switch checked={canUpload} onCheckedChange={setCanUpload} />
                </div>
              </>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create User
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const updateMutation = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number | null>(user.branchId ?? null);

  const initialPerms = parseSectionPermissions(user.sectionPermissions);
  const [sectionPerms, setSectionPerms] = useState<SectionPermissionsMap>(initialPerms);
  const [canUpload, setCanUpload] = useState(user.canUpload ?? false);

  const initialWorkspaceRoles = (user.roles ?? [user.role])
    .filter(r => WORKSPACE_ROLES.some(wr => wr.value === r) && r !== user.role);
  const [workspaceRoles, setWorkspaceRoles] = useState<string[]>(initialWorkspaceRoles);

  const form = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: { name: user.name, role: user.role as typeof ALL_ROLES[number], password: "" },
  });

  const watchedRole = form.watch("role");
  const isNonElevated = !["super_admin", "admin"].includes(watchedRole);

  const onSubmit = (data: any) => {
    const allRoles = [...new Set([data.role, ...workspaceRoles])];
    const payload: any = { name: data.name, role: data.role, roles: allRoles };
    if (branchId != null && branchId !== user.branchId) payload.branchId = branchId;
    if (data.password) payload.password = data.password;
    if (data.role === "staff") {
      payload.sectionPermissions = JSON.stringify(sectionPerms);
      payload.canUpload = canUpload;
    } else {
      payload.sectionPermissions = null;
      payload.canUpload = true;
    }
    updateMutation.mutate({ id: user.id, data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        toast({ title: "User updated successfully." });
        onClose();
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  return (
    <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Edit User — {user.name}</DialogTitle></DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="text-sm text-muted-foreground bg-secondary/30 rounded px-3 py-2">
            Email: <span className="font-mono text-foreground">{user.email}</span>
          </div>
          <FormField control={form.control} name="role" render={({ field }) => (
            <FormItem>
              <FormLabel>Primary Role</FormLabel>
              <Select onValueChange={(v) => { field.onChange(v); setWorkspaceRoles([]); }} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="documentation_user">Documentation</SelectItem>
                  <SelectItem value="accounts_user">Accounts</SelectItem>
                  <SelectItem value="transire_user">Transire</SelectItem>
                  <SelectItem value="shipping_user">Shipping</SelectItem>
                  <SelectItem value="terminal_user">Terminal</SelectItem>
                  <SelectItem value="pull_out_user">Pull-Out</SelectItem>
                  <SelectItem value="shipping_terminal_user">Shipping &amp; Terminal (Legacy)</SelectItem>
                  <SelectItem value="terminal_manager">Terminal Manager</SelectItem>
                  <SelectItem value="delivery_user">Delivery / Transport</SelectItem>
                  <SelectItem value="security_user">Gate Security</SelectItem>
                  <SelectItem value="operations_user">Operations (Legacy)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <BranchSelectField branches={branches} value={branchId} onChange={setBranchId} />
          {isNonElevated && (
            <WorkspaceRoleCheckboxes
              selected={[...new Set([...(WORKSPACE_ROLES.some(w => w.value === watchedRole) ? [watchedRole] : []), ...workspaceRoles])]}
              onChange={(v) => setWorkspaceRoles(v.filter(r => r !== watchedRole))}
            />
          )}
          {watchedRole === "delivery_user" && (
            <div className="flex items-start gap-3 rounded-lg border border-teal-500/30 bg-teal-500/5 px-4 py-3">
              <Truck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-teal-400">Delivery / Transport Account</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This user will only see containers in the <strong>Delivery</strong> and <strong>Empty Return</strong> stages. They can advance job status and view job details, but cannot access financial data, invoices, or admin tools.
                </p>
              </div>
            </div>
          )}
          {watchedRole === "staff" && (
            <>
              <GranularPermissionsEditor value={sectionPerms} onChange={setSectionPerms} />
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <UploadCloud className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Upload Access</p>
                    <p className="text-xs text-muted-foreground">Allow this user to bulk-upload container data files</p>
                  </div>
                </div>
                <Switch checked={canUpload} onCheckedChange={setCanUpload} />
              </div>
            </>
          )}
          <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel>New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></FormLabel>
              <FormControl><Input type="password" placeholder="New password (optional)" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  );
}

function AssignClientsDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { data: assignments, isLoading: loadingAssignments } = useGetUserClientAssignments(user.id);
  const { data: allClients, isLoading: loadingClients } = useListClients();
  const addMutation = useAddClientAssignment(user.id);
  const removeMutation = useRemoveClientAssignment(user.id);
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const assignedIds = new Set((assignments ?? []).map(a => a.id));
  const filtered = (allClients ?? []).filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = async (clientId: number, isAssigned: boolean) => {
    try {
      if (isAssigned) {
        await removeMutation.mutateAsync({ clientId });
      } else {
        await addMutation.mutateAsync({ clientId });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const isBusy = addMutation.isPending || removeMutation.isPending;

  return (
    <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users2 className="w-4 h-4 text-primary" />
          Assign Clients — {user.name}
        </DialogTitle>
      </DialogHeader>
      <div className="text-xs text-muted-foreground px-1 pb-2">
        {assignedIds.size === 0
          ? "No clients assigned — this user can access all clients."
          : `${assignedIds.size} client${assignedIds.size !== 1 ? "s" : ""} assigned — user only sees these clients.`}
      </div>
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search clients…"
        className="h-8 text-xs mb-2"
      />
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {(loadingAssignments || loadingClients) ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No clients found.</p>
        ) : (
          filtered.map(client => {
            const isAssigned = assignedIds.has(client.id);
            return (
              <button
                key={client.id}
                onClick={() => handleToggle(client.id, isAssigned)}
                disabled={isBusy}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  isAssigned
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/40 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span className="text-sm font-medium">{client.name}</span>
                {isAssigned ? (
                  <span className="flex items-center gap-1 text-xs text-primary font-medium">
                    <Check className="w-3.5 h-3.5" /> Assigned
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">+ Assign</span>
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-border/40">
        <p className="text-[10px] text-muted-foreground">
          Click a client to toggle assignment
        </p>
        <Button size="sm" variant="outline" onClick={onClose}>Done</Button>
      </div>
    </DialogContent>
  );
}

export default function Users() {
  const { isAdmin, isSuperAdmin, user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const { data: users, isLoading } = useListUsers();
  const { data: branches } = useBranches({ enabled: isSuperAdmin });
  const branchNameById = new Map((branches ?? []).map(b => [b.id, b.name]));
  const updateMutation = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [assigningUser, setAssigningUser] = useState<UserRow | null>(null);

  if (!isAdmin) { setLocation("/"); return null; }

  const handleToggleActive = (u: UserRow) => {
    if (u.id === currentUser?.id) {
      toast({ variant: "destructive", title: "Cannot disable your own account." });
      return;
    }
    updateMutation.mutate(
      { id: u.id, data: { isActive: !u.isActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/users"] });
          toast({ title: u.isActive ? "User disabled." : "User enabled." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
      }
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage system access, roles, and section permissions.</p>
        </div>
        {isSuperAdmin && <CreateUserDialog />}
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-secondary/30 uppercase font-mono tracking-wider border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Role</th>
                {isSuperAdmin && <th className="px-6 py-4 font-medium">Branch</th>}
                <th className="px-6 py-4 font-medium">Section Access</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Created</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={isSuperAdmin ? 7 : 6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : users?.length === 0 ? (
                <tr><td colSpan={isSuperAdmin ? 7 : 6} className="px-6 py-12 text-center text-muted-foreground text-sm">No users found.</td></tr>
              ) : (
                users?.map((u) => (
                  <tr key={u.id} className={`transition-colors ${u.isActive ? "hover:bg-accent/50" : "opacity-60 hover:bg-accent/30"}`}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{u.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {((u as UserRow).roles ?? [u.role]).map(r => {
                          const wsRole = WORKSPACE_ROLES.find(w => w.value === r);
                          return (
                            <Badge key={r} variant="outline" className={
                              r === "super_admin"
                                ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                                : r === "admin"
                                ? "border-primary text-primary bg-primary/10"
                                : wsRole
                                ? wsRole.color
                                : "border-border text-muted-foreground"
                            }>
                              {(r === "super_admin" || r === "admin") ? <Shield className="w-3 h-3 mr-1" /> : <UserIcon className="w-3 h-3 mr-1" />}
                              {ROLE_LABELS[r] ?? r}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-6 py-4">
                        {(() => {
                          const bid = (u as UserRow).branchId;
                          const name = bid != null ? branchNameById.get(bid) : null;
                          return name ? (
                            <Badge variant="outline" className="border-border text-foreground/80">{name}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          );
                        })()}
                      </td>
                    )}
                    <td className="px-6 py-4 max-w-xs">
                      <span className="text-xs text-foreground/70 line-clamp-2">{formatPermissionsSummary(u as UserRow)}</span>
                    </td>
                    <td className="px-6 py-4">
                      {u.isActive ? (
                        <span className="flex items-center gap-2 text-xs font-medium text-emerald-500">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <span className="w-2 h-2 rounded-full bg-muted-foreground" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isSuperAdmin && (
                          <Dialog open={editingUser?.id === u.id} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => setEditingUser(u as UserRow)}
                                className="h-8 px-3 text-xs hover:bg-primary/10 hover:text-primary">
                                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                              </Button>
                            </DialogTrigger>
                            {editingUser?.id === u.id && (
                              <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} />
                            )}
                          </Dialog>
                        )}
                        {u.role !== "super_admin" && (
                          <Dialog open={assigningUser?.id === u.id} onOpenChange={(open) => { if (!open) setAssigningUser(null); }}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => setAssigningUser(u as UserRow)}
                                className="h-8 px-3 text-xs hover:bg-primary/10 hover:text-primary">
                                <Users2 className="w-3.5 h-3.5 mr-1" /> Clients
                              </Button>
                            </DialogTrigger>
                            {assigningUser?.id === u.id && (
                              <AssignClientsDialog user={assigningUser} onClose={() => setAssigningUser(null)} />
                            )}
                          </Dialog>
                        )}
                        {isSuperAdmin && (
                          <Button variant="ghost" size="sm" onClick={() => handleToggleActive(u as UserRow)}
                            disabled={updateMutation.isPending || u.id === currentUser?.id}
                            className={`h-8 px-3 text-xs ${u.isActive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-emerald-500/10 hover:text-emerald-500"}`}>
                            {u.isActive ? <><PowerOff className="w-3.5 h-3.5 mr-1" /> Disable</> : <><Power className="w-3.5 h-3.5 mr-1" /> Enable</>}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
}
