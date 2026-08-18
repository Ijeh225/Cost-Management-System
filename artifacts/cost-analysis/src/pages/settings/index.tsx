import { useState, useEffect, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useGetSettings, useUpdateSettings, customFetch, useListUsers } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Clock, AlertTriangle, ShieldAlert, Mail, Send, CalendarClock, CheckCircle2, KeyRound, ShieldCheck, Anchor, X, Users, FolderOpen, Plus, Trash2, Bot, LockKeyhole, WalletCards, DatabaseZap } from "lucide-react";

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

type DocumentSection = { id: string; label: string };
type SettingsTab = "general" | "aging" | "documentation" | "email" | "notifications" | "workflow" | "ai_governance" | "other";

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "aging", label: "Container Aging" },
  { id: "documentation", label: "Documentation" },
  { id: "email", label: "Email Alerts" },
  { id: "notifications", label: "Notifications" },
  { id: "workflow", label: "Workflow" },
  { id: "ai_governance", label: "AI Governance" },
  { id: "other", label: "Other Settings" },
];

type AiAssistantDataDomain = "dashboard" | "operations" | "documentation" | "containers" | "finance" | "banking" | "reports" | "notifications" | "documents";
type AiAssistantGovernance = {
  accessRoles: Array<"admin" | "super_admin">;
  mode: "read_only";
  dataDomains: AiAssistantDataDomain[];
  monthlyBudgetNgn: number;
  auditRetentionDays: number;
  actionPolicy: "human_confirmation_required";
  providerEnabled: boolean;
  rolloutStage: "super_admin_only" | "selected_admins" | "all_authorized_admins";
  selectedAdminUserIds: number[];
  providerInputCostPerMillionNgn: number;
  providerOutputCostPerMillionNgn: number;
};
type AiProactiveBriefingPreferences = { enabled: boolean; daily: boolean; weekly: boolean };
type AiEvaluationCase = {
  id: number;
  caseKey: string;
  question: string;
  businessInterpretation: string;
  expectedTool: string | null;
  expectedStatus: "answered" | "unsupported";
  expectedAnswer: string | null;
  correctionGuidance: string;
  isActive: boolean;
  latestRun: null | { outcome: "passed" | "failed"; actualTool: string | null; actualStatus: string; correctionRequired: boolean; correctionNote: string | null; runAt: string };
};
type AiEvaluationResponse = { cases: AiEvaluationCase[]; summary: { activeCases: number; recentRuns: number; passed: number; failed: number; correctionsRequired: number } };

const DEFAULT_AI_GOVERNANCE: AiAssistantGovernance = {
  accessRoles: ["admin", "super_admin"],
  mode: "read_only",
  dataDomains: ["dashboard", "operations", "documentation", "containers", "finance", "banking", "reports", "notifications", "documents"],
  monthlyBudgetNgn: 100000,
  auditRetentionDays: 365,
  actionPolicy: "human_confirmation_required",
  providerEnabled: false,
  rolloutStage: "super_admin_only",
  selectedAdminUserIds: [],
  providerInputCostPerMillionNgn: 0,
  providerOutputCostPerMillionNgn: 0,
};
const DEFAULT_AI_PROACTIVE_BRIEFINGS: AiProactiveBriefingPreferences = { enabled: false, daily: true, weekly: true };

const AI_DATA_DOMAINS: Array<{ id: AiAssistantDataDomain; label: string; helper: string }> = [
  { id: "finance", label: "Finance", helper: "Invoices, receivables, payments, schedules, overheads, and wallets." },
  { id: "banking", label: "Banking", helper: "Bank balances, transfers, fund additions, and reconciliations." },
  { id: "reports", label: "Reports", helper: "Branch comparisons, analytics, financial reports, and management summaries." },
  { id: "containers", label: "Containers", helper: "Container details, ETA, berthing, stage history, and tracking." },
  { id: "operations", label: "Operations", helper: "Operational workflow status, owners, expected dates, and delays." },
  { id: "documentation", label: "Documentation", helper: "PAAR, documentation progress, release dates, and delay reasons." },
  { id: "dashboard", label: "Dashboard", helper: "High-level totals and current operational indicators." },
  { id: "notifications", label: "Notifications", helper: "Relevant alert history, delays, and required actions." },
  { id: "documents", label: "Documents", helper: "Authorised document metadata and future document-search scope." },
];

