import { useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetSettings, useUpdateSettings, customFetch, useListUsers } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Clock, AlertTriangle, ShieldAlert, Mail, Send, CalendarClock, CheckCircle2, KeyRound, ShieldCheck, Anchor, X, Users } from "lucide-react";

const DEFAULTS = {
  agingInactivityDays: "7",
  agingDays1: "30",
  agingDays2: "60",
  agingDays3: "90",
  notifyBeforeDueDays: "7",
  agingEmailEnabled: "false",
  agingEmailTo: "",
  digestFrequency: "none",
  digestTime: "08:00",
};

type EmailAlertCategoryId = "terminal_jobs" | "overdue_containers" | "berthing_watch" | "clearing_delays" | "inactive_jobs" | "documentation_delays" | "transire_delay" | "shipping_delay" | "terminal_delay" | "pullout_delay" | "exam_release_delay" | "financial_exceptions";
type EmailAlertPreference = { enabled: boolean; recipients: string; frequency: "none" | "daily" | "weekly"; lastSentAt?: string };
type EmailAlertPreferences = Record<EmailAlertCategoryId, EmailAlertPreference>;

const EMAIL_ALERT_CATEGORIES: Array<{ id: EmailAlertCategoryId; title: string; helper: string }> = [
  { id: "terminal_jobs", title: "Terminal Jobs Summary", helper: "Open jobs in Terminal and downstream terminal release stages." },
  { id: "overdue_containers", title: "Overdue Containers", helper: "Overdue next actions, stage stalls, and empty-return delays." },
  { id: "berthing_watch", title: "Berthing Watch", helper: "Vessels not berthed with ETA in the next seven days." },
  { id: "clearing_delays", title: "Clearing Delays", helper: "Jobs above your clearing-age warning thresholds." },
  { id: "inactive_jobs", title: "Inactive Jobs", helper: "Jobs with no recorded activity for too long." },
  { id: "documentation_delays", title: "PAAR / Documentation Delays", helper: "Documentation records with a PAAR ETA that has passed." },
  { id: "transire_delay", title: "Transire Delay", helper: "Transire release actions that are due soon or overdue." },
  { id: "shipping_delay", title: "Shipping / DO Delay", helper: "Delivery Order releases that are due soon or overdue." },
  { id: "terminal_delay", title: "Terminal / TDO Delay", helper: "Terminal Delivery Order releases that are due soon or overdue." },
  { id: "pullout_delay", title: "Pullout Delay", helper: "Pullout actions that are due soon or overdue." },
  { id: "exam_release_delay", title: "Exam / Release Delay", helper: "Examination and final-release actions that are due soon or overdue." },
  { id: "financial_exceptions", title: "Financial Exceptions", helper: "Unpaid duty, negative profit, low margin, and unusual costs." },
];

function parseEmailAlertPreferences(value: string | undefined, legacyRecipients: string, legacyFrequency: "none" | "daily" | "weekly", enabled: boolean): EmailAlertPreferences {
  const preferences = Object.fromEntries(EMAIL_ALERT_CATEGORIES.map(({ id }) => [id, {
    enabled: enabled && ["clearing_delays", "inactive_jobs", "financial_exceptions"].includes(id),
    recipients: legacyRecipients,
    frequency: legacyFrequency,
  }])) as EmailAlertPreferences;
  try {
    const parsed = JSON.parse(value ?? "{}");
    if (!parsed || typeof parsed !== "object") return preferences;
    for (const { id } of EMAIL_ALERT_CATEGORIES) {
      const current = parsed[id];
      if (!current || typeof current !== "object") continue;
      preferences[id] = {
        enabled: current.enabled === true,
        recipients: typeof current.recipients === "string" ? current.recipients : legacyRecipients,
        frequency: current.frequency === "daily" || current.frequency === "weekly" ? current.frequency : "none",
        ...(typeof current.lastSentAt === "string" ? { lastSentAt: current.lastSentAt } : {}),
      };
    }
  } catch {}
  return preferences;
}

