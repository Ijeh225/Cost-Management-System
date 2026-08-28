import { useEffect, useState } from "react";
import { customFetch, useListUsers, useCreateUser, useUpdateUser, useListClients, useGetUserClientAssignments, useAddClientAssignment, useRemoveClientAssignment } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Shield, ShieldCheck, User as UserIcon, Pencil, PowerOff, Power, Users2, X, Check, Info } from "lucide-react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { useBranches, type Branch } from "@/pages/branches/index";

const createSchema = z.object({
  name:     z.string().min(2, "Name required"),
  email:    z.string().email("Valid email required"),
  password: z.string().min(8, "At least 8 characters").regex(/[a-z]/, "Include a lowercase letter").regex(/[A-Z]/, "Include an uppercase letter").regex(/\d/, "Include a number"),
  authorityLevel: z.enum(["super_admin", "admin", "branch_admin", "staff"]),
  jobFunction: z.enum(["general_staff", "documentation", "accounts", "operations", "terminal_manager", "delivery", "security"]),
});

const editSchema = z.object({
  name:     z.string().min(2, "Name required"),
  password: z.string().optional().refine((value) => !value || (value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)), "Use 8+ characters with uppercase, lowercase, and number"),
});

type UserRow = {
  id: number; name: string; email: string; role: string;
  roles?: string[];
  sectionPermission?: string | null;
  sectionPermissions?: string | null;
  authorityLevel?: string | null;
  jobFunction?: string | null;
  workspaceAccess?: string | null;
  accessProfileMigratedAt?: string | null;
  accessProfile?: {
    source: "modern" | "invalid";
    authorityLevel: string | null;
    jobFunction: string | null;
    workspaces: string[];
    errors: string[];
  };
  canUpload?: boolean;
  branchId?: number | null;
  isActive: boolean; createdAt: string;
};

const AUTHORITY_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Administrator" },
  { value: "branch_admin", label: "Branch Admin" },
  { value: "staff", label: "Staff" },
] as const;

const ELEVATED_AUTHORITIES = ["super_admin", "admin", "branch_admin"];

const JOB_FUNCTION_OPTIONS = [
  { value: "general_staff", label: "General Staff" },
  { value: "documentation", label: "Documentation" },
  { value: "accounts", label: "Accounts" },
  { value: "operations", label: "Operations" },
  { value: "terminal_manager", label: "Terminal Manager" },
  { value: "delivery", label: "Delivery / Transport" },
  { value: "security", label: "Gate Security" },
] as const;

const WORKSPACE_OPTIONS = [
  { value: "documentation", label: "Documentation" },
  { value: "accounts", label: "Accounts" },
  { value: "transire", label: "Transire" },
  { value: "shipping", label: "Shipping" },
  { value: "terminal", label: "Terminal" },
  { value: "pullout", label: "Pullout" },
  { value: "terminal_manager", label: "Terminal Manager" },
  { value: "delivery", label: "Delivery / Transport" },
  { value: "security", label: "Gate Security" },
] as const;

type JobFunction = (typeof JOB_FUNCTION_OPTIONS)[number]["value"];

const FIXED_WORKSPACES: Record<Exclude<JobFunction, "operations">, string[]> = {
  general_staff: [],
  documentation: ["documentation"],
  accounts: ["accounts"],
  terminal_manager: ["terminal_manager"],
  delivery: ["delivery"],
  security: ["security"],
};

type AccessProfileResponse = {
  user: UserRow;
};

