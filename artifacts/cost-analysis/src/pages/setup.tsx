import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Box, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const setupSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your password"),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SetupForm = z.infer<typeof setupSchema>;

export default function Setup() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const setupMutation = useMutation({
    mutationFn: async (data: SetupForm) => {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: data.name, email: data.email, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Setup failed");
      return json;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data.user);
      toast({ title: "Account created", description: `Welcome, ${data.user.name}!` });
      setLocation("/");
    },
    onError: (err: Error) => {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    },
  });

  const onSubmit = (values: SetupForm) => setupMutation.mutate(values);

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden"
      style={{ backgroundImage: "url('/images/auth-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Box className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground">First-Time Setup</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create your administrator account to get started.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
            <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              This screen only appears once. After your admin account is created, new users must be added by an administrator.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-widest text-muted-foreground">Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your full name" autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-widest text-muted-foreground">Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@company.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-widest text-muted-foreground">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Min. 8 characters" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-widest text-muted-foreground">Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repeat your password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full mt-2" disabled={setupMutation.isPending}>
                {setupMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</>
                ) : (
                  "Create Admin Account"
                )}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          © {new Date().getFullYear()} Cost Analysis Per Container. All rights reserved.
        </p>
      </motion.div>
    </div>
  );
}
