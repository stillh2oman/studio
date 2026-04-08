
"use client"

import { useState, useMemo, use } from 'react';
import { useDoc, useMemoFirebase, useFirestore } from '@/firebase';
import { Task, TaskStatus, Comment } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Clock, MessageSquare, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const STATUSES: TaskStatus[] = ["Assigned", "Completed", "In Progress", "Need Review", "Unassigned"];

export default function SharedTaskPage({ params }: { params: Promise<{ userId: string, taskId: string }> }) {
  const { userId, taskId } = use(params);
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const taskRef = useMemoFirebase(() => 
    doc(firestore, 'employees', userId, 'tasks', taskId)
  , [firestore, userId, taskId]);

  const { data: task, isLoading } = useDoc<Task>(taskRef);
  const [newComment, setNewComment] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateStatus = async (newStatus: TaskStatus) => {
    if (!task) return;
    setIsUpdating(true);
    try {
      await updateDoc(taskRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      toast({ title: "Status Updated", description: `Task is now ${newStatus}` });
    } catch (e) {
      toast({ variant: "destructive", title: "Update Failed", description: "You might not have permission." });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleSubTask = async (subTaskId: string, completed: boolean) => {
    if (!task) return;
    setIsUpdating(true);
    try {
      const newSubTasks = task.subTasks.map(st => st.id === subTaskId ? { ...st, completed } : st);
      await updateDoc(taskRef, {
        subTasks: newSubTasks,
        updatedAt: new Date().toISOString()
      });
      toast({ title: "Checklist Updated" });
    } catch (e) {
      toast({ variant: "destructive", title: "Update Failed" });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddComment = async () => {
    if (!task || !newComment.trim()) return;
    setIsUpdating(true);
    try {
      const comment: Comment = {
        userName: "Collaborator",
        text: newComment,
        timestamp: new Date().toISOString()
      };
      await updateDoc(taskRef, {
        comments: [...(task.comments || []), comment],
        updatedAt: new Date().toISOString()
      });
      setNewComment('');
      toast({ title: "Comment Added" });
    } catch (e) {
      toast({ variant: "destructive", title: "Post Failed", description: "You might not have permission." });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!task || !task.shared) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-rose-500/20 bg-rose-500/5">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-rose-500 mx-auto mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              This task is either not shared or does not exist. Please contact the project owner for a valid link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-headline font-bold text-white">Task Assignment</h1>
            <Badge className={cn(
              "text-sm px-4 py-1",
              task.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-sky-500/10 text-sky-500 border-sky-500/20'
            )}>
              {task.status}
            </Badge>
          </div>
          <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
            <CardContent className="pt-6">
              <p className="text-xl leading-relaxed text-foreground/90">{task.description}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Priority</span>
                  <p className="font-bold text-accent">{task.priority}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Deadline</span>
                  <p className="font-bold">{task.deadline}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Category</span>
                  <p className="font-bold">{task.category}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Last Activity</span>
                  <p className="text-xs text-muted-foreground">{new Date(task.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </header>

        {task.subTasks?.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-headline font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Task Checklist
              </h2>
              <Badge variant="secondary" className="text-[10px]">
                {task.subTasks.filter(s => s.completed).length} / {task.subTasks.length} DONE
              </Badge>
            </div>
            <Card className="border-border/50 bg-card/20">
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {task.subTasks.map(st => (
                  <div key={st.id} className="flex items-start gap-3 p-3 rounded-xl bg-background/40 border border-border/50 transition-all hover:border-primary/30">
                    <Checkbox 
                      checked={st.completed} 
                      onCheckedChange={(checked) => handleToggleSubTask(st.id, !!checked)}
                      disabled={isUpdating}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <span className={cn("text-sm transition-all", st.completed ? 'line-through text-muted-foreground' : 'text-white font-medium')}>
                        {st.text}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="md:col-span-1 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Update Status</CardTitle>
              <CardDescription>Keep the owner informed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {STATUSES.map(s => (
                <Button
                  key={s}
                  variant={task.status === s ? "default" : "outline"}
                  className="w-full justify-start gap-2 h-11"
                  onClick={() => handleUpdateStatus(s)}
                  disabled={isUpdating}
                >
                  {task.status === s && <CheckCircle2 className="h-4 w-4" />}
                  {s}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Discussion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                {task.comments?.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm italic py-4">No comments yet.</p>
                ) : (
                  task.comments?.map((c, i) => (
                    <div key={i} className="bg-muted/30 p-4 rounded-xl space-y-2 border border-border/50">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-accent">{c.userName}</span>
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {new Date(c.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{c.text}</p>
                    </div>
                  ))
                )}
              </div>
              
              <Separator />
              
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Add a message</Label>
                  <Textarea 
                    value={newComment} 
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Ask a question or provide an update..."
                    className="h-24"
                  />
                </div>
                <Button 
                  className="w-full gap-2" 
                  onClick={handleAddComment} 
                  disabled={isUpdating || !newComment.trim()}
                >
                  <Send className="h-4 w-4" />
                  Send Message
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="text-center pt-8">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Designer's Ink Task Command</p>
        </footer>
      </div>
    </div>
  );
}