function parseOfficerIds(value?: string, legacyValue?: string) {
  const parse = (raw?: string) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id)).filter(Boolean);
      }
    } catch {}
    return raw && raw !== "none" ? [raw] : [];
  };
  const ids = parse(value);
  return ids.length > 0 ? [...new Set(ids)] : [...new Set(parse(legacyValue))];
}

function OfficerMultiSelect({
  title,
  description,
  icon,
  selectedIds,
  users,
  onChange,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  selectedIds: string[];
  users: any[];
  onChange: (ids: string[]) => void;
}) {
  const selectedUsers = users.filter((u: any) => selectedIds.includes(String(u.id)));
  const availableUsers = users.filter((u: any) => !selectedIds.includes(String(u.id)));

  const removeUser = (id: string) => onChange(selectedIds.filter((selectedId) => selectedId !== id));

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Assigned users</Label>
        <div className="min-h-[44px] rounded-lg border border-border/60 bg-card/40 p-2 flex flex-wrap gap-2">
          {selectedUsers.length > 0 ? selectedUsers.map((u: any) => (
            <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-foreground">
              {u.name} <span className="text-muted-foreground">({u.role})</span>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => removeUser(String(u.id))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )) : (
            <span className="text-xs text-muted-foreground px-1 py-1.5">No officers selected</span>
          )}
        </div>
      </div>

      <Select value="__placeholder__" onValueChange={(value) => value !== "__placeholder__" && onChange([...selectedIds, value])}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Add officer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__placeholder__" disabled>Add officer</SelectItem>
          {availableUsers.map((u: any) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name} ({u.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function SettingsPage() {
  const { data: settings = {}, isLoading } = useGetSettings();
  const { data: users = [] } = useListUsers();
  const updateMutation = useUpdateSettings();
  const { toast } = useToast();

  const { data: emailStatus } = useQuery<{
    configured: boolean;
    fromAddress?: string;
    productionReady?: boolean;
    source?: "branch" | "system" | "resend_test";
  }>({
    queryKey: ["/api/notifications/email-status"],
    queryFn: () => customFetch("/api/notifications/email-status"),
    staleTime: 60_000,
  });
  const emailServiceConfigured = emailStatus?.configured ?? true;
  const emailProductionReady = emailStatus?.productionReady ?? false;

  const s = settings as Record<string, string>;

  const [inactivityDays, setInactivityDays] = useState(DEFAULTS.agingInactivityDays);
  const [days1, setDays1] = useState(DEFAULTS.agingDays1);
  const [days2, setDays2] = useState(DEFAULTS.agingDays2);
  const [days3, setDays3] = useState(DEFAULTS.agingDays3);
  const [notifyBeforeDueDays, setNotifyBeforeDueDays] = useState(DEFAULTS.notifyBeforeDueDays);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [digestFrequency, setDigestFrequency] = useState<"none" | "daily" | "weekly">("none");
  const [digestTime, setDigestTime] = useState("08:00");
  const [digestLastSentAt, setDigestLastSentAt] = useState<string | null>(null);
  const [emailPreferences, setEmailPreferences] = useState<EmailAlertPreferences>(() => parseEmailAlertPreferences(undefined, "", "none", false));
  const [verificationOfficerUserIds, setVerificationOfficerUserIds] = useState<string[]>([]);
  const [berthingOfficerUserIds, setBerthingOfficerUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setInactivityDays(s["agingInactivityDays"] ?? DEFAULTS.agingInactivityDays);
      setDays1(s["agingDays1"] ?? DEFAULTS.agingDays1);
      setDays2(s["agingDays2"] ?? DEFAULTS.agingDays2);
      setDays3(s["agingDays3"] ?? DEFAULTS.agingDays3);
      setNotifyBeforeDueDays(s["notifyBeforeDueDays"] ?? DEFAULTS.notifyBeforeDueDays);
      setEmailEnabled(s["agingEmailEnabled"] === "true");
      setEmailTo(s["agingEmailTo"] ?? "");
      const legacyFrequency = s["digestFrequency"] === "daily" || s["digestFrequency"] === "weekly"
        ? s["digestFrequency"] as "daily" | "weekly"
        : "none";
      setDigestFrequency(legacyFrequency);
      setDigestTime(s["digestTime"] ?? "08:00");
      setDigestLastSentAt(s["digestLastSentAt"] ?? null);
      setEmailPreferences(parseEmailAlertPreferences(s["emailAlertPreferences"], s["agingEmailTo"] ?? "", legacyFrequency, s["agingEmailEnabled"] === "true"));
      setVerificationOfficerUserIds(parseOfficerIds(s["verificationOfficerUserIds"], s["verificationOfficerUserId"]));
      setBerthingOfficerUserIds(parseOfficerIds(s["berthingOfficerUserIds"], s["berthingOfficerUserId"]));
    }
  }, [isLoading]);

  const mark = () => setDirty(true);

  const validateNum = (v: string, min = 1) => {
    const n = parseInt(v);
    return !isNaN(n) && n >= min;
  };

  const isValid =
    validateNum(inactivityDays) &&
    validateNum(days1) &&
    validateNum(days2) &&
    validateNum(days3) &&
    validateNum(notifyBeforeDueDays, 0) &&
    parseInt(days1) < parseInt(days2) &&
    parseInt(days2) < parseInt(days3);

  const settingsPayload = () => ({
    agingInactivityDays: inactivityDays,
    agingDays1: days1,
    agingDays2: days2,
    agingDays3: days3,
    notifyBeforeDueDays,
    agingEmailEnabled: emailEnabled ? "true" : "false",
    // Keep these values for installations that used the old single digest configuration.
    agingEmailTo: emailTo.trim(),
    digestFrequency,
    digestTime,
    emailAlertPreferences: JSON.stringify(emailPreferences),
    verificationOfficerUserIds: JSON.stringify(verificationOfficerUserIds),
    verificationOfficerUserId: verificationOfficerUserIds[0] ?? "",
    berthingOfficerUserIds: JSON.stringify(berthingOfficerUserIds),
    berthingOfficerUserId: berthingOfficerUserIds[0] ?? "",
  });

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await updateMutation.mutateAsync(settingsPayload());
      toast({ title: "Settings saved" });
      setDirty(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  const handleSendDigest = async () => {
    const configuredRecipients = EMAIL_ALERT_CATEGORIES.some(({ id }) => emailPreferences[id].enabled && emailPreferences[id].recipients.trim());
    if (!configuredRecipients) {
      toast({ variant: "destructive", title: "Enable an alert category and enter its recipient email address first" });
      return;
    }
    setSendingEmail(true);
    try {
      await updateMutation.mutateAsync(settingsPayload());
      const result = await customFetch<{
        sent: number;
        categoriesSent?: number;
        fromAddress?: string;
        productionReady?: boolean;
      }>("/api/notifications/send-email-digest", { method: "POST" });
      const now = new Date().toISOString();
      setDigestLastSentAt(now);
      setDirty(false);
      toast({
        title: "Email digest sent",
        description: `Sent ${result.categoriesSent ?? 0} alert report(s) to ${result.sent ?? 0} recipient(s) from ${result.fromAddress ?? "configured sender"}`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to send email", description: err?.message ?? "Check that email settings are configured correctly" });
    } finally {
      setSendingEmail(false);
    }
  };

  const formatLastSent = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  const activeUsers = (users ?? []).filter((u: any) => u.isActive !== false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto w-full max-w-[1400px] space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">System Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure workflow assignments, container aging rules, notifications and email alerts.</p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || !isValid || saving} className="h-10 gap-2 px-5 sm:w-auto w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <Card className="rounded-xl border-border/60 bg-card shadow-sm">
        <CardHeader className="p-6 pb-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-4 h-4 text-primary" />
            Workflow & Assignments
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Assign the users who can perform sensitive verification and berthing workflow actions.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <OfficerMultiSelect
              title="Verification Officers"
              description="Any selected user can verify new containers before they enter the operational pipeline."
              icon={<ShieldCheck className="w-4 h-4" />}
              selectedIds={verificationOfficerUserIds}
              users={activeUsers}
              onChange={(ids) => { setVerificationOfficerUserIds(ids); mark(); }}
            />
            <OfficerMultiSelect
              title="Berthing Officers"
              description="Any selected user can confirm vessel berthing or save a revised ETA."
              icon={<Anchor className="w-4 h-4" />}
              selectedIds={berthingOfficerUserIds}
              users={activeUsers}
              onChange={(ids) => { setBerthingOfficerUserIds(ids); mark(); }}
            />
          </div>

          {(verificationOfficerUserIds.length === 0 || berthingOfficerUserIds.length === 0) && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-amber-500">Workflow officers incomplete</p>
                <p className="text-xs text-muted-foreground">
                  Empty officer lists will block their related actions until at least one user is assigned.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/60 bg-card shadow-sm">
        <CardHeader className="p-6 pb-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-4 h-4 text-primary" />
            Container Aging
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Set the lead time for due-date reminders and the thresholds used for clearing and inactivity alerts.
          </p>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
              <Label className="text-sm font-medium">Notify Before Due Date</Label>
              <p className="text-xs text-muted-foreground">Send stage reminders this many days before the expected date.</p>
              <div className="flex max-w-xs items-center gap-2"><Input type="number" min={0} value={notifyBeforeDueDays} onChange={(e) => { setNotifyBeforeDueDays(e.target.value); mark(); }} className="h-10" /><span className="text-sm text-muted-foreground">days</span></div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
              <Label className="text-sm font-medium">Inactive Job Alert</Label>
              <p className="text-xs text-muted-foreground">Flag a job when it has not received an update within this period.</p>
              <div className="flex max-w-xs items-center gap-2"><Input type="number" min={1} value={inactivityDays} onChange={(e) => { setInactivityDays(e.target.value); mark(); }} className="h-10" /><span className="text-sm text-muted-foreground">days</span></div>
            </div>
          </div>
          <div className="space-y-3">
            <div><p className="text-sm font-semibold">Aging Thresholds</p><p className="mt-1 text-xs text-muted-foreground">Jobs are flagged after these days in clearing. Values must be in ascending order.</p></div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["Warning", days1, setDays1, "bg-amber-400"],
                ["High Warning", days2, setDays2, "bg-orange-500"],
                ["Critical", days3, setDays3, "bg-red-500"],
              ].map(([label, value, setter, color]) => <div key={String(label)} className="rounded-lg border border-border/60 p-4 space-y-2"><Label className="flex items-center gap-2 text-sm font-medium"><span className={`h-2 w-2 rounded-full ${color}`} />{String(label)}</Label><div className="flex items-center gap-2"><Input type="number" min={1} value={String(value)} onChange={(e) => { (setter as (next: string) => void)(e.target.value); mark(); }} className="h-10" /><span className="text-sm text-muted-foreground">Days</span></div></div>)}
            </div>
            {!isValid && dirty && <p className="text-xs text-destructive">Thresholds must be valid numbers in ascending order (Warning &lt; High Warning &lt; Critical).</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/60 bg-card shadow-sm">
        <CardHeader className="p-6 pb-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="w-4 h-4 text-primary" />
            Email Alerts
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose which operational events and job conditions should be automatically emailed to selected recipients.
          </p>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          {!emailServiceConfigured && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
              <KeyRound className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-amber-500">Email service not configured</p>
                <p className="text-xs text-muted-foreground">
                  A <code className="font-mono bg-muted px-1 rounded">RESEND_API_KEY</code> secret is required to send emails.
                  Add it to the Railway service variables, then restart the app service.
                </p>
              </div>
            </div>
          )}

          {emailServiceConfigured && !emailProductionReady && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-amber-500">Production sender not verified yet</p>
                <p className="text-xs text-muted-foreground">
                  Current sender: <code className="font-mono bg-muted px-1 rounded">{emailStatus?.fromAddress ?? "Resend test sender"}</code>.
                  For production, verify a domain in Resend and set <code className="font-mono bg-muted px-1 rounded">RESEND_DEFAULT_FROM</code>
                  or configure a branch sender using that verified domain.
                </p>
              </div>
            </div>
          )}

          {emailServiceConfigured && emailProductionReady && emailStatus?.fromAddress && (
            <div className="flex items-start gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-emerald-500">Production sender configured</p>
                <p className="text-xs text-muted-foreground">
                  Emails will send from <code className="font-mono bg-muted px-1 rounded">{emailStatus.fromAddress}</code>.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-background/50">
            <div>
              <p className="text-sm font-medium">Enable email alerts</p>
              <p className="text-xs text-muted-foreground mt-0.5">Turn on the selected operational alert reports below.</p>
            </div>
            <Switch checked={emailEnabled} onCheckedChange={(v) => { setEmailEnabled(v); mark(); }} />
          </div>

          <div className="hidden">
            <Label className="text-xs font-medium">Alert email recipients</Label>
            <Input
              type="text"
              value={emailTo}
              onChange={(e) => { setEmailTo(e.target.value); mark(); }}
              placeholder="e.g. ijehifeany@gmail.com, manager@company.com"
              className="text-sm"
              disabled={!emailEnabled}
            />
            <p className="text-[11px] text-muted-foreground">Separate multiple addresses with commas</p>
          </div>

          <div className="hidden">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock className="w-4 h-4 text-primary" />
              Automatic Schedule
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              The server will automatically send the digest on the configured schedule. Runs every 60 seconds on the server clock.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Frequency</Label>
                <Select
                  value={digestFrequency}
                  onValueChange={(v) => { setDigestFrequency(v as "none" | "daily" | "weekly"); mark(); }}
                  disabled={!emailEnabled}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Off — manual only</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly (Mondays)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Send at (server time)</Label>
                <Input
                  type="time"
                  value={digestTime}
                  onChange={(e) => { setDigestTime(e.target.value); mark(); }}
                  className="h-9 text-sm"
                  disabled={!emailEnabled || digestFrequency === "none"}
                />
              </div>
            </div>

            {digestLastSentAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                Last sent: {formatLastSent(digestLastSentAt)}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold">Alert Categories</p>
              <p className="mt-1 text-xs text-muted-foreground">Choose recipients and delivery frequency for each report. Separate email addresses with commas.</p>
            </div>
            <div className="max-w-sm space-y-1.5">
              <Label className="text-sm font-medium">Daily / weekly send time</Label>
              <Input type="time" value={digestTime} onChange={(event) => { setDigestTime(event.target.value); mark(); }} className="h-10 text-sm" disabled={!emailEnabled} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {EMAIL_ALERT_CATEGORIES.map((category) => {
                const preference = emailPreferences[category.id];
                return (
                  <div key={category.id} className={`rounded-xl border p-4 space-y-4 transition-colors ${emailEnabled && preference.enabled ? "border-border/60 bg-background" : "border-border/40 bg-muted/30 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{category.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{category.helper}</p>
                      </div>
                      <Switch checked={preference.enabled} disabled={!emailEnabled} onCheckedChange={(enabled) => { setEmailPreferences((current) => ({ ...current, [category.id]: { ...current[category.id], enabled } })); mark(); }} />
                    </div>
                    <div className="space-y-1.5"><Label className="text-xs font-medium">Recipients</Label><Input value={preference.recipients} placeholder="recipient@example.com" disabled={!emailEnabled || !preference.enabled} onChange={(event) => { const recipients = event.target.value; setEmailPreferences((current) => ({ ...current, [category.id]: { ...current[category.id], recipients } })); mark(); }} className="h-10 text-sm" /></div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Frequency</Label>
                      <Select value={preference.frequency} disabled={!emailEnabled || !preference.enabled} onValueChange={(frequency) => { setEmailPreferences((current) => ({ ...current, [category.id]: { ...current[category.id], frequency: frequency as EmailAlertPreference["frequency"] } })); mark(); }}>
                        <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Manual only</SelectItem><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly (Mondays)</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {digestLastSentAt && <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Last test email: {formatLastSent(digestLastSentAt)}</div>}
          <div className="flex items-center justify-start border-t border-border/50 pt-5">
            <Button
              variant="default"
              onClick={handleSendDigest}
              disabled={sendingEmail || !emailServiceConfigured || !emailEnabled || !EMAIL_ALERT_CATEGORIES.some(({ id }) => emailPreferences[id].enabled && emailPreferences[id].recipients.trim())}
              className="gap-2"
            >
              {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Test Alerts Now
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