function parseAiAssistantGovernance(value?: string): AiAssistantGovernance {
  try {
    const parsed = JSON.parse(value ?? "");
    if (
      parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      Array.isArray(parsed.accessRoles) && Array.isArray(parsed.dataDomains) &&
      parsed.mode === "read_only" && parsed.actionPolicy === "human_confirmation_required" &&
      Number.isInteger(parsed.monthlyBudgetNgn) && Number.isInteger(parsed.auditRetentionDays)
    ) {
      const rawDataDomains: unknown[] = parsed.dataDomains;
      const dataDomains: AiAssistantDataDomain[] = rawDataDomains.filter((domain): domain is AiAssistantDataDomain =>
        typeof domain === "string" && AI_DATA_DOMAINS.some((item) => item.id === domain),
      );
      const rawSelectedAdminUserIds: unknown[] = Array.isArray(parsed.selectedAdminUserIds) ? parsed.selectedAdminUserIds as unknown[] : [];
      const selectedAdminUserIds = [...new Set<number>(rawSelectedAdminUserIds.map((id) => Number(id)).filter((id): id is number => Number.isInteger(id) && id > 0))];
      return {
        accessRoles: ["admin", "super_admin"],
        mode: "read_only",
        dataDomains: dataDomains.length ? [...new Set(dataDomains)] : DEFAULT_AI_GOVERNANCE.dataDomains,
        monthlyBudgetNgn: Math.max(0, parsed.monthlyBudgetNgn),
        auditRetentionDays: Math.max(30, parsed.auditRetentionDays),
        actionPolicy: "human_confirmation_required",
        providerEnabled: typeof parsed.providerEnabled === "boolean" ? parsed.providerEnabled : true,
        rolloutStage: parsed.rolloutStage === "super_admin_only" || parsed.rolloutStage === "selected_admins" || parsed.rolloutStage === "all_authorized_admins" ? parsed.rolloutStage : "all_authorized_admins",
        selectedAdminUserIds,
        providerInputCostPerMillionNgn: Math.max(0, Number(parsed.providerInputCostPerMillionNgn) || 0),
        providerOutputCostPerMillionNgn: Math.max(0, Number(parsed.providerOutputCostPerMillionNgn) || 0),
      };
    }
  } catch {}
  return DEFAULT_AI_GOVERNANCE;
}

function parseAiProactiveBriefings(value?: string): AiProactiveBriefingPreferences {
  try {
    const parsed = JSON.parse(value ?? "") as Partial<AiProactiveBriefingPreferences>;
    if (typeof parsed.enabled === "boolean" && typeof parsed.daily === "boolean" && typeof parsed.weekly === "boolean") {
      return { enabled: parsed.enabled, daily: parsed.daily, weekly: parsed.weekly };
    }
  } catch {}
  return DEFAULT_AI_PROACTIVE_BRIEFINGS;
}
const DEFAULT_DOCUMENT_SECTIONS: DocumentSection[] = [
  { id: "general", label: "General" },
  { id: "shipping", label: "Shipping" },
  { id: "customs", label: "Customs" },
  { id: "terminal", label: "Terminal" },
  { id: "delivery", label: "Delivery" },
  { id: "operations", label: "Operations" },
];

function parseDocumentSections(value?: string): DocumentSection[] {
  try {
    const parsed = JSON.parse(value ?? "");
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => item && typeof item.id === "string" && typeof item.label === "string")) {
      return parsed;
    }
  } catch {}
  return DEFAULT_DOCUMENT_SECTIONS;
}

