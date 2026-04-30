import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useGetWorkflowNotifications,
  useMarkAllWorkflowNotificationsRead,
  useMarkWorkflowNotificationRead,
  useGetNotifications,
  useMarkAllNotificationsRead,
  type WorkflowNotification,
} from "@workspace/api-client-react";
import { Bell, CheckCheck, BriefcaseIcon, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NOTIF_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  new_job:       { icon: BriefcaseIcon,  color: "text-blue-400"          },
  stage_complete:{ icon: CheckCircle2,   color: "text-emerald-400"        },
  overdue:       { icon: AlertTriangle,  color: "text-red-400"            },
  delay_recorded:{ icon: Clock,          color: "text-amber-400"          },
  action_overdue:       { icon: AlertTriangle, color: "text-red-400"      },
  empty_return_overdue: { icon: AlertTriangle, color: "text-orange-400"   },
  aging_critical:       { icon: AlertTriangle, color: "text-red-400"      },
  aging_high:           { icon: AlertTriangle, color: "text-orange-400"   },
  aging_warn:           { icon: Clock,         color: "text-yellow-400"   },
  overdue_task:         { icon: Clock,         color: "text-amber-400"    },
  inactive:             { icon: Clock,         color: "text-muted-foreground" },
};

function playBeep(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

export function NotificationBeepBell({ isAuthenticated }: { isAuthenticated: boolean }) {
  const POLL = 30_000;

  const { data: workflowData } = useGetWorkflowNotifications({
    query: { refetchInterval: POLL, enabled: isAuthenticated },
  });
  const { data: classicData } = useGetNotifications({
    query: { refetchInterval: POLL, enabled: isAuthenticated },
  });

  const markAllWorkflow  = useMarkAllWorkflowNotificationsRead();
  const markOneWorkflow  = useMarkWorkflowNotificationRead();
  const markAllClassic   = useMarkAllNotificationsRead();

  const notifications: WorkflowNotification[] = workflowData?.notifications ?? [];
  const workflowUnread: number = workflowData?.unreadCount ?? 0;
  const classicUnread: number  = (classicData as any)?.unreadCount ?? 0;
  const totalUnread = workflowUnread + classicUnread;
  const hasUnread = totalUnread > 0;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [beepActive, setBeepActive] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasUnread && !beepActive) {
      setBeepActive(true);
    } else if (!hasUnread && beepActive) {
      setBeepActive(false);
    }
  }, [hasUnread]);

  useEffect(() => {
    if (beepActive) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      playBeep(ctx);
      beepIntervalRef.current = setInterval(() => playBeep(ctx), 8000);
    } else {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    }
    return () => {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    };
  }, [beepActive]);

  const handleMarkAllRead = () => {
    markAllWorkflow.mutate();
    markAllClassic.mutate();
  };

  if (!isAuthenticated) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0 rounded-full">
          <Bell className={`w-4 h-4 ${hasUnread ? "text-primary" : "text-muted-foreground"}`} />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[460px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-muted-foreground" />
            Alerts &amp; Notifications
            {totalUnread > 0 && (
              <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none font-bold">
                {totalUnread}
              </span>
            )}
          </span>
          <Link href="/notifications">
            <span className="text-[10px] text-primary hover:underline cursor-pointer">View all</span>
          </Link>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Classic system alerts */}
        {classicUnread > 0 && (
          <>
            <div className="px-2 py-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                System Alerts ({classicUnread} unread)
              </p>
            </div>
            <DropdownMenuItem asChild className="cursor-pointer py-2.5">
              <Link href="/notifications" onClick={() => setOpen(false)}>
                <div className="flex items-center gap-3 w-full">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground leading-tight">
                      {classicUnread} unread system alert{classicUnread !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Click to view — alerts mark read on the Notifications page
                    </p>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                </div>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Workflow event notifications */}
        {notifications.length > 0 && (
          <div className="px-2 py-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Workflow Events
            </p>
          </div>
        )}

        {notifications.length === 0 && classicUnread === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No new notifications
          </div>
        ) : (
          notifications.slice(0, 8).map((n) => {
            const cfg = NOTIF_TYPE_CONFIG[n.type] ?? NOTIF_TYPE_CONFIG.stage_complete;
            const Icon = cfg.icon;
            return (
              <DropdownMenuItem
                key={n.id}
                asChild
                className={`cursor-pointer py-2.5 ${n.isRead ? "opacity-60" : ""}`}
                onClick={() => {
                  if (!n.isRead) markOneWorkflow.mutate({ id: n.id });
                  setOpen(false);
                }}
              >
                <Link href={n.containerId ? `/operations/${n.containerId}` : "/notifications"}>
                  <div className="flex items-start gap-3 w-full">
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground leading-tight">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(n.createdAt).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </div>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}

        {(notifications.length > 0 || classicUnread > 0) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground cursor-pointer justify-center gap-2"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all as read
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