type RbacMigrationAudit = {
  generatedAt: string;
  readOnly: true;
  summary: {
    totalUsers: number;
    activeUsers: number;
    invalidProfiles: number;
    migration: {
      modernProfiles: number;
      legacyProfiles: number;
      invalidProfiles: number;
      activeProfilesMigrated: number;
      activeProfilesPending: number;
      activeProfileMigrationComplete: boolean;
      allProfilesMigrated: boolean;
      legacyRetirementReady: boolean;
      retirementBlockers: string[];
    };
  };
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

function formatPermissionsSummary(user: UserRow): string {
  if (user.accessProfile?.source === "modern") {
    const workspaceNames = user.accessProfile.workspaces
      .map((workspace) => WORKSPACE_OPTIONS.find((option) => option.value === workspace)?.label ?? workspace);
    return `${user.accessProfile.authorityLevel} | ${user.accessProfile.jobFunction}${workspaceNames.length ? ` | ${workspaceNames.join(", ")}` : ""}`;
  }
  return "Access profile needs configuration";
}

function AccessProfileDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<AccessProfileResponse>({
    queryKey: ["/api/users", user.id, "access-profile"],
    queryFn: () => customFetch<AccessProfileResponse>(`/api/users/${user.id}/access-profile`),
  });
  const [authorityLevel, setAuthorityLevel] = useState("staff");
  const [jobFunction, setJobFunction] = useState<JobFunction>("general_staff");
  const [workspaces, setWorkspaces] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    const profile = data.user.accessProfile;
    const nextFunction = profile?.jobFunction;
    const nextAuthority = profile?.authorityLevel;
    const nextWorkspaces = profile?.workspaces;

    if (AUTHORITY_OPTIONS.some((option) => option.value === nextAuthority)) setAuthorityLevel(nextAuthority!);
    if (JOB_FUNCTION_OPTIONS.some((option) => option.value === nextFunction)) {
      setJobFunction(nextFunction as JobFunction);
      setWorkspaces(nextWorkspaces ?? []);
    }
  }, [data]);

  const changeJobFunction = (next: JobFunction) => {
    setJobFunction(next);
    setWorkspaces(next === "operations" ? [] : FIXED_WORKSPACES[next]);
  };

  const toggleWorkspace = (workspace: string) => {
    setWorkspaces((current) => current.includes(workspace)
      ? current.filter((value) => value !== workspace)
      : [...current, workspace]);
  };

  const saveMutation = useMutation({
    mutationFn: () => customFetch<{ user: UserRow; message: string }>(`/api/users/${user.id}/access-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorityLevel, jobFunction, workspaceAccess: workspaces }),
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", user.id, "access-profile"] });
      toast({ title: "Access profile saved", description: result.message });
      onClose();
    },
    onError: (error: Error) => toast({
      variant: "destructive",
      title: "Access profile was not saved",
      description: error.message,
    }),
  });

  const profileState = data?.user.accessProfile?.source ?? "invalid";
  const fixedWorkspaces = jobFunction === "operations" ? null : FIXED_WORKSPACES[jobFunction];

  return (
    <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Configure Access: {user.name}
        </DialogTitle>
      </DialogHeader>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-5 pt-2">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            This profile is the user&apos;s live access control. Authority, job function, and workspace access are managed here.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Authority level</label>
              <Select value={authorityLevel} onValueChange={setAuthorityLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTHORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Administrative level, separate from the person&apos;s work area.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Job function</label>
              <Select value={jobFunction} onValueChange={(value) => changeJobFunction(value as JobFunction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOB_FUNCTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Determines the workspace family this person can receive.</p>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Workspace access</p>
              <p className="text-xs text-muted-foreground">
                {jobFunction === "operations"
                  ? "Choose one or more operational workspaces."
                  : "This job function has a fixed workspace assignment."}
              </p>
            </div>
            {jobFunction === "operations" ? (
              <div className="grid grid-cols-2 gap-2">
                {WORKSPACE_OPTIONS.filter((workspace) => ["transire", "shipping", "terminal", "pullout"].includes(workspace.value)).map((workspace) => (
                  <Button
                    key={workspace.value}
                    type="button"
                    variant={workspaces.includes(workspace.value) ? "default" : "outline"}
                    onClick={() => toggleWorkspace(workspace.value)}
                    className="justify-start"
                  >
                    <Check className={`mr-2 h-4 w-4 ${workspaces.includes(workspace.value) ? "opacity-100" : "opacity-0"}`} />
                    {workspace.label}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-lg border border-border/50 bg-secondary/20 p-3">
                {fixedWorkspaces?.length ? fixedWorkspaces.map((workspace) => (
                  <Badge key={workspace} variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                    {WORKSPACE_OPTIONS.find((option) => option.value === workspace)?.label ?? workspace}
                  </Badge>
                )) : <span className="text-sm text-muted-foreground">No specialist workspace is assigned.</span>}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/50 bg-secondary/15 px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p><span className="font-medium text-foreground">Current profile state:</span> {profileState === "modern" ? "Access profile active" : "Incomplete profile - access is blocked until corrected"}</p>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Access Profile
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  );
}

function RetiredLegacyCreateUserDialog() {
  /* Retained only in source history during the role cutover. It is not rendered.
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
  const isNonElevated = !ELEVATED_ROLES.includes(watchedRole);
  const { isBranchAdmin } = useAuth();

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
              <FormItem><FormLabel>Password</FormLabel><FormControl><PasswordInput placeholder="8+ characters with upper, lower, and number" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Role</FormLabel>
                <Select onValueChange={(v) => { field.onChange(v); setWorkspaceRoles([]); }} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {!isBranchAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                    {!isBranchAdmin && <SelectItem value="admin">Administrator</SelectItem>}
                    {!isBranchAdmin && <SelectItem value="branch_admin">Branch Admin</SelectItem>}
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
            {!isBranchAdmin && (
              <BranchSelectField branches={branches} value={branchId} onChange={setBranchId} />
            )}
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
  */
  return null;
}

function RetiredLegacyEditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  /* Retained only in source history during the role cutover. It is not rendered.
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
  const isNonElevated = !ELEVATED_ROLES.includes(watchedRole);
  const { isBranchAdmin, user: currentUser } = useAuth();
  const isSelf = currentUser?.id === user.id;
  const targetIsElevated = ELEVATED_ROLES.includes(user.role);

  const onSubmit = (data: any) => {
    const allRoles = [...new Set([data.role, ...workspaceRoles])];
    const payload: any = { name: data.name, role: data.role, roles: allRoles };
    if (branchId != null && branchId !== user.branchId) payload.branchId = branchId;
    if (isSelf) {
      delete payload.role;
      delete payload.roles;
      delete payload.branchId;
    }
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
              <Select onValueChange={(v) => { field.onChange(v); setWorkspaceRoles([]); }} defaultValue={field.value} disabled={isSelf || (isBranchAdmin && targetIsElevated)}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {!isBranchAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  {!isBranchAdmin && <SelectItem value="admin">Administrator</SelectItem>}
                  {!isBranchAdmin && <SelectItem value="branch_admin">Branch Admin</SelectItem>}
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
          {!isBranchAdmin && (
            <BranchSelectField branches={branches} value={branchId} onChange={setBranchId} disabled={isSelf} />
          )}
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
              <FormControl><PasswordInput placeholder="8+ characters with upper, lower, and number" autoComplete="new-password" {...field} /></FormControl>
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
  */
  return null;
}

function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const { user: currentUser, isBranchAdmin } = useAuth();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number | null>(currentUser?.branchId ?? null);
  const createMutation = useCreateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const form = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", email: "", password: "", authorityLevel: "staff" as const, jobFunction: "general_staff" as JobFunction },
  });
  const jobFunction = form.watch("jobFunction") as JobFunction;

  const setJobFunction = (value: JobFunction) => {
    form.setValue("jobFunction", value);
    setWorkspaces(value === "operations" ? [] : FIXED_WORKSPACES[value]);
  };
  const toggleWorkspace = (workspace: string) => setWorkspaces((current) => current.includes(workspace)
    ? current.filter((value) => value !== workspace)
    : [...current, workspace]);
  const onSubmit = (data: z.infer<typeof createSchema>) => {
    createMutation.mutate({ data: {
      ...data,
      workspaceAccess: data.jobFunction === "operations" ? workspaces : FIXED_WORKSPACES[data.jobFunction],
      canUpload,
      ...(branchId != null ? { branchId } : {}),
    } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        toast({ title: "User created successfully." });
        setOpen(false);
        form.reset();
        setCanUpload(false);
        setWorkspaces([]);
      },
      onError: (error: Error) => toast({ variant: "destructive", title: "User was not created", description: error.message }),
    });
  };

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button className="hover-elevate active:scale-95 shadow-md shadow-primary/20"><Plus className="mr-2 h-4 w-4" />Add User</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border/50 bg-card/95 backdrop-blur">
      <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
      <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>Password</FormLabel><FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>} />
        <FormField control={form.control} name="authorityLevel" render={({ field }) => <FormItem><FormLabel>Authority Level</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>
          {!isBranchAdmin && AUTHORITY_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          {isBranchAdmin && <SelectItem value="staff">Staff</SelectItem>}
        </SelectContent></Select><FormMessage /></FormItem>} />
        <FormField control={form.control} name="jobFunction" render={({ field }) => <FormItem><FormLabel>Job Function</FormLabel><Select value={field.value} onValueChange={(value) => setJobFunction(value as JobFunction)}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{JOB_FUNCTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
        {!isBranchAdmin && <BranchSelectField branches={branches} value={branchId} onChange={setBranchId} />}
        <div className="space-y-2"><FormLabel>Workspace Access</FormLabel>
          {jobFunction === "operations" ? <div className="grid grid-cols-2 gap-2">{WORKSPACE_OPTIONS.filter((option) => ["transire", "shipping", "terminal", "pullout"].includes(option.value)).map((option) => <Button key={option.value} type="button" variant={workspaces.includes(option.value) ? "default" : "outline"} onClick={() => toggleWorkspace(option.value)} className="justify-start"><Check className={`mr-2 h-4 w-4 ${workspaces.includes(option.value) ? "opacity-100" : "opacity-0"}`} />{option.label}</Button>)}</div>
          : <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-sm text-muted-foreground">{FIXED_WORKSPACES[jobFunction].length ? FIXED_WORKSPACES[jobFunction].map((workspace) => WORKSPACE_OPTIONS.find((option) => option.value === workspace)?.label).join(", ") : "No specialist workspace"}</p>}
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-3"><div><p className="text-sm font-medium">Upload Access</p><p className="text-xs text-muted-foreground">Allow bulk container-data upload.</p></div><Switch checked={canUpload} onCheckedChange={setCanUpload} /></div>
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create User</Button></div>
      </form></Form>
    </DialogContent>
  </Dialog>;
}

function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const updateMutation = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: branches } = useBranches();
  const { isBranchAdmin, user: currentUser } = useAuth();
  const [branchId, setBranchId] = useState<number | null>(user.branchId ?? null);
  const [canUpload, setCanUpload] = useState(user.canUpload ?? false);
  const form = useForm({ resolver: zodResolver(editSchema), defaultValues: { name: user.name, password: "" } });
  const isSelf = currentUser?.id === user.id;
  const onSubmit = (data: z.infer<typeof editSchema>) => updateMutation.mutate({ id: user.id, data: {
    name: data.name,
    canUpload,
    ...(data.password ? { password: data.password } : {}),
    ...(!isSelf && branchId != null && branchId !== user.branchId ? { branchId } : {}),
  } }, {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/users"] }); toast({ title: "User details updated." }); onClose(); },
    onError: (error: Error) => toast({ variant: "destructive", title: "User was not updated", description: error.message }),
  });
  return <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border/50 bg-card/95 backdrop-blur">
    <DialogHeader><DialogTitle>Edit User - {user.name}</DialogTitle></DialogHeader>
    <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
      <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
      <div className="rounded-lg bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">Email: <span className="font-mono text-foreground">{user.email}</span></div>
      <div className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-sm text-muted-foreground">Access Profile: <span className="font-medium text-foreground">{user.accessProfile?.authorityLevel ?? "Not configured"} / {user.accessProfile?.jobFunction ?? "Not configured"}</span></div>
      {!isBranchAdmin && <BranchSelectField branches={branches} value={branchId} onChange={setBranchId} disabled={isSelf} />}
      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-3"><div><p className="text-sm font-medium">Upload Access</p><p className="text-xs text-muted-foreground">Allow bulk container-data upload.</p></div><Switch checked={canUpload} onCheckedChange={setCanUpload} /></div>
      <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>New Password <span className="font-normal text-muted-foreground">(leave blank to keep current)</span></FormLabel><FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>} />
      <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button></div>
    </form></Form>
  </DialogContent>;
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
  const { isAdmin, isSuperAdmin, isAdminOrAbove, isBranchAdmin, user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const { data: users, isLoading } = useListUsers();
  const { data: branches } = useBranches({ enabled: isSuperAdmin });
  const branchNameById = new Map((branches ?? []).map(b => [b.id, b.name]));
  const updateMutation = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [assigningUser, setAssigningUser] = useState<UserRow | null>(null);
  const [configuringAccessUser, setConfiguringAccessUser] = useState<UserRow | null>(null);
  const { data: migrationAudit } = useQuery<RbacMigrationAudit>({
    queryKey: ["/api/users/rbac-migration-audit"],
    queryFn: () => customFetch<RbacMigrationAudit>("/api/users/rbac-migration-audit"),
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });

  if (!isAdminOrAbove) { setLocation("/"); return null; }

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
          <p className="text-muted-foreground text-sm mt-1">Manage access profiles, workspaces, and branch membership.</p>
        </div>
        {isAdminOrAbove && <CreateUserDialog />}
      </div>

      {isSuperAdmin && migrationAudit && (
        <Card className="border-primary/20 bg-primary/[0.03] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> Access control status
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Access profiles are now the only source of permission checks. Historical role fields are retained only as recovery data and cannot grant access.
              </p>
            </div>
            <Badge variant="outline" className={migrationAudit.summary.migration.activeProfileMigrationComplete
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"}>
              {migrationAudit.summary.migration.activeProfilesMigrated}/{migrationAudit.summary.activeUsers} active profiles migrated
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/50 bg-card/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Modern profiles</p>
              <p className="mt-1 text-lg font-semibold">{migrationAudit.summary.migration.modernProfiles}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Legacy access paths</p>
              <p className="mt-1 text-lg font-semibold">{migrationAudit.summary.migration.legacyProfiles}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-card/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Profiles needing correction</p>
              <p className="mt-1 text-lg font-semibold">{migrationAudit.summary.migration.invalidProfiles}</p>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{migrationAudit.summary.migration.retirementBlockers[0] ?? "All accounts have valid modern access profiles."}</span>
          </div>
        </Card>
      )}

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-secondary/30 uppercase font-mono tracking-wider border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Authority</th>
                {isSuperAdmin && <th className="px-6 py-4 font-medium">Branch</th>}
                <th className="px-6 py-4 font-medium">Access Profile</th>
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
                        {[(u as UserRow).accessProfile?.authorityLevel].filter((value): value is string => Boolean(value)).map(r => {
                          return (
                            <Badge key={r} variant="outline" className={
                              r === "super_admin"
                                ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                                : r === "admin"
                                ? "border-primary text-primary bg-primary/10"
                                : r === "branch_admin"
                                ? "border-orange-500 text-orange-400 bg-orange-500/10"
                                : "border-border text-muted-foreground"
                            }>
                              {ELEVATED_AUTHORITIES.includes(r) ? <Shield className="w-3 h-3 mr-1" /> : <UserIcon className="w-3 h-3 mr-1" />}
                              {AUTHORITY_OPTIONS.find((option) => option.value === r)?.label ?? r}
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
                          <Dialog open={configuringAccessUser?.id === u.id} onOpenChange={(open) => { if (!open) setConfiguringAccessUser(null); }}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => setConfiguringAccessUser(u as UserRow)}
                                className="h-8 px-3 text-xs hover:bg-primary/10 hover:text-primary">
                                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Access
                              </Button>
                            </DialogTrigger>
                            {configuringAccessUser?.id === u.id && (
                              <AccessProfileDialog user={configuringAccessUser} onClose={() => setConfiguringAccessUser(null)} />
                            )}
                          </Dialog>
                        )}
                        {(isSuperAdmin || (isAdminOrAbove && !(isBranchAdmin && (u as UserRow).accessProfile?.authorityLevel !== "staff"))) && (
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
                        {(u as UserRow).accessProfile?.authorityLevel !== "super_admin" && (
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
                        {(isSuperAdmin || (isAdminOrAbove && !(isBranchAdmin && ELEVATED_AUTHORITIES.includes((u as UserRow).accessProfile?.authorityLevel ?? "staff")))) && (
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
