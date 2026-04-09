
"use client"

import { useState, useMemo } from 'react';
import {
  TemplateChangeRequest,
  FirmTemplateDownload,
  Employee,
  Priority,
  TemplateRequestStatus,
} from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle } from '@/components/ui/alert';
import {
  Pencil,
  Trash2,
  Plus,
  Calendar,
  Shield,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Download,
  ExternalLink,
} from 'lucide-react';
import { formatDropboxUrl } from '@/lib/utils';

type SortConfig = { key: keyof TemplateChangeRequest; direction: 'asc' | 'desc' } | null;

interface TemplatesTabProps {
  requests: TemplateChangeRequest[];
  onAddRequest: (request: Omit<TemplateChangeRequest, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateRequest: (id: string, request: Partial<TemplateChangeRequest>) => void;
  onDeleteRequest: (id: string) => void;
  firmTemplateDownloads: FirmTemplateDownload[];
  onAddFirmTemplateDownload: (
    row: Omit<FirmTemplateDownload, 'id' | 'createdAt' | 'updatedAt'>,
  ) => void;
  onUpdateFirmTemplateDownload: (id: string, row: Partial<FirmTemplateDownload>) => void;
  onDeleteFirmTemplateDownload: (id: string) => void;
  canEdit?: boolean;
}

function normalizeDownloadUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function looksLikeDropboxUrl(url: string): boolean {
  return /dropbox\.com|dropboxusercontent\.com/i.test(url);
}

function downloadHref(stored: string): string {
  const normalized = normalizeDownloadUrl(stored);
  return formatDropboxUrl(normalized) || normalized;
}

const EMPLOYEES: Employee[] = ["Chris Fleming", "Jeff Dillon", "Jorrie Holly", "Kevin Walthall", "Sarah VandeBurgh"];
const PRIORITIES: Priority[] = ["High", "Low", "Medium"];
const STATUSES: TemplateRequestStatus[] = ["Completed", "Not Completed"];

export function TemplatesTab({
  requests,
  onAddRequest,
  onUpdateRequest,
  onDeleteRequest,
  firmTemplateDownloads,
  onAddFirmTemplateDownload,
  onUpdateFirmTemplateDownload,
  onDeleteFirmTemplateDownload,
  canEdit = true,
}: TemplatesTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const [dlEditingId, setDlEditingId] = useState<string | null>(null);
  const [dlTitle, setDlTitle] = useState('');
  const [dlUrl, setDlUrl] = useState('');
  const [dlDescription, setDlDescription] = useState('');
  const [dlSortOrder, setDlSortOrder] = useState('');
  
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

  const resetDlForm = () => {
    setDlEditingId(null);
    setDlTitle('');
    setDlUrl('');
    setDlDescription('');
    setDlSortOrder('');
  };

  const handleDlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !dlTitle.trim()) return;
    const url = normalizeDownloadUrl(dlUrl);
    if (!url || !looksLikeDropboxUrl(url)) return;

    const sortOrderParsed = dlSortOrder.trim() === '' ? 0 : Number(dlSortOrder);
    const sortOrder = Number.isFinite(sortOrderParsed) ? sortOrderParsed : 0;

    const payload = {
      title: dlTitle.trim(),
      dropboxUrl: url,
      description: dlDescription.trim(),
      sortOrder,
    };

    if (dlEditingId) {
      onUpdateFirmTemplateDownload(dlEditingId, payload);
    } else {
      onAddFirmTemplateDownload(payload);
    }
    resetDlForm();
  };

  const handleDlEdit = (row: FirmTemplateDownload) => {
    if (!canEdit) return;
    setDlEditingId(row.id);
    setDlTitle(row.title);
    setDlUrl(row.dropboxUrl);
    setDlDescription(row.description || '');
    setDlSortOrder(row.sortOrder !== undefined && row.sortOrder !== 0 ? String(row.sortOrder) : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg overflow-hidden">
        <CardHeader className="bg-muted/50">
          <CardTitle className="font-headline text-2xl text-accent flex items-center gap-2">
            <Download className="h-6 w-6" />
            Template downloads (Dropbox)
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Shared links to plan or office templates. Paste a Dropbox share URL; everyone on the team can open or
            download from here.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {canEdit && (
            <form onSubmit={handleDlSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="space-y-2 lg:col-span-2">
                <Label>Title</Label>
                <Input
                  value={dlTitle}
                  onChange={(e) => setDlTitle(e.target.value)}
                  placeholder="e.g. Residential title block CAD"
                  required
                />
              </div>
              <div className="space-y-2 lg:col-span-3">
                <Label>Dropbox link</Label>
                <Input
                  value={dlUrl}
                  onChange={(e) => setDlUrl(e.target.value)}
                  placeholder="https://www.dropbox.com/s/… or https://www.dropbox.com/scl/fi/…"
                  required
                />
              </div>
              <div className="space-y-2 lg:col-span-1">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={dlSortOrder}
                  onChange={(e) => setDlSortOrder(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2 lg:col-span-6">
                <Label>Description (optional)</Label>
                <Textarea
                  value={dlDescription}
                  onChange={(e) => setDlDescription(e.target.value)}
                  placeholder="What this file is for, version, or who should use it."
                  className="min-h-[72px] resize-y"
                />
              </div>
              <div className="lg:col-span-6 flex flex-wrap justify-end gap-2">
                {dlEditingId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={resetDlForm} className="text-muted-foreground">
                    Cancel
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 gap-2"
                  disabled={!dlTitle.trim() || !normalizeDownloadUrl(dlUrl) || !looksLikeDropboxUrl(normalizeDownloadUrl(dlUrl))}
                >
                  {dlEditingId ? (
                    <>
                      <Pencil className="h-4 w-4" /> Update link
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" /> Add download
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead className="w-[140px] text-right">Download</TableHead>
                  {canEdit ? <TableHead className="w-24" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {firmTemplateDownloads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 4 : 3} className="text-center h-20 text-muted-foreground text-sm">
                      {canEdit
                        ? 'No shared templates yet. Add a Dropbox link above.'
                        : 'No shared templates have been published yet.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  firmTemplateDownloads.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-semibold text-sm">{row.title}</div>
                        <div className="text-[10px] text-muted-foreground md:hidden mt-1 line-clamp-2">
                          {row.description || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-md">
                        {row.description || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="gap-1.5" asChild>
                          <a href={downloadHref(row.dropboxUrl)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </a>
                        </Button>
                      </TableCell>
                      {canEdit ? (
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDlEdit(row)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-500"
                              onClick={() => onDeleteFirmTemplateDownload(row.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {!canEdit && (
        <Alert className="bg-muted/30 border-dashed border-border/50">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <AlertTitle>Read-Only Access</AlertTitle>
          <div className="text-xs text-muted-foreground">
            You can view shared template links and change requests; adding or editing is restricted.
          </div>
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
