"use client";

import { useMemo, useState, useCallback } from "react";
import {
  parseISO,
  startOfDay,
  endOfDay,
  addDays,
  addMinutes,
  addHours,
  subMinutes,
  isWithinInterval,
  format,
  isValid,
} from "date-fns";
import type { Task, CalendarEvent, Client, Project, Employee } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import { Sparkles, Loader2, CalendarRange, Info } from "lucide-react";
import { cn } from "@/lib/utils";

function isJeffDillon(emp: Employee | null): boolean {
  const first = String(emp?.firstName || "").toLowerCase().trim();
  const last = String(emp?.lastName || "").toLowerCase().trim();
  const email = String(emp?.email || "").toLowerCase().trim();
  // Prefer email as a stable identifier (names can be edited or blank during load).
  if (email) {
    if (email === "jeff@designersink.us") return true;
    if (email.startsWith("jeff") && email.includes("dillon")) return true;
    if (email.includes("jeff") && email.includes("designersink")) return true;
  }
  return first.includes("jeff") && last.includes("dillon");
}

function tasksAssignedToEmployee(tasks: Task[], emp: Employee | null): Task[] {
  if (!emp) return [];
  const fn = String(emp.firstName || "").toLowerCase().trim();
  const ln = String(emp.lastName || "").toLowerCase().trim();
  if (!fn || !ln) return [];
  const strict = tasks.filter((t) => {
    if (t.status === "Completed") return false;
    const a = String(t.assignedTo || "").toLowerCase();
    return a.includes(fn) && a.includes(ln);
  });
  if (strict.length) return strict;
  // Fallback: if assignee strings are inconsistent, at least match first name.
  return tasks.filter((t) => {
    if (t.status === "Completed") return false;
    const a = String(t.assignedTo || "").toLowerCase();
    return a.includes(fn);
  });
}

type Props = {
  tasks: Task[];
  /** Merged Google + Firestore — used for busy slots (Command blocks excluded). */
  scheduleEventsMerged: CalendarEvent[];
  /** User-visible calendar rows (already privacy-filtered). */
  calendarEvents: CalendarEvent[];
  clients: Client[];
  projects: Project[];
  currentEmployee: Employee | null;
  onAddEvent: (event: Omit<CalendarEvent, "id" | "ownerId">) => void | string | undefined;
  onUpdateEvent: (id: string, event: Partial<CalendarEvent>) => void;
  onDeleteEvent: (id: string) => void;
  /** Opens task detail (e.g. switch to Tasks tab + task dialog). */
  onViewTask?: (task: Task) => void;
};

