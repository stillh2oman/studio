
"use client"

import { useState, useMemo } from 'react';
import { Client, Project } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Share2, Users, Building2, Copy, Plus, Trash2, Globe, ShieldCheck, CheckCircle2, Search, X, Loader2, Archive, Eye, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface PlanPortManagementTabProps {
  clients: Client[];
  projects: Project[];
}

export function PlanPortManagementTab({ clients, projects }: PlanPortManagementTabProps) {
  const { toast } = useToast();
  const { updateProject, updateClient, syncAllPortalCodes } = useLedgerData();
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Client | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/planport?code=${code}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Portal Link Copied", description: `Access code ${code} link is ready to share.` });
  };

  const handleViewLive = (code: string) => {
    window.open(`/planport?code=${code}`, '_blank');
  };

  const handleImportProject = (projectId: string) => {
    if (!selectedAccount) return;
    
    const isContractor = !!selectedAccount.isContractor;
    const update: any = isContractor 
      ? { contractorId: selectedAccount.id, constructionCompany: selectedAccount.name }
      : { clientId: selectedAccount.id };

    updateProject(projectId, update);
    toast({ 
      title: "Project Imported", 
      description: `Project has been added to ${selectedAccount.name}'s PlanPort.` 
    });
  };

  const handleRemoveProject = (projectId: string, accountId: string, isContractor: boolean) => {
    const update: any = isContractor 
      ? { contractorId: '', constructionCompany: '' }
      : { clientId: '' }; // Note: Removing a client unlinks the project entirely

    updateProject(projectId, update);
    toast({ title: "Visibility Revoked", description: "Project removed from partner portal." });
  };

  const handleReSync = async () => {
    setIsSyncing(true);
    try {
      await syncAllPortalCodes();
      toast({ title: "Global Sync Complete", description: "Registry has been fully reconstructed." });
    } catch (err) {
      toast({ variant: "destructive", title: "Sync Failed" });
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    return clients.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.accessCode?.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, searchQuery]);

  const getVisibleProjects = (accountId: string, isContractor: boolean) => {
    return projects.filter(p => isContractor ? p.contractorId === accountId : p.clientId === accountId);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card/30 p-8 rounded-3xl border border-border/50 gap-6 shadow-2xl">
        <div className="space-y-1">
          <h2 className="text-4xl font-headline font-bold text-white flex items-center gap-3">
            <Share2 className="h-10 w-10 text-primary" /> PlanPort Command
          </h2>
          <p className="text-muted-foreground text-sm uppercase tracking-widest font-semibold">External Partner Portal Management</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search accounts..." 
              className="pl-10 h-12 bg-background/50 border-border/50" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" className="h-12 border-primary/20 text-primary gap-2 font-bold" onClick={handleReSync} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync Codes
          </Button>
        </div>
      </header>

      <Card className="border-border/50 bg-card/30 shadow-xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Partner Account</TableHead>
                <TableHead>Access Code</TableHead>
                <TableHead>Visible Projects</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic">No accounts found in registry.</TableCell>
                </TableRow>
              ) : (
                filteredAccounts.map(account => {
                  const isContractor = !!account.isContractor;
                  const visibleProjects = getVisibleProjects(account.id, isContractor);
                  
                  return (
                    <TableRow key={account.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="text-center">
                        {isContractor ? <Building2 className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4 text-accent" />}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-white">{account.name}</div>
                        <div className="text-[10px] uppercase font-black text-muted-foreground tracking-tighter">
                          {isContractor ? 'Builder Partner' : 'Private Client'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.accessCode ? (
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-primary font-black tracking-widest text-xs border border-primary/10">
                              {account.accessCode}
                            </code>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyLink(account.accessCode!)} title="Copy Link">
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[8px] opacity-50">PORTAL DISABLED</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {visibleProjects.map(p => (
                            <Badge key={p.id} variant="secondary" className="h-5 px-2 text-[9px] gap-1.5 bg-background/50 border-border/50 group/item">
                              <span className="max-w-[120px] truncate">{p.name}</span>
                              <button onClick={() => handleRemoveProject(p.id, account.id, isContractor)} className="text-rose-500 hover:text-rose-400">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          ))}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-5 px-2 text-[9px] font-black uppercase text-primary border border-dashed border-primary/30 hover:bg-primary/5"
                            onClick={() => { setSelectedAccount(account); setIsImportOpen(true); }}
                          >
                            <Plus className="h-2.5 w-2.5 mr-1" /> Import
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {account.accessCode && (
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[10px] font-bold" onClick={() => handleViewLive(account.accessCode!)}>
                              <Eye className="h-3.5 w-3.5" /> VIEW
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyLink(account.accessCode || '')} disabled={!account.accessCode}>
                            <Share2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Import to {selectedAccount?.name}
            </DialogTitle>
            <DialogDescription>
              Select an existing project to share with this {selectedAccount?.isContractor ? 'Contractor' : 'Client'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <ScrollArea className="h-[300px] border border-border/50 rounded-xl bg-background/50">
              <div className="divide-y divide-border/30">
                {projects.sort((a, b) => a.name.localeCompare(b.name)).map(project => {
                  const selectedAccountId = selectedAccount?.id || '';
                  const isAssigned = selectedAccount?.isContractor 
                    ? project.contractorId === selectedAccountId
                    : project.clientId === selectedAccountId;

                  return (
                    <div key={project.id} className="p-3 flex items-center justify-between group hover:bg-primary/5 transition-colors">
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-white group-hover:text-primary flex items-center gap-2">
                          {project.name}
                          {project.status === 'Archived' && <Badge variant="outline" className="text-[7px] border-muted-foreground/30 text-muted-foreground">ARCHIVED</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">{project.address || 'Site Assignment'}</p>
                      </div>
                      {isAssigned ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-black uppercase">
                          <CheckCircle2 className="h-3 w-3" /> Live
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 text-[9px] font-black uppercase border-primary/30 text-primary hover:bg-primary hover:text-white"
                          onClick={() => handleImportProject(project.id)}
                        >
                          IMPORT
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportOpen(false)}>Finished</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