function sectionId(label: string, sections: DocumentSection[]) {
  const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "section";
  let id = base.slice(0, 36);
  let suffix = 2;
  while (sections.some((section) => section.id === id)) id = `${base.slice(0, 32)}-${suffix++}`;
  return id;
}

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
  const [documentSections, setDocumentSections] = useState<DocumentSection[]>(DEFAULT_DOCUMENT_SECTIONS);
  const [aiGovernance, setAiGovernance] = useState<AiAssistantGovernance>(DEFAULT_AI_GOVERNANCE);
  const [aiProactiveBriefings, setAiProactiveBriefings] = useState<AiProactiveBriefingPreferences>(DEFAULT_AI_PROACTIVE_BRIEFINGS);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [evaluationDraft, setEvaluationDraft] = useState({ caseKey: "", question: "", businessInterpretation: "", expectedTool: "operations_overview", expectedAnswer: "", correctionGuidance: "" });
  const [savingTab, setSavingTab] = useState<SettingsTab | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<SettingsTab, boolean>>>({});

  const evaluationQuery = useQuery<AiEvaluationResponse>({
    queryKey: ["/api/ai-assistant/evaluations"],
    queryFn: () => customFetch("/api/ai-assistant/evaluations"),
    enabled: activeTab === "ai_governance",
    retry: false,
    staleTime: 15_000,
  });
  const runEvaluationMutation = useMutation({
    mutationFn: () => customFetch<{ total: number; passed: number; failed: number }>("/api/ai-assistant/evaluations/run", { method: "POST" }),
    onSuccess: (result) => { toast({ title: "AI evaluation completed", description: `${result.passed} passed, ${result.failed} need review.` }); evaluationQuery.refetch(); },
    onError: () => toast({ variant: "destructive", title: "Unable to run AI evaluation" }),
  });
  const createEvaluationCaseMutation = useMutation({
    mutationFn: () => customFetch("/api/ai-assistant/evaluations/cases", { method: "POST", body: JSON.stringify(evaluationDraft) }),
    onSuccess: () => { toast({ title: "Evaluation case added" }); setEvaluationDraft({ caseKey: "", question: "", businessInterpretation: "", expectedTool: "operations_overview", expectedAnswer: "", correctionGuidance: "" }); evaluationQuery.refetch(); },
    onError: () => toast({ variant: "destructive", title: "Unable to add evaluation case" }),
  });

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
      setDocumentSections(parseDocumentSections(s["documentSections"]));
      setAiGovernance(parseAiAssistantGovernance(s["aiAssistantGovernance"]));
      setAiProactiveBriefings(parseAiProactiveBriefings(s["aiProactiveBriefingPreferences"]));
    }
  }, [isLoading]);

  const mark = () => setDirtyTabs((current) => ({ ...current, [activeTab]: true }));

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

  const settingsPayload = (tab: SettingsTab): Record<string, string> => {
    switch (tab) {
      case "aging":
        return { agingInactivityDays: inactivityDays, agingDays1: days1, agingDays2: days2, agingDays3: days3, notifyBeforeDueDays };
      case "documentation":
        return { documentSections: JSON.stringify(documentSections) };
      case "email":
        return {
          agingEmailEnabled: emailEnabled ? "true" : "false",
          // Keep these values for installations that used the old single digest configuration.
          agingEmailTo: emailTo.trim(), digestFrequency, digestTime,
          emailAlertPreferences: JSON.stringify(emailPreferences),
        };
      case "workflow":
        return {
          verificationOfficerUserIds: JSON.stringify(verificationOfficerUserIds),
          verificationOfficerUserId: verificationOfficerUserIds[0] ?? "",
          berthingOfficerUserIds: JSON.stringify(berthingOfficerUserIds),
          berthingOfficerUserId: berthingOfficerUserIds[0] ?? "",
        };
      case "ai_governance":
        return { aiAssistantGovernance: JSON.stringify(aiGovernance), aiProactiveBriefingPreferences: JSON.stringify(aiProactiveBriefings) };
      default:
        return {};
    }
  };

  const handleSave = async (tab = activeTab) => {
    if (tab === "aging" && !isValid) return;
    const payload = settingsPayload(tab);
    if (Object.keys(payload).length === 0) return;
    setSavingTab(tab);
    try {
      await updateMutation.mutateAsync(payload);
      toast({ title: `${SETTINGS_TABS.find((item) => item.id === tab)?.label} settings saved` });
      setDirtyTabs((current) => ({ ...current, [tab]: false }));
    } catch {
      toast({ variant: "destructive", title: "Failed to save settings" });
    } finally {
      setSavingTab(null);
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
      await updateMutation.mutateAsync(settingsPayload("email"));
      const result = await customFetch<{
        sent: number;
        categoriesSent?: number;
        fromAddress?: string;
        productionReady?: boolean;
      }>("/api/notifications/send-email-digest", { method: "POST" });
      const now = new Date().toISOString();
      setDigestLastSentAt(now);
      setDirtyTabs((current) => ({ ...current, email: false }));
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
  const canSaveActiveTab = ["aging", "documentation", "email", "workflow", "ai_governance"].includes(activeTab);
  const activeTabDirty = Boolean(dirtyTabs[activeTab]);
  const activeTabIsValid = activeTab !== "aging" || isValid;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto w-full max-w-[1400px] space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">System Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure workflow assignments, container aging rules, notifications and email alerts.</p>
        </div>
        <Button onClick={() => handleSave()} disabled={!canSaveActiveTab || !activeTabDirty || !activeTabIsValid || savingTab !== null} className="h-10 gap-2 px-5 sm:w-auto w-full">
          {savingTab === activeTab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save {SETTINGS_TABS.find((tab) => tab.id === activeTab)?.label ?? "Changes"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card p-1.5">
          {SETTINGS_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="shrink-0 rounded-lg px-3 py-2 text-sm data-[state=active]:shadow-sm">
              {tab.label}{dirtyTabs[tab.id] ? " *" : ""}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeTab === "workflow" && <Card className="rounded-xl border-border/60 bg-card shadow-sm">
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
      </Card>}

      {activeTab === "aging" && <Card className="rounded-xl border-border/60 bg-card shadow-sm">
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
            {!isValid && activeTabDirty && <p className="text-xs text-destructive">Thresholds must be valid numbers in ascending order (Warning &lt; High Warning &lt; Critical).</p>}
          </div>
        </CardContent>
      </Card>}

      {activeTab === "documentation" && <Card className="rounded-xl border-border/60 bg-card shadow-sm">
        <CardHeader className="p-6 pb-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderOpen className="w-4 h-4 text-primary" />
            Document Sections
          </CardTitle>
          <p className="text-sm text-muted-foreground">Organise uploaded job documents into the categories your team uses. Existing files keep their recorded section if a category is removed.</p>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {documentSections.map((section) => (
              <div key={section.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-2">
                <Input
                  value={section.label}
                  maxLength={60}
                  aria-label={`${section.label} document section`}
                  onChange={(event) => {
                    const label = event.target.value;
                    setDocumentSections((current) => current.map((item) => item.id === section.id ? { ...item, label } : item));
                    mark();
                  }}
                  className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                {section.id !== "general" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${section.label}`}
                    onClick={() => { setDocumentSections((current) => current.filter((item) => item.id !== section.id)); mark(); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={documentSections.length >= 20}
            onClick={() => {
              const label = "New Section";
              setDocumentSections((current) => [...current, { id: sectionId(label, current), label }]);
              mark();
            }}
          >
            <Plus className="h-4 w-4" /> Add section
          </Button>
          <p className="text-xs text-muted-foreground">General is kept as the default. Save Changes applies only document sections in this tab.</p>
        </CardContent>
      </Card>}

      {activeTab === "email" && <Card className="rounded-xl border-border/60 bg-card shadow-sm">
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
      </Card>}

      {activeTab === "general" && (
        <Card className="rounded-xl border-border/60 bg-card shadow-sm">
          <CardHeader className="p-6 pb-0">
            <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-4 w-4 text-primary" />General Settings</CardTitle>
            <p className="text-sm text-muted-foreground">System-wide controls will appear here as they are added.</p>
          </CardHeader>
          <CardContent className="p-6"><div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">There are no general settings to configure yet. Use the dedicated tabs for workflow, document, aging, and email controls.</div></CardContent>
        </Card>
      )}

      {activeTab === "ai_governance" && (
        <div className="space-y-6">
          <Card className="rounded-xl border-border/60 bg-card shadow-sm">
            <CardHeader className="p-6 pb-0">
              <CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-4 w-4 text-primary" />AI Assistant Governance</CardTitle>
              <p className="text-sm text-muted-foreground">Set the safe operating rules for the future Financial Intelligence Assistant before any AI connection is enabled.</p>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Phase 0: Governance only</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The assistant is limited to approved, permission-scoped tools. Natural-language routing is enabled only after an administrator configures the Railway provider key; it never receives direct database access.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background/50 p-4 space-y-3">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Authorised access</p></div>
                  <p className="text-xs leading-relaxed text-muted-foreground">The first release is restricted to these elevated roles. Future backend checks will enforce this server-side.</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium">Admin</span>
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium">Super Admin</span>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/50 p-4 space-y-3">
                  <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Action boundary</p></div>
                  <p className="text-xs leading-relaxed text-muted-foreground">The assistant will begin in read-only mode. Any future draft action must be reviewed and explicitly confirmed by a human through the normal application permissions.</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">Read-only required</span>
                    <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs">Human confirmation required</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border border-border/60 bg-background/40 p-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4"><div><Label>Natural-language provider</Label><p className="mt-1 text-xs text-muted-foreground">Kill switch for OpenAI requests. Approved local tools and report requests continue to work.</p></div><Switch checked={aiGovernance.providerEnabled} onCheckedChange={(providerEnabled) => { setAiGovernance((current) => ({ ...current, providerEnabled })); mark(); }} /></div>
                </div>
                <div className="space-y-2"><Label>Rollout access</Label><Select value={aiGovernance.rolloutStage} onValueChange={(rolloutStage: AiAssistantGovernance["rolloutStage"]) => { setAiGovernance((current) => ({ ...current, rolloutStage })); mark(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="super_admin_only">Super Admins only</SelectItem><SelectItem value="selected_admins">Selected Admins</SelectItem><SelectItem value="all_authorized_admins">All Admins and Super Admins</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Super Admins always retain access to configure and monitor the assistant.</p></div>
              </div>
              {aiGovernance.rolloutStage === "selected_admins" && <div className="space-y-2"><Label>Selected Admins</Label><div className="grid gap-2 md:grid-cols-2">{users.filter((user) => user.isActive && user.role === "admin").map((user) => { const checked = aiGovernance.selectedAdminUserIds.includes(user.id); return <label key={user.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm"><Checkbox checked={checked} onCheckedChange={(next) => { setAiGovernance((current) => ({ ...current, selectedAdminUserIds: next ? [...new Set([...current.selectedAdminUserIds, user.id])] : current.selectedAdminUserIds.filter((id) => id !== user.id) })); mark(); }} />{user.name}</label>; })}</div><p className="text-xs text-muted-foreground">Choose at least one active Admin before saving this rollout stage.</p></div>}
              <div className="grid gap-4 rounded-xl border border-border/60 bg-background/40 p-4 md:grid-cols-2"><div className="space-y-2"><Label>Input token price (NGN per 1M tokens)</Label><Input type="number" min="0" inputMode="decimal" value={aiGovernance.providerInputCostPerMillionNgn} onChange={(event) => { setAiGovernance((current) => ({ ...current, providerInputCostPerMillionNgn: Math.max(0, Number(event.target.value) || 0) })); mark(); }} /><p className="text-xs text-muted-foreground">Set this from your OpenAI model pricing so monthly spend is estimated from actual usage.</p></div><div className="space-y-2"><Label>Output token price (NGN per 1M tokens)</Label><Input type="number" min="0" inputMode="decimal" value={aiGovernance.providerOutputCostPerMillionNgn} onChange={(event) => { setAiGovernance((current) => ({ ...current, providerOutputCostPerMillionNgn: Math.max(0, Number(event.target.value) || 0) })); mark(); }} /><p className="text-xs text-muted-foreground">Leave both prices at zero only when you intentionally do not need cost estimates.</p></div></div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-sm">
            <CardHeader className="p-6 pb-0">
              <CardTitle className="flex items-center gap-2 text-lg"><DatabaseZap className="h-4 w-4 text-primary" />Proposed Data Scope</CardTitle>
              <p className="text-sm text-muted-foreground">Choose the application areas the future assistant may query through approved, permission-checked tools. This does not grant access today.</p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {AI_DATA_DOMAINS.map((domain) => {
                  const selected = aiGovernance.dataDomains.includes(domain.id);
                  return (
                    <label key={domain.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${selected ? "border-primary/30 bg-primary/5" : "border-border/60 bg-background/40"}`}>
                      <Checkbox checked={selected} disabled={selected && aiGovernance.dataDomains.length === 1} onCheckedChange={(checked) => {
                        setAiGovernance((current) => ({
                          ...current,
                          dataDomains: checked
                            ? [...new Set([...current.dataDomains, domain.id])]
                            : current.dataDomains.filter((item) => item !== domain.id),
                        }));
                        mark();
                      }} />
                      <span className="space-y-1"><span className="block text-sm font-medium">{domain.label}</span><span className="block text-xs leading-relaxed text-muted-foreground">{domain.helper}</span></span>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-sm">
            <CardHeader className="p-6 pb-0">
              <CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-4 w-4 text-primary" />Proactive Finance & Control Briefings</CardTitle>
              <p className="text-sm text-muted-foreground">Generate scheduled, evidence-based risk summaries for active branch administrators. Briefings link to affected containers, invoices, and payment schedules; they do not make decisions or change records.</p>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 p-4">
                <div><p className="text-sm font-medium">Enable proactive briefings</p><p className="mt-1 text-xs text-muted-foreground">Uses the configured digest time and sends in-app notices only when a briefing contains risk items.</p></div>
                <Switch checked={aiProactiveBriefings.enabled} onCheckedChange={(enabled) => { setAiProactiveBriefings((current) => ({ ...current, enabled })); mark(); }} />
              </div>
              <div className={`grid gap-4 md:grid-cols-2 ${!aiProactiveBriefings.enabled ? "opacity-55" : ""}`}>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 p-4"><div><p className="text-sm font-medium">Daily briefing</p><p className="mt-1 text-xs text-muted-foreground">Prioritised current finance and operational exceptions.</p></div><Switch disabled={!aiProactiveBriefings.enabled} checked={aiProactiveBriefings.daily} onCheckedChange={(daily) => { setAiProactiveBriefings((current) => ({ ...current, daily })); mark(); }} /></div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 p-4"><div><p className="text-sm font-medium">Weekly briefing</p><p className="mt-1 text-xs text-muted-foreground">A Monday trend and risk review using the same evidence rules.</p></div><Switch disabled={!aiProactiveBriefings.enabled} checked={aiProactiveBriefings.weekly} onCheckedChange={(weekly) => { setAiProactiveBriefings((current) => ({ ...current, weekly })); mark(); }} /></div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">Recipients are active Admins and Super Admins within the affected branch. Email alerts remain separately controlled in the Email Alerts tab.</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-sm">
            <CardHeader className="p-6 pb-0">
              <CardTitle className="flex items-center gap-2 text-lg"><WalletCards className="h-4 w-4 text-primary" />Budget and Audit Policy</CardTitle>
              <p className="text-sm text-muted-foreground">Define the financial usage limit and how long future AI activity records must remain available for review.</p>
            </CardHeader>
            <CardContent className="grid gap-5 p-6 md:grid-cols-2">
              <div className="space-y-2"><Label>Monthly AI budget (NGN)</Label><Input inputMode="numeric" min="0" type="number" value={aiGovernance.monthlyBudgetNgn} onChange={(event) => { setAiGovernance((current) => ({ ...current, monthlyBudgetNgn: Number(event.target.value) || 0 })); mark(); }} /><p className="text-xs text-muted-foreground">A maximum planned spend for model and document-processing usage. It will be enforced when the AI service is introduced.</p></div>
              <div className="space-y-2"><Label>AI audit retention (days)</Label><Input inputMode="numeric" min="30" max="3650" type="number" value={aiGovernance.auditRetentionDays} onChange={(event) => { setAiGovernance((current) => ({ ...current, auditRetentionDays: Math.max(30, Number(event.target.value) || 30) })); mark(); }} /><p className="text-xs text-muted-foreground">Future questions, answers, tools used, source records, generated drafts, and confirmed actions will be retained for this period.</p></div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-sm">
            <CardHeader className="flex flex-col gap-3 p-6 pb-0 sm:flex-row sm:items-start sm:justify-between">
              <div><CardTitle className="flex items-center gap-2 text-lg"><CheckCircle2 className="h-4 w-4 text-primary" />Continuous Evaluation</CardTitle><p className="mt-1 text-sm text-muted-foreground">Run anonymised business questions before an AI update. The suite checks interpretation and approved-tool selection only; it never queries live records or changes data.</p></div>
              <Button type="button" variant="outline" className="gap-2" onClick={() => runEvaluationMutation.mutate()} disabled={runEvaluationMutation.isPending}><CheckCircle2 className="h-4 w-4" />{runEvaluationMutation.isPending ? "Running evaluation..." : "Run evaluation suite"}</Button>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              {evaluationQuery.data && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div className="rounded-lg border border-border/60 bg-background/50 p-3"><p className="text-xs text-muted-foreground">Active cases</p><p className="mt-1 text-xl font-semibold">{evaluationQuery.data.summary.activeCases}</p></div><div className="rounded-lg border border-border/60 bg-background/50 p-3"><p className="text-xs text-muted-foreground">Runs (30d)</p><p className="mt-1 text-xl font-semibold">{evaluationQuery.data.summary.recentRuns}</p></div><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3"><p className="text-xs text-muted-foreground">Passed</p><p className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-400">{evaluationQuery.data.summary.passed}</p></div><div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] p-3"><p className="text-xs text-muted-foreground">Failed</p><p className="mt-1 text-xl font-semibold text-destructive">{evaluationQuery.data.summary.failed}</p></div><div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3"><p className="text-xs text-muted-foreground">Corrections needed</p><p className="mt-1 text-xl font-semibold text-amber-700 dark:text-amber-400">{evaluationQuery.data.summary.correctionsRequired}</p></div></div>}
              {evaluationQuery.isError ? <p className="rounded-lg border border-destructive/25 bg-destructive/[0.05] p-3 text-sm text-destructive">Evaluation management is available to Super Admins only.</p> : evaluationQuery.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading evaluation library...</div> : <div className="space-y-3">{evaluationQuery.data?.cases.map((evaluationCase) => <div key={evaluationCase.id} className={`rounded-xl border p-4 ${evaluationCase.latestRun?.outcome === "failed" ? "border-destructive/30 bg-destructive/[0.035]" : "border-border/60 bg-background/40"}`}><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-medium">{evaluationCase.question}</p><p className="mt-1 text-sm text-muted-foreground">Expected: {evaluationCase.businessInterpretation}</p></div><span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${evaluationCase.latestRun?.outcome === "failed" ? "border-destructive/30 text-destructive" : evaluationCase.latestRun?.outcome === "passed" ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" : "border-border/70 text-muted-foreground"}`}>{evaluationCase.latestRun ? evaluationCase.latestRun.outcome : "Not run"}</span></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Expected tool: {evaluationCase.expectedTool ?? "No tool"}</span><span>Expected status: {evaluationCase.expectedStatus}</span>{evaluationCase.latestRun && <span>Actual: {evaluationCase.latestRun.actualTool ?? "No tool"} / {evaluationCase.latestRun.actualStatus}</span>}</div>{evaluationCase.latestRun?.correctionNote && <p className="mt-3 rounded-lg border border-destructive/20 bg-background/60 p-3 text-sm text-muted-foreground">{evaluationCase.latestRun.correctionNote}</p>}{evaluationCase.correctionGuidance && <p className="mt-2 text-xs text-muted-foreground">Correction guidance: {evaluationCase.correctionGuidance}</p>}</div>)}</div>}
              <details className="rounded-xl border border-border/60 bg-muted/[0.12] p-4"><summary className="cursor-pointer text-sm font-medium">Add an anonymised business question</summary><p className="mt-2 text-xs leading-5 text-muted-foreground">Do not enter client names, container numbers, uploaded-document text, or other production data. This library exists to protect business definitions and tool selection.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Case key</Label><Input value={evaluationDraft.caseKey} onChange={(event) => setEvaluationDraft((current) => ({ ...current, caseKey: event.target.value }))} placeholder="terminal-physical-presence" /></div><div className="space-y-2"><Label>Expected tool</Label><Input value={evaluationDraft.expectedTool} onChange={(event) => setEvaluationDraft((current) => ({ ...current, expectedTool: event.target.value }))} placeholder="operations_overview" /></div><div className="space-y-2 md:col-span-2"><Label>Question</Label><Input value={evaluationDraft.question} onChange={(event) => setEvaluationDraft((current) => ({ ...current, question: event.target.value }))} placeholder="How many containers are physically in the terminal?" /></div><div className="space-y-2 md:col-span-2"><Label>Correct business interpretation</Label><Textarea value={evaluationDraft.businessInterpretation} onChange={(event) => setEvaluationDraft((current) => ({ ...current, businessInterpretation: event.target.value }))} className="min-h-[72px] resize-none" placeholder="Explain what the question must mean in this app." /></div><div className="space-y-2 md:col-span-2"><Label>Expected answer / result</Label><Textarea value={evaluationDraft.expectedAnswer} onChange={(event) => setEvaluationDraft((current) => ({ ...current, expectedAnswer: event.target.value }))} className="min-h-[72px] resize-none" placeholder="Describe the expected evidence-backed result." /></div><div className="space-y-2 md:col-span-2"><Label>Correction guidance</Label><Input value={evaluationDraft.correctionGuidance} onChange={(event) => setEvaluationDraft((current) => ({ ...current, correctionGuidance: event.target.value }))} placeholder="What should be checked if this case fails?" /></div></div><Button type="button" className="mt-4" onClick={() => createEvaluationCaseMutation.mutate()} disabled={createEvaluationCaseMutation.isPending}><Plus className="mr-2 h-4 w-4" />{createEvaluationCaseMutation.isPending ? "Adding case..." : "Add evaluation case"}</Button></details>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "notifications" && (
        <Card className="rounded-xl border-border/60 bg-card shadow-sm">
          <CardHeader className="p-6 pb-0">
            <CardTitle className="flex items-center gap-2 text-lg"><Mail className="h-4 w-4 text-primary" />Notifications</CardTitle>
            <p className="text-sm text-muted-foreground">In-app notifications follow workflow roles, assignments, and branch access.</p>
          </CardHeader>
          <CardContent className="p-6"><div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">Notification preferences will appear here when they become configurable. Email delivery preferences are available in Email Alerts.</div></CardContent>
        </Card>
      )}

      {activeTab === "other" && (
        <Card className="rounded-xl border-border/60 bg-card shadow-sm">
          <CardHeader className="p-6 pb-0">
            <CardTitle className="flex items-center gap-2 text-lg"><FolderOpen className="h-4 w-4 text-primary" />Other Settings</CardTitle>
            <p className="text-sm text-muted-foreground">Reserved for future integrations, storage, and advanced platform configuration.</p>
          </CardHeader>
          <CardContent className="p-6"><div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">No additional settings are available yet. This space keeps future configuration from crowding the core settings pages.</div></CardContent>
        </Card>
      )}
    </motion.div>
  );
}
