import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useGetWorkflowNotifications,
  useMarkAllWorkflowNotificationsRead,
  type WorkflowNotification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, BriefcaseIcon, CheckCircle2, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NOTIF_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  new_job:       { icon: BriefcaseIcon,  color: "text-blue-400",   label: "New Job"          },
  stage_complete:{ icon: CheckCircle2,   color: "text-emerald-400", label: "Stage Completed"  },
  overdue:       { icon: AlertTriangle,  color: "text-red-400",    label: "Overdue"           },
  delay_recorded:{ icon: Clock,          color: "text-amber-400",  label: "Delay Recorded"    },
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
  const { data } = useGetWorkflowNotifications({
    query: { refetchInterval: 30_000, enabled: isAuthenticated },
  });
  const markAllRead = useMarkAllWorkflowNotificationsRead();
  const qc = useQueryClient();

  const notifications: WorkflowNotification[] = data?.notifications ?? [];
  const unreadCount: number = data?.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;

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

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && hasUnread) {
      setBeepActive(false);
      markAllRead.mutate();
    }
  };

  if (!isAuthenticated) return null;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative h-9 w-9 p-0 rounded-full">
          <Bell className={`w-4 h-4 ${hasUnread ? "text-primary" : "text-muted-foreground"}`} />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-muted-foreground" />
            Workflow Alerts
          </span>
          {notifications.length > 0 && (
            <Link href="/notifications">
              <span className="text-[10px] text-primary hover:underline cursor-pointer">View all</span>
            </Link>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No workflow alerts
          </div>
        ) : (
          notifications.slice(0, 10).map((n) => {
            const cfg = NOTIF_TYPE_CONFIG[n.type] ?? NOTIF_TYPE_CONFIG.stage_complete;
            const Icon = cfg.icon;
            return (
              <DropdownMenuItem key={n.id} asChild className={`cursor-pointer py-3 ${n.isRead ? "opacity-60" : ""}`}>
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
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => markAllRead.mutate()}
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
