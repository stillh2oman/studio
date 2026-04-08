
"use client"

import { useState, useRef, useEffect, useMemo } from 'react';
import { Message, Employee, Attachment } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, User, Users, Paperclip, X, Clock, Mail, MailOpen, Trash2, FileText, CheckCircle2, Bell, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

function isUnreadForUser(msg: Message, currentUserId: string): boolean {
  if (msg.recipientId === 'all') {
    return !msg.readBy?.[currentUserId];
  }
  return !msg.readAt;
}

interface MessageAreaProps {
  inbox: Message[];
  outbox: Message[];
  employees: Employee[];
  currentUserId: string;
  onSendMessage: (msg: Omit<Message, 'id' | 'sentAt' | 'senderId' | 'senderName'>) => void;
  onMarkRead: (messageId: string, recipientId: string) => void;
  onDeleteMessage: (messageId: string, type: 'inbox' | 'outbox') => void;
}

export function MessageArea({ inbox = [], outbox = [], employees = [], currentUserId, onSendMessage, onMarkRead, onDeleteMessage }: MessageAreaProps) {
  const { toast } = useToast();
  const [recipientId, setRecipientId] = useState<string>('all');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    
    if (permission === 'granted') {
      toast({ title: "Notifications Enabled", description: "You will now receive popups for new messages." });
    } else {
      toast({ variant: "destructive", title: "Notifications Blocked", description: "Please enable them in your browser settings to receive popups." });
    }
  };

  const eligibleRecipients = useMemo(() => {
    return employees
      .filter(e => {
        const fullName = `${e.firstName}${e.lastName}`.toLowerCase().replace(/\s+/g, '');
        return !fullName.includes('tammidillon') && e.id !== currentUserId;
      })
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [employees, currentUserId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && attachments.length === 0) return;

    onSendMessage({
      recipientId,
      content,
      attachments
    });

    toast({ title: 'Message sent', description: 'Check the Sent tab to confirm delivery and read status.' });

    setContent('');
    setAttachments([]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const newAttachment: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        type: file.type,
        url: dataUrl
      };
      setAttachments(prev => [...prev, newAttachment]);
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  return (
    <Card className="border-border/50 shadow-2xl bg-card/20 overflow-hidden h-[500px] flex flex-col">
      <CardHeader className="bg-muted/30 py-3 flex flex-row items-center justify-between border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-headline uppercase tracking-widest">Firm Chat</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {notificationPermission !== 'granted' && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-accent animate-pulse" 
              onClick={requestNotificationPermission}
              title="Enable Desktop Notifications"
            >
              <BellOff className="h-4 w-4" />
            </Button>
          )}
          {notificationPermission === 'granted' && (
            <div className="h-8 w-8 flex items-center justify-center text-emerald-500" title="Notifications Active">
              <Bell className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardHeader>

      <Tabs defaultValue="inbox" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-1.5 border-b border-border/50 bg-muted/10 shrink-0">
          <TabsList className="grid w-full grid-cols-3 bg-background/50 h-8">
            <TabsTrigger value="inbox" className="text-[9px] uppercase font-black gap-1.5 px-0">
              Inbox {inbox.filter(m => isUnreadForUser(m, currentUserId)).length > 0 && `(${inbox.filter(m => isUnreadForUser(m, currentUserId)).length})`}
            </TabsTrigger>
            <TabsTrigger value="send" className="text-[9px] uppercase font-black gap-1.5 px-0">Compose</TabsTrigger>
            <TabsTrigger value="outbox" className="text-[9px] uppercase font-black gap-1.5 px-0">Sent</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="inbox" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {inbox.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
                  <Mail className="h-8 w-8 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">Clear Inbox</p>
                </div>
              ) : (
                inbox.map(msg => (
                  <div 
                    key={msg.id} 
                    onClick={() => isUnreadForUser(msg, currentUserId) && onMarkRead(msg.id, msg.recipientId)}
                    className={cn(
                      "p-3 rounded-xl border transition-all cursor-pointer group relative",
                      isUnreadForUser(msg, currentUserId) ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10 shadow-lg" : "bg-muted/10 border-border/30 opacity-70"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-white truncate max-w-[100px]">{msg.senderName}</span>
                        {msg.recipientId === 'all' && (
                          <Badge variant="outline" className="text-[7px] h-3.5 uppercase bg-accent/5 text-accent border-accent/20 px-1 py-0">Global</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] text-muted-foreground font-mono">{format(new Date(msg.sentAt), 'MMM d, h:mm a')}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-rose-500 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); onDeleteMessage(msg.id, 'inbox'); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">{msg.content}</p>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/20">
                        {msg.attachments.map(a => (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-background/50 px-1.5 py-0.5 rounded text-[8px] text-muted-foreground hover:text-white transition-colors">
                            <FileText className="h-2 w-2 text-primary" /> {a.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="send" className="flex-1 overflow-hidden m-0 flex flex-col p-4 space-y-4">
          <form onSubmit={handleSend} className="space-y-4 flex-1 flex flex-col">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <Label className="text-[9px] uppercase font-black text-muted-foreground">To:</Label>
                <select 
                  className="w-full h-8 rounded-lg border border-border bg-background px-2 text-[11px] font-bold focus:ring-2 focus:ring-primary outline-none"
                  value={recipientId}
                  onChange={e => setRecipientId(e.target.value)}
                >
                  <option value="all">ALL USERS (Excl. Tammi)</option>
                  {eligibleRecipients.map(e => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                  ))}
                </select>
              </div>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-8 gap-1.5 text-[10px] font-black border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3 w-3" /> {attachments.length > 0 ? `${attachments.length} Files` : 'Attach'}
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            </div>

            <div className="flex-1 flex flex-col space-y-1">
              <Label className="text-[9px] uppercase font-black text-muted-foreground">Message:</Label>
              <Textarea 
                value={content} 
                onChange={e => setContent(e.target.value)} 
                placeholder="Type a message..."
                className="flex-1 resize-none bg-background/50 border-border/50 text-xs p-2"
              />
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-1 py-1">
                {attachments.map(a => (
                  <Badge key={a.id} variant="secondary" className="gap-1 pl-1.5 pr-0.5 h-5 text-[8px]">
                    <span className="truncate max-w-[80px]">{a.name}</span>
                    <button type="button" onClick={() => removeAttachment(a.id)} className="hover:bg-rose-500 hover:text-white rounded-full p-0.5"><X className="h-2 w-2" /></button>
                  </Badge>
                ))}
              </div>
            )}

            <Button type="submit" className="w-full h-10 gap-2 text-xs font-black shadow-lg" disabled={!content.trim() && attachments.length === 0}>
              <Send className="h-3.5 w-3.5" /> Send Message
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="outbox" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {outbox.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
                  <Send className="h-8 w-8 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">No Sent Items</p>
                </div>
              ) : (
                outbox.map(msg => {
                  const recipient = msg.recipientId === 'all'
                    ? 'All Users (excl. Tammi)'
                    : (() => {
                        const e = employees.find(x => x.id === msg.recipientId);
                        return e ? `${e.firstName} ${e.lastName}` : 'Unknown';
                      })();
                  const readByCount = msg.readBy ? Object.keys(msg.readBy).length : 0;
                  const readReceiptLabel =
                    msg.recipientId === 'all'
                      ? readByCount > 0
                        ? `Read by ${readByCount} teammate${readByCount === 1 ? '' : 's'}`
                        : msg.readAt
                          ? `Opened · ${format(new Date(msg.readAt), 'MMM d, h:mm a')} (older messages: single timestamp only)`
                          : 'Not opened by anyone yet'
                      : msg.readAt
                        ? `Read · ${format(new Date(msg.readAt), 'MMM d, h:mm a')}`
                        : 'Unread by recipient';

                  return (
                    <div key={msg.id} className="p-3 rounded-xl border border-border/30 bg-muted/5 group relative">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] text-muted-foreground uppercase font-black tracking-widest">To:</span>
                          <span className="text-[10px] font-black text-accent">{recipient}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-muted-foreground font-mono">{format(new Date(msg.sentAt), 'MMM d, h:mm a')}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-rose-500 opacity-0 group-hover:opacity-100" onClick={() => onDeleteMessage(msg.id, 'outbox')}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <CheckCircle2 className={cn('h-3 w-3 shrink-0', msg.recipientId === 'all' ? (readByCount > 0 ? 'text-emerald-500' : 'text-muted-foreground') : msg.readAt ? 'text-emerald-500' : 'text-muted-foreground')} />
                        <span className="text-[9px] text-muted-foreground font-medium">{readReceiptLabel}</span>
                      </div>
                      {msg.recipientId === 'all' && readByCount > 0 && msg.readBy && (
                        <p className="text-[8px] text-muted-foreground/90 mb-1.5 leading-relaxed">
                          {Object.keys(msg.readBy)
                            .map((id) => employees.find((e) => e.id === id))
                            .filter(Boolean)
                            .slice(0, 4)
                            .map((e) => `${e!.firstName}`)
                            .join(', ')}
                          {readByCount > 4 ? ` +${readByCount - 4}` : ''}
                        </p>
                      )}
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap">{msg.content}</p>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/20">
                          {msg.attachments.map(a => (
                            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-background/50 px-1.5 py-0.5 rounded text-[8px] text-muted-foreground hover:text-white transition-colors">
                              <FileText className="h-2 w-2 text-primary" /> {a.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
