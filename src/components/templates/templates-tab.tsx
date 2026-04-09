
"use client"

import { useState, useMemo } from 'react';
import { TemplateChangeRequest, Employee, Priority, TemplateRequestStatus } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Pencil, Trash2, Plus, Calendar, Shield, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

type SortConfig = { key: keyof TemplateChangeRequest; direction: 'asc' | 'desc' } | null;

interface TemplatesTabProps {
  requests: TemplateChangeRequest[];
  onAddRequest: (request: Omit<TemplateChangeRequest, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateRequest: (id: string, request: Partial<TemplateChangeRequest>) => void;
  onDeleteRequest: (id: string) => void;
  canEdit?: boolean;
}

const EMPLOYEES: Employee[] = ["Chris Fleming", "Jeff Dillon", "Jorrie Holly", "Kevin Walthall", "Sarah VandeBurgh"];
const PRIORITIES: Priority[] = ["High", "Low", "Medium"];
const STATUSES: TemplateRequestStatus[] = ["Completed", "Not Completed"];

export function TemplatesTab({ requests, onAddRequest, onUpdateRequest, onDeleteRequest, canEdit = true }: TemplatesTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  // Form State
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState<Employee>('Jeff Dillon');
  const [status, setStatus] = useState<TemplateRequestStatus>('Not Completed');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dateRequested, setDateRequested] = useState(new Date().toISOString().split('T')[0]);
  const [templateName, setTemplateName] = useState('');
  const [notes, setNotes] = useState('');

  const sortedRequests = useMemo(() => {
    let items = [...requests];
    if (sortConfig) {
      items.sort((a, b) => {
        const aVal = String(a[sortConfig.key] || '');
        const bVal = String(b[sortConfig.key] || '');
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [requests, sortConfig]);

  const handleSort = (key: keyof TemplateChangeRequest) => {
    setSortConfig(prev => (prev?.key === key && prev.direction === 'asc') ? { key, direction: 'desc' } : { key, direction: 'asc' });
  };

  const SortIcon = ({ column }: { column: keyof TemplateChangeRequest }) => {
    if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !title || !templateName) return;

    const requestData = {
      title,
      assignedTo,
      status,
      priority,
      dateRequested,
      templateName,
      notes,
    };

    if (editingId) {
      onUpdateRequest(editingId, requestData);
    } else {
      onAddRequest(requestData);
    }

    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setAssignedTo('Jeff Dillon');
    setStatus('Not Completed');
    setPriority('Medium');
    setDateRequested(new Date().toISOString().split('T')[0]);
    setTemplateName('');
    setNotes('');
  };

  const handleEdit = (request: TemplateChangeRequest) => {
    if (!canEdit) return;
    setEditingId(request.id);
    setTitle(request.title);
    setAssignedTo(request.assignedTo);
    setStatus(request.status);
    setPriority(request.priority);
    setDateRequested(request.dateRequested);
    setTemplateName(request.templateName);
    setNotes(request.notes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getPriorityColor = (p: Priority) => {
    switch (p) {
      case 'High': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'Medium': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    }
  };

  const getStatusColor = (s: TemplateRequestStatus) => {
    switch (s) {
      case 'Completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Alert className="bg-muted/30 border-dashed border-border/50">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <AlertTitle>Read-Only Access</AlertTitle>
          <div className="text-xs text-muted-foreground">You can view template requests, but modification is restricted.</div>
        </Alert>
      )}

      {canEdit && (
        <Card className="border-border/50 shadow-xl overflow-hidden">
          <CardHeader className="bg-muted/50">
            <CardTitle className="font-headline text-3xl text-accent flex justify-between items-center">
              {editingId ? 'Edit Request' : 'Template & App Change Requests'}
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm} className="text-muted-foreground">Cancel</Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2 lg:col-span-2">
                <Label>Request Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Update Foundation Layering or Add New Dashboard Filter" required />
              </div>

              <div className="space-y-2">
                <Label>Target (Template or App Feature)</Label>
                <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g., Residential-Modern-V2, Timesheets, PlanPort, Inbox" required />
              </div>

              <div className="space-y-2">
                <Label>Assigned To</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value as Employee)}
                >
                  {EMPLOYEES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={status}
                  onChange={e => setStatus(e.target.value as TemplateRequestStatus)}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={priority}
                  onChange={e => setPriority(e.target.value as Priority)}
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Date Requested</Label>
                <Input type="date" value={dateRequested} onChange={e => setDateRequested(e.target.value)} required />
              </div>

              <div className="space-y-2 lg:col-span-3">
                <Label>Request Notes & Details</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the requested change (what to change, why, and expected result)." className="h-24" />
              </div>

              <div className="lg:col-span-3 flex justify-end">
                <Button type="submit" className="bg-primary hover:bg-primary/90 px-8 h-11 gap-2">
                  {editingId ? <><Pencil className="h-4 w-4" /> Update Request</> : <><Plus className="h-4 w-4" /> Log Request</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 shadow-lg overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('dateRequested')}>
                  <div className="flex items-center">Date <SortIcon column="dateRequested" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('title')}>
                  <div className="flex items-center">Title <SortIcon column="title" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('templateName')}>
                  <div className="flex items-center">Template <SortIcon column="templateName" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('assignedTo')}>
                  <div className="flex items-center">Assigned To <SortIcon column="assignedTo" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('priority')}>
                  <div className="flex items-center">Priority <SortIcon column="priority" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/80" onClick={() => handleSort('status')}>
                  <div className="flex items-center">Status <SortIcon column="status" /></div>
                </TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">No template requests logged yet.</TableCell>
                </TableRow>
              ) : (
                sortedRequests.map(request => (
                  <TableRow key={request.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {request.dateRequested}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-sm">{request.title}</div>
                      <div className="text-[10px] text-muted-foreground max-w-xs truncate">{request.notes}</div>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-accent">{request.templateName}</TableCell>
                    <TableCell className="text-sm">{request.assignedTo}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPriorityColor(request.priority)}>{request.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(request.status)}>{request.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8" 
                          onClick={() => handleEdit(request)}
                          disabled={!canEdit}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-rose-500" 
                          onClick={() => onDeleteRequest(request.id)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