export function CommandSchedulePanel({
  tasks,
  scheduleEventsMerged,
  calendarEvents,
  clients,
  projects,
  currentEmployee,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onViewTask,
}: Props) {
  const { toast } = useToast();
  const [horizonDays, setHorizonDays] = useState(7);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);

  const show = isJeffDillon(currentEmployee);
  const myOpenTasks = useMemo(
    () => tasksAssignedToEmployee(tasks, currentEmployee),
    [tasks, currentEmployee],
  );

  const commandBlocks = useMemo(
    () => calendarEvents.filter((e) => e.type === "CommandBlock"),
    [calendarEvents],
  );

  const upcomingCommand = useMemo(() => {
    const today = startOfDay(new Date());
    return [...commandBlocks]
      .filter((e) => {
        const s = safeParse(e.startTime);
        return s && !isNaN(s.getTime()) && s >= today;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 12);
  }, [commandBlocks]);

  const runAiSchedule = useCallback(async () => {
    const anchor = format(new Date(), "yyyy-MM-dd");
    const windowStart = localDateFromYmd(anchor);
    const windowEnd = endOfDay(addDays(windowStart, horizonDays - 1));

    const nonCommandEvents = scheduleEventsMerged.filter((e) => e.type !== "CommandBlock");

    const meetingPrepBlocks = nonCommandEvents
      .filter((e) => e.type !== "TaskBlock")
      .map((e) => {
        const start = safeParse(e.startTime);
        if (!start) return null;
        const prepStart = subMinutes(start, 30);
        const prepEnd = start;
        return {
          title: `Prep: ${e.title || "Meeting"}`,
          startTime: prepStart.toISOString(),
          endTime: prepEnd.toISOString(),
        };
      })
      .filter(
        (b): b is { title: string; startTime: string; endTime: string } =>
          !!b && !!b.startTime && !!b.endTime,
      )
      .slice(0, 200);

    const busySlots = [
      ...nonCommandEvents.map((e) => ({
        startTime: e.startTime,
        endTime: e.endTime,
        title: e.title,
      })),
      ...meetingPrepBlocks,
    ].slice(0, 220);

    const taskPayload = myOpenTasks.map((t) => ({
      id: t.id,
      name: t.name || t.description?.slice(0, 80),
      description: (t.description || "").slice(0, 500),
      priority: t.priority,
      deadline: t.deadline || "",
      isHardDeadline: !!t.isHardDeadline,
      estimatedHours: t.estimatedHours ?? 0,
      category: t.category || "",
      status: t.status,
    }));

    setAiLoading(true);
    setLastSummary(null);
    try {
      const res = await fetch("/api/gemini/command-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planningAnchorDate: anchor,
          horizonDays,
          tasks: taskPayload,
          busySlots,
        }),
      });
      const rawText = await res.text();
      let data: {
        error?: string;
        blocks?: Array<{
          taskId: string;
          title: string;
          startTime: string;
          endTime: string;
          notes: string;
          category: string;
        }>;
        summary?: string;
      };
      try {
        data = JSON.parse(rawText) as typeof data;
      } catch {
        throw new Error(
          `AI endpoint returned non-JSON (HTTP ${res.status}). First 200 chars: ${rawText.slice(0, 200)}`,
        );
      }
      const typed = data;
      const dataErr = typeof typed.error === "string" ? typed.error : "";
      if (!res.ok) {
        throw new Error(dataErr || `AI schedule failed (HTTP ${res.status})`);
      }

      const blocks = Array.isArray(typed.blocks) ? typed.blocks : [];
      if (blocks.length === 0) {
        toast({
          variant: "destructive",
          title: "No blocks returned",
          description: "Gemini returned an empty plan. Try again or shorten the horizon.",
        });
        return;
      }
      const summary = typeof typed.summary === "string" ? typed.summary : "";

      if (replaceExisting) {
        const toRemove = calendarEvents.filter((e) => {
          if (e.type !== "CommandBlock") return false;
          const s = safeParse(e.startTime);
          if (!s) return false;
          return isWithinInterval(s, { start: windowStart, end: windowEnd });
        });
        for (const e of toRemove) {
          onDeleteEvent(e.id);
        }
      }

      let added = 0;

      // Always include deterministic 30-minute prep before meetings/appointments.
      for (const p of meetingPrepBlocks) {
        const s = safeParse(p.startTime);
        if (!s) continue;
        if (!isWithinInterval(s, { start: windowStart, end: windowEnd })) continue;
        onAddEvent({
          title: p.title,
          description: "[Auto-added prep time before meeting — edit as needed]",
          type: "CommandBlock",
          visibility: "Private",
          startTime: p.startTime,
          endTime: p.endTime,
          taskId: undefined,
          projectIds: [],
          clientIds: [],
          aiGenerated: true,
        });
        added += 1;
      }

      for (const b of blocks) {
        const task = b.taskId ? myOpenTasks.find((t) => t.id === b.taskId) : undefined;
        const desc = [
          b.notes,
          b.category ? `Category: ${b.category}` : "",
          "[AI suggested — edit or drag in Command Calendar]",
        ]
          .filter(Boolean)
          .join("\n\n");

        onAddEvent({
          title: b.title,
          description: desc,
          type: "CommandBlock",
          visibility: "Private",
          startTime: b.startTime,
          endTime: b.endTime,
          taskId: task?.id,
          projectIds: task?.projectId ? [task.projectId] : [],
          clientIds: task?.clientId ? [task.clientId] : [],
          aiGenerated: true,
        });
        added += 1;
      }

      setLastSummary(summary || null);
      toast({
        title: "Command schedule updated",
        description: `${added} private block${added === 1 ? "" : "s"} added. Open Command Calendar to adjust.`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Request failed";

      const isTimeout =
        msg.toLowerCase().includes("timed out") ||
        msg.toLowerCase().includes("timeout") ||
        msg.toLowerCase().includes("gateway");

      if (isTimeout) {
        const fallback = buildFallbackSchedule({
          horizonDays,
          tasks: myOpenTasks,
          busyEvents: nonCommandEvents,
          prepMinutes: 30,
        });

        if (replaceExisting) {
          const toRemove = calendarEvents.filter((e) => {
            if (e.type !== "CommandBlock") return false;
            const s = safeParse(e.startTime);
            if (!s) return false;
            return isWithinInterval(s, { start: windowStart, end: windowEnd });
          });
          for (const e of toRemove) onDeleteEvent(e.id);
        }

        let added = 0;
        for (const b of fallback.blocks) {
          const task = b.taskId ? myOpenTasks.find((t) => t.id === b.taskId) : undefined;
          onAddEvent({
            title: b.title,
            description: b.notes,
            type: "CommandBlock",
            visibility: "Private",
            startTime: b.startTime,
            endTime: b.endTime,
            taskId: task?.id,
            projectIds: task?.projectId ? [task.projectId] : [],
            clientIds: task?.clientId ? [task.clientId] : [],
            aiGenerated: true,
          });
          added += 1;
        }

        setLastSummary(fallback.summary);
        toast({
          title: "Command schedule updated",
          description: `${added} private blocks added (offline fallback). Gemini timed out.`,
        });
      } else {
        toast({ variant: "destructive", title: "AI schedule failed", description: msg });
      }
    } finally {
      setAiLoading(false);
    }
  }, [
    horizonDays,
    replaceExisting,
    scheduleEventsMerged,
    myOpenTasks,
    calendarEvents,
    onAddEvent,
    onDeleteEvent,
    toast,
  ]);

  if (!show) return null;

  return (
    <>
      <Card className="border-violet-500/25 bg-card/30 shadow-xl overflow-hidden mt-6">
        <CardHeader className="bg-violet-500/10 border-b border-violet-500/20 py-4 space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-lg font-headline text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-400" />
              Command Calendar
            </CardTitle>
            <Badge variant="outline" className="text-[8px] uppercase border-violet-500/40 text-violet-300">
              Private · You only
            </Badge>
          </div>
          <CardDescription className="text-[11px] text-muted-foreground leading-relaxed">
            AI proposes time blocks from your tasks, Google/Ledger busy times, 1:30 PM–4:30 AM shift, admin
            bias until ~6 PM, then priorities and deadlines. Blocks are{" "}
            <span className="text-violet-300 font-semibold">not</span> shown on the main Schedule list — only
            here and in the full Command view.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Horizon (days)</Label>
              <select
                className="flex h-9 rounded-md border border-border/50 bg-background px-2 text-sm font-bold"
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
              >
                {[3, 5, 7, 10, 14].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Checkbox
                id="cmd-replace"
                checked={replaceExisting}
                onCheckedChange={(c) => setReplaceExisting(!!c)}
              />
              <Label htmlFor="cmd-replace" className="text-xs cursor-pointer">
                Replace existing Command blocks in that window
              </Label>
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={() => setCalOpen(true)}>
              <CalendarRange className="h-4 w-4" />
              Open Command Calendar
            </Button>
          </div>

          {myOpenTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No open tasks assigned to you — add tasks to generate a plan.
            </p>
          ) : null}

          <div className="rounded-lg border border-border/40 bg-muted/10 p-3 flex gap-2 text-[10px] text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 text-violet-400 mt-0.5" />
            <span>
              Requires <code className="text-[9px] bg-background/80 px-1 rounded">GEMINI_API_KEY</code> in
              server env. The model is instructed to emit times in America/Chicago with explicit offsets.
            </span>
          </div>

          {lastSummary ? (
            <p className="text-xs text-violet-200/90 leading-relaxed border-l-2 border-violet-500/50 pl-3">
              {lastSummary}
            </p>
          ) : null}

          {upcomingCommand.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                Upcoming command blocks
              </p>
              <ul className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                {upcomingCommand.map((e) => {
                  const s = safeParse(e.startTime);
                  return (
                    <li
                      key={e.id}
                      className={cn(
                        "text-[11px] flex justify-between gap-2 rounded-md border border-violet-500/20 bg-violet-500/5 px-2 py-1.5",
                      )}
                    >
                      <span className="font-medium text-white truncate">{e.title}</span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {s ? format(s, "MMM d h:mm a") : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">No upcoming command blocks yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={calOpen} onOpenChange={setCalOpen}>
        <DialogContent className="max-w-[1200px] w-[95vw] max-h-[92vh] overflow-y-auto border-violet-500/20">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-violet-400" />
              Command Calendar
            </DialogTitle>
            <DialogDescription>
              Drag tasks or blocks to adjust. Edits stay private to your account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Horizon (days)</Label>
              <select
                className="flex h-9 rounded-md border border-border/50 bg-background px-2 text-sm font-bold"
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
              >
                {[3, 5, 7, 10, 14].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Checkbox
                id="cmd-replace-dialog"
                checked={replaceExisting}
                onCheckedChange={(c) => setReplaceExisting(!!c)}
              />
              <Label htmlFor="cmd-replace-dialog" className="text-xs cursor-pointer">
                Replace existing Command blocks in that window
              </Label>
            </div>
            <Button
              type="button"
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
              disabled={aiLoading || myOpenTasks.length === 0}
              onClick={() => void runAiSchedule()}
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate AI blocks
            </Button>
          </div>
          <TaskCalendar
            tasks={myOpenTasks}
            linkedTaskLookup={tasks}
            calendarEvents={scheduleEventsMerged}
            clients={clients}
            projects={projects}
            onAddEvent={onAddEvent}
            onUpdateEvent={onUpdateEvent}
            onDeleteEvent={onDeleteEvent}
            commandCalendarMode
            onOpenTask={
              onViewTask
                ? (taskId) => {
                    const t = tasks.find((x) => x.id === taskId);
                    if (t) onViewTask(t);
                  }
                : undefined
            }
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function safeParse(iso: string): Date | null {
  try {
    const d = parseISO(iso);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

/** Avoid UTC shift from parseISO on YYYY-MM-DD-only strings. */
function localDateFromYmd(ymd: string): Date {
  const parts = ymd.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return startOfDay(new Date());
  return startOfDay(new Date(y, m - 1, d));
}

function buildFallbackSchedule(args: {
  horizonDays: number;
  tasks: Task[];
  busyEvents: CalendarEvent[];
  prepMinutes: number;
}): { blocks: Array<{ taskId: string; title: string; startTime: string; endTime: string; notes: string }>; summary: string } {
  const horizonDays = Math.min(14, Math.max(1, args.horizonDays || 7));
  const startDay = startOfDay(new Date());
  const endDay = endOfDay(addDays(startDay, horizonDays - 1));

  const busyIntervals: Array<{ start: Date; end: Date }> = [];

  for (const e of args.busyEvents) {
    const s = safeParse(e.startTime);
    const en = safeParse(e.endTime);
    if (!s || !en) continue;
    busyIntervals.push({ start: s, end: en });
    // Prep block before meetings (anything that's not a TaskBlock).
    if (e.type !== "TaskBlock") {
      const ps = subMinutes(s, args.prepMinutes);
      busyIntervals.push({ start: ps, end: s });
    }
  }

  const isBusy = (s: Date, e: Date) =>
    busyIntervals.some((b) => s < b.end && e > b.start);

  const blocks: Array<{ taskId: string; title: string; startTime: string; endTime: string; notes: string }> = [];

  // Sort tasks similar to the prompt rules.
  const weight: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  const tasks = [...args.tasks].filter((t) => t.status !== "Completed");
  tasks.sort((a, b) => {
    const ah = !!a.isHardDeadline;
    const bh = !!b.isHardDeadline;
    if (ah !== bh) return ah ? -1 : 1;
    const ad = String(a.deadline || "9999-12-31");
    const bd = String(b.deadline || "9999-12-31");
    if (ad !== bd) return ad.localeCompare(bd);
    const ap = weight[String(a.priority || "Low")] || 0;
    const bp = weight[String(b.priority || "Low")] || 0;
    return bp - ap;
  });

  const step = 15; // minutes

  const scheduleBlock = (title: string, taskId: string, start: Date, mins: number, notes: string) => {
    const end = addMinutes(start, mins);
    blocks.push({
      taskId,
      title,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      notes,
    });
    busyIntervals.push({ start, end });
  };

  // For each day in horizon, allocate admin 1:30-6 and then task work 6pm-4:30am next day.
  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(startDay, i);

    const adminStart = new Date(day);
    adminStart.setHours(13, 30, 0, 0);
    const adminEnd = new Date(day);
    adminEnd.setHours(18, 0, 0, 0);

    // Add a single admin block if free-ish; otherwise skip (meetings may occupy it).
    if (!isBusy(adminStart, adminEnd)) {
      scheduleBlock(
        "Admin focus",
        "",
        adminStart,
        Math.round((adminEnd.getTime() - adminStart.getTime()) / 60000),
        "[Offline schedule fallback] Admin time block",
      );
    }

    let cursor = new Date(day);
    cursor.setHours(18, 0, 0, 0);

    const shiftEnd = addHours(new Date(day), 10); // 18:00 -> 04:00 next day
    shiftEnd.setDate(shiftEnd.getDate() + 1);
    shiftEnd.setHours(4, 30, 0, 0);

    while (cursor < shiftEnd && tasks.length) {
      // Find next free slot.
      while (cursor < shiftEnd && isBusy(cursor, addMinutes(cursor, step))) {
        cursor = addMinutes(cursor, step);
      }
      if (cursor >= shiftEnd) break;

      const task = tasks[0];
      const remainingHours = Math.max(0.5, Number(task.estimatedHours || 1));
      const desiredMins = Math.min(240, Math.max(30, Math.round(remainingHours * 60)));
      let mins = desiredMins;

      // Shrink until it fits or min 30.
      while (mins >= 30 && (addMinutes(cursor, mins) > shiftEnd || isBusy(cursor, addMinutes(cursor, mins)))) {
        mins -= step;
      }
      if (mins < 30) {
        cursor = addMinutes(cursor, step);
        continue;
      }

      scheduleBlock(
        `Focus: ${task.name || task.description || "Task"}`.slice(0, 120),
        task.id,
        cursor,
        mins,
        "[Offline schedule fallback] Generated due to Gemini timeout",
      );

      // Reduce remaining estimate; if mostly done, pop.
      const usedHrs = mins / 60;
      const newRemaining = remainingHours - usedHrs;
      if (newRemaining <= 0.25) tasks.shift();
      else (tasks[0] as any) = { ...task, estimatedHours: newRemaining };

      cursor = addMinutes(cursor, mins);
    }
  }

  // Filter to horizon window.
  const inWindow = blocks.filter((b) => {
    const s = safeParse(b.startTime);
    return !!s && s >= startDay && s <= endDay;
  });

  return {
    blocks: inWindow,
    summary:
      "Gemini timed out, so Ledger used an offline fallback scheduler: admin block early, then focus blocks after 6 PM, avoiding meetings and adding 30-minute prep time. You can drag/edit anything in Command Calendar.",
  };
}
