import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Clock, AlertTriangle, ShieldAlert, Mail, Send } from "lucide-react";

const DEFAULTS = {
  agingInactivityDays: "7",
  agingDays1: "30",
  agingDays2: "60",
  agingDays3: "90",
  agingEmailEnabled: "false",
  agingEmailTo: "",
};

export default function SettingsPage() {
  const { data: settings = {}, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const { toast } = useToast();

  const s = settings as Record<string, string>;

  const [inactivityDays, setInactivityDays] = useState(DEFAULTS.agingInactivityDays);
  const [days1, setDays1] = useState(DEFAULTS.agingDays1);
  const [days2, setDays2] = useState(DEFAULTS.agingDays2);
  const [days3, setDays3] = useState(DEFAULTS.agingDays3);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setInactivityDays(s["agingInactivityDays"] ?? DEFAULTS.agingInactivityDays);
      setDays1(s["agingDays1"] ?? DEFAULTS.agingDays1);
      setDays2(s["agingDays2"] ?? DEFAULTS.agingDays2);
      setDays3(s["agingDays3"] ?? DEFAULTS.agingDays3);
      setEmailEnabled(s["agingEmailEnabled"] === "true");
      setEmailTo(s["agingEmailTo"] ?? "");
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
    parseInt(days1) < parseInt(days2) &&
    parseInt(days2) < parseInt(days3);

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        agingInactivityDays: inactivityDays,
        agingDays1: days1,
        agingDays2: days2,
        agingDays3: days3,
        agingEmailEnabled: emailEnabled ? "true" : "false",
        agingEmailTo: emailTo.trim(),
      });
      toast({ title: "Settings saved" });
      setDirty(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  const handleSendDigest = async () => {
    if (!emailTo.trim()) {
      toast({ variant: "destructive", title: "Please enter at least one email address first" });
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch("/api/notifications/send-email-digest", { method: "POST", credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? "Server error"); }
      toast({ title: "Email digest sent", description: `Alert summary sent to ${emailTo}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to send email", description: err?.message ?? "Check that email settings are configured correctly" });
    } finally {
      setSendingEmail(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">System Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure alert thresholds and system behaviour.</p>
      </div>

      {/* Aging Alerts */}
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-primary" />
            Container Aging Alerts
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Set how long a container can be in clearing before alerts fire. Alerts appear in Notifications and are colour-coded on the Containers list.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">

          <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-semibold">Inactivity Alert</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Fire an alert when no update has been made to a container for this many days.
            </p>
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Days without activity</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={inactivityDays}
                    onChange={(e) => { setInactivityDays(e.target.value); mark(); }}
                    className="h-8 w-24 text-sm"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldAlert className="w-4 h-4 text-primary" />
              Aging Thresholds
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Alert when a container has been clearing longer than these thresholds. Must be in ascending order.
            </p>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  Warning
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} value={days1} onChange={(e) => { setDays1(e.target.value); mark(); }} className="h-8 text-sm" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">days</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Amber badge</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                  High Warning
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} value={days2} onChange={(e) => { setDays2(e.target.value); mark(); }} className="h-8 text-sm" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">days</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Orange badge</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  Critical
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} value={days3} onChange={(e) => { setDays3(e.target.value); mark(); }} className="h-8 text-sm" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">days</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Red badge</p>
              </div>
            </div>

            {!isValid && dirty && (
              <p className="text-xs text-destructive">
                Thresholds must be valid numbers in ascending order (Warning &lt; High Warning &lt; Critical).
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={!dirty || !isValid || saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Alerts */}
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4 text-primary" />
            Email Alerts
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Send an email digest of current aging and critical alerts to the specified recipients.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-background/50">
            <div>
              <p className="text-sm font-medium">Enable email alerts</p>
              <p className="text-xs text-muted-foreground mt-0.5">Activates the email digest feature</p>
            </div>
            <Switch checked={emailEnabled} onCheckedChange={(v) => { setEmailEnabled(v); mark(); }} />
          </div>

          <div className="space-y-1.5">
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

          <div className="flex items-center justify-between pt-1">
            <Button
              variant="outline"
              onClick={handleSendDigest}
              disabled={sendingEmail || !emailTo.trim()}
              className="gap-2"
            >
              {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Digest Now
            </Button>
            <Button onClick={handleSave} disabled={!dirty || !isValid || saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
