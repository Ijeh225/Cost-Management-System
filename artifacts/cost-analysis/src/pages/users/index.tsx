import { useState } from "react";
import { useListUsers, useCreateUser, useUpdateUser } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Shield, User as UserIcon, Pencil, PowerOff, Power } from "lucide-react";
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
import { SECTION_LABELS } from "@/lib/format";

const SECTION_OPTIONS = [
  { value: "_none", label: "All Sections (Admin)" },
  ...Object.entries(SECTION_LABELS).map(([value, label]) => ({ value, label })),
];

const createSchema = z.object({
  name:              z.string().min(2, "Name required"),
  email:             z.string().email("Valid email required"),
  password:          z.string().min(6, "Min 6 characters"),
  role:              z.enum(["admin", "staff"]),
  sectionPermission: z.string().optional(),
});

const editSchema = z.object({
  name:              z.string().min(2, "Name required"),
  role:              z.enum(["admin", "staff"]),
  password:          z.string().optional(),
  sectionPermission: z.string().optional(),
});

type UserRow = {
  id: number; name: string; email: string; role: string;
  sectionPermission?: string | null; isActive: boolean; createdAt: string;
};

function SectionPermissionField({ control, name, role }: { control: any; name: string; role: string }) {
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>Section Permission <span className="text-muted-foreground font-normal">(staff only)</span></FormLabel>
        <Select
          onValueChange={field.onChange}
          value={field.value || "_none"}
          disabled={role === "admin"}
        >
          <FormControl>
            <SelectTrigger>
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {SECTION_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    )} />
  );
}

function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const createMutation = useCreateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", email: "", password: "", role: "staff" as const, sectionPermission: "_none" },
  });

  const watchedRole = form.watch("role");

  const onSubmit = (data: any) => {
    const payload: any = { name: data.name, email: data.email, password: data.password, role: data.role };
    if (data.role === "staff" && data.sectionPermission && data.sectionPermission !== "_none") {
      payload.sectionPermission = data.sectionPermission;
    } else {
      payload.sectionPermission = null;
    }
    createMutation.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        toast({ title: "User created successfully." });
        setOpen(false);
        form.reset();
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
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur">
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
                <FormLabel>Role</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <SectionPermissionField control={form.control} name="sectionPermission" role={watchedRole} />
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

  const form = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: user.name,
      role: user.role as "admin" | "staff",
      password: "",
      sectionPermission: user.sectionPermission || "_none",
    },
  });

  const watchedRole = form.watch("role");

  const onSubmit = (data: any) => {
    const payload: any = { name: data.name, role: data.role };
    if (data.password) payload.password = data.password;
    if (data.role === "staff" && data.sectionPermission && data.sectionPermission !== "_none") {
      payload.sectionPermission = data.sectionPermission;
    } else {
      payload.sectionPermission = null;
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
    <DialogContent className="border-border/50 bg-card/95 backdrop-blur">
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
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <SectionPermissionField control={form.control} name="sectionPermission" role={watchedRole} />
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

export default function Users() {
  const { isAdmin, user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const { data: users, isLoading } = useListUsers();
  const updateMutation = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

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
        <CreateUserDialog />
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-secondary/30 uppercase font-mono tracking-wider border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Section</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Created</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : users?.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">No users found.</td></tr>
              ) : (
                users?.map((u) => (
                  <tr key={u.id} className={`transition-colors ${u.isActive ? "hover:bg-accent/50" : "opacity-60 hover:bg-accent/30"}`}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{u.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={u.role === "admin"
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border text-muted-foreground"}>
                        {u.role === "admin" ? <Shield className="w-3 h-3 mr-1" /> : <UserIcon className="w-3 h-3 mr-1" />}
                        {u.role === "admin" ? "Administrator" : "Staff"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {(u as UserRow).sectionPermission ? (
                        <span className="capitalize text-xs font-medium text-foreground/80">
                          {SECTION_LABELS[(u as UserRow).sectionPermission!] ?? (u as UserRow).sectionPermission}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">All sections</span>
                      )}
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
                        <Button variant="ghost" size="sm" onClick={() => handleToggleActive(u as UserRow)}
                          disabled={updateMutation.isPending || u.id === currentUser?.id}
                          className={`h-8 px-3 text-xs ${u.isActive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-emerald-500/10 hover:text-emerald-500"}`}>
                          {u.isActive ? <><PowerOff className="w-3.5 h-3.5 mr-1" /> Disable</> : <><Power className="w-3.5 h-3.5 mr-1" /> Enable</>}
                        </Button>
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
