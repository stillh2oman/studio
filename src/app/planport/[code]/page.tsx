
"use client"

import { use, useState, useEffect, useMemo } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { IntegrationConfig, Project, CloudFile, Client, Employee } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { 
  Loader2, FileText, Download, Clock, MapPin, Building2, 
  ChevronRight, ArrowLeft, ShieldCheck, History, ExternalLink, 
  Search, Grid, List as ListIcon, Share2, Mail
} from 'lucide-react';
import { fetchProjectBlueprints, getDropboxDownloadLink } from '@/services/dropbox-api';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { sendEmail } from '@/services/resend-service';

export default function PlanPortViewer({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [identity, setIdentity] = useState<{ name: string; type: 'client' | 'contractor'; firmId: string; accountId: string } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [firmEmployees, setFirmEmployees] = useState<Employee[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<{ latest: CloudFile[], archives: CloudFile[] }>({ latest: [], archives: [] });
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [messageEmail, setMessageEmail] = useState('');
  const [messageText, setMessageText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const appLogoUrl = "/logo.png";

  useEffect(() => {
    const verifyAccess = async () => {
      try {
        // Step 1: Resolve Code from Global Registry
        const portalRef = doc(firestore, 'portals', code.toUpperCase());
        const portalSnap = await getDoc(portalRef);

        if (!portalSnap.exists()) {
          window.location.href = '/planport';
          return;
        }

        const { firmId, accountId, accountType } = portalSnap.data() as { firmId: string; accountId: string; accountType?: 'client' | 'contractor' };

        // Step 2: Load Account Details from Firm Ledger
        const primaryCollection = accountType === 'contractor' ? 'contractors' : 'clients';
        let accountSnap = await getDoc(doc(firestore, 'employees', firmId, primaryCollection, accountId));
        if (!accountSnap.exists()) {
          // Back-compat fallback if portal record lacks accountType.
          const fallbackCollection = primaryCollection === 'clients' ? 'contractors' : 'clients';
          accountSnap = await getDoc(doc(firestore, 'employees', firmId, fallbackCollection, accountId));
          if (!accountSnap.exists()) {
            window.location.href = '/planport';
            return;
          }
        }

        const accountData = accountSnap.data() as any;
        const targetType = accountType === 'contractor' || accountData.isContractor ? 'contractor' : 'client';
        
        setIdentity({ 
          name: String(accountData.name || accountData.companyName || 'Account'),
          type: targetType as any, 
          firmId,
          accountId
        });

        // Step 2.5: Load firm employee directory (to resolve lead designer email)
        try {
          const staffRef = collection(firestore, 'employees');
          const staffQ = query(staffRef, where('bossId', '==', firmId));
          const staffSnap = await getDocs(staffQ);
          const staff = staffSnap.docs.map(d => ({ ...(d.data() as any), id: d.id } as Employee));

          const bossSnap = await getDoc(doc(firestore, 'employees', firmId));
          const boss = bossSnap.exists() ? ({ ...(bossSnap.data() as any), id: bossSnap.id } as Employee) : null;

          const combined = [...staff];
          if (boss && !combined.find(e => e.id === boss.id)) combined.push(boss);
          setFirmEmployees(combined);
        } catch (e) {
          setFirmEmployees([]);
        }

        // Step 3: Load Associated Projects
        const projectsRef = collection(firestore, 'employees', firmId, 'projects');
        const field = targetType === 'contractor' ? 'contractorId' : 'clientId';
        const projectsQ = query(projectsRef, where(field, '==', accountId));
        const projectsSnap = await getDocs(projectsQ);
        
        const projectsList = projectsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Project));
        setProjects(projectsList);

        // Step 4: Load Integration Config
        const configSnap = await getDoc(doc(firestore, 'employees', firmId, 'config', 'integrations'));
        if (configSnap.exists()) setConfig(configSnap.data() as IntegrationConfig);

        if (projectsList.length === 1) {
          setSelectedProjectId(projectsList[0].id);
        }

      } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Gateway Error", description: "Could not establish secure link." });
      } finally {
        setIsVerifying(false);
      }
    };

    verifyAccess();
  }, [code, firestore, toast]);

  useEffect(() => {
    if (!selectedProjectId || !config || !identity) return;

    const loadFiles = async () => {
      setIsFetchingFiles(true);
      const project = projects.find(p => p.id === selectedProjectId);
      if (!project) return;

      try {
        const data = await fetchProjectBlueprints(config, project.name);
        setFiles(data);
      } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Link Error", description: "Could not establish a secure link to Dropbox." });
      } finally {
        setIsFetchingFiles(false);
      }
    };

    loadFiles();
  }, [selectedProjectId, config, identity, projects, toast]);

  const handleDownload = async (file: CloudFile) => {
    if (!config) return;
    setIsDownloading(file.id);
    try {
      const path = String((file as any).path || '').trim();
      if (!path) throw new Error("Missing Dropbox path for file.");
      const url = `/api/dropbox/proxy-download?path=${encodeURIComponent(path)}&name=${encodeURIComponent(file.name || 'download')}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({ variant: "destructive", title: "Download Failed" });
    } finally {
      setIsDownloading(null);
    }
  };

  const filteredLatest = useMemo(() => 
    files.latest.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
  , [files.latest, searchQuery]);

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#15191c] flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Establishing Secure Vault Link...</p>
      </div>
    );
  }

  const activeProject = projects.find(p => p.id === selectedProjectId);

  const resolveLeadDesigner = () => {
    const name =
      String(activeProject?.designer || '').trim() ||
      String(projects?.[0]?.designer || '').trim() ||
      'Jeff Dillon';

    const target = name.toLowerCase();
    const match = firmEmployees.find(e => `${e.firstName} ${e.lastName}`.trim().toLowerCase() === target);
    const email = String(match?.email || '').trim() || 'jeff@designersink.us';
    return { name, email };
  };

  const openMessageDesigner = () => {
    setMessageText('');
    setMessageEmail('');
    setIsMessageOpen(true);
  };

  const handleSendMessage = async () => {
    if (!identity) return;
    if (!messageText.trim()) {
      toast({ variant: "destructive", title: "Message required", description: "Please type a message." });
      return;
    }
    setIsSendingMessage(true);
    try {
      const lead = resolveLeadDesigner();
      const subject = activeProject
        ? `PlanPort Message - ${activeProject.name} (${identity.name})`
        : `PlanPort Message - ${identity.name}`;

      const html = `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.5;">
          <h2 style="margin:0 0 12px 0;">New PlanPort message</h2>
          <p style="margin:0 0 8px 0;"><b>Lead Designer:</b> ${lead.name} (${lead.email})</p>
          <p style="margin:0 0 8px 0;"><b>From:</b> ${identity.name} (${identity.type})</p>
          <p style="margin:0 0 8px 0;"><b>Portal Code:</b> ${code.toUpperCase()}</p>
          ${activeProject ? `<p style="margin:0 0 8px 0;"><b>Project:</b> ${activeProject.name}</p>` : ``}
          ${messageEmail.trim() ? `<p style="margin:0 0 8px 0;"><b>Reply-to email:</b> ${messageEmail.trim()}</p>` : ``}
          <hr style="border:none;border-top:1px solid #eee;margin:14px 0;" />
          <pre style="white-space:pre-wrap;margin:0;">${messageText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        </div>
      `;

      const result = await sendEmail({
        to: lead.email,
        subject,
        html,
      });

      if (!result?.success) {
        throw new Error(result?.error || "Failed to send message");
      }

      toast({ title: "Message sent", description: "Your designer will receive your message shortly." });
      setIsMessageOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Send failed", description: err?.message || "Could not send message." });
    } finally {
      setIsSendingMessage(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#15191c] text-white">
      <header className="border-b border-white/5 bg-card/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 overflow-hidden cursor-pointer" onClick={() => setSelectedProjectId(null)}>
              <Image src={appLogoUrl} alt="Designer's Ink" width={40} height={40} className="object-contain" priority />
            </div>
            <div>
              <h1 className="text-lg font-headline font-bold text-white leading-none">PlanPort Viewer</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-black uppercase text-accent tracking-widest">{identity?.name}</span>
                <Badge variant="outline" className="text-[8px] h-4 py-0 border-white/10 opacity-50 uppercase">{identity?.type}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-9 px-4 text-[10px] font-black uppercase gap-2 border-white/10 hover:bg-white/5"
              onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}
              title="Open admin login in a new tab"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Admin Login
            </Button>
            <Button variant="outline" className="h-9 px-4 text-[10px] font-black uppercase gap-2 border-white/10 hover:bg-white/5" onClick={openMessageDesigner}>
              <Mail className="h-3.5 w-3.5" /> Message Designer
            </Button>
            <Button variant="ghost" className="text-[10px] font-black uppercase gap-2 hover:bg-white/5" onClick={() => window.location.href = '/planport'}>
              <ArrowLeft className="h-3 w-3" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-3 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest px-1">Project Portfolio</Label>
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedProjectId(null)}
                  className={cn(
                    "w-full text-left p-4 rounded-2xl border transition-all group flex items-center gap-3",
                    selectedProjectId === null 
                      ? "bg-primary/10 border-primary shadow-lg shadow-primary/5" 
                      : "bg-card/20 border-white/5 hover:border-white/20"
                  )}
                >
                  <Grid className={cn("h-4 w-4", selectedProjectId === null ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("font-bold text-sm", selectedProjectId === null ? "text-white" : "text-muted-foreground")}>Dashboard Home</span>
                </button>
                <div className="h-px bg-white/5 my-2" />
                {projects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border transition-all group flex flex-col gap-1",
                      selectedProjectId === project.id 
                        ? "bg-primary/10 border-primary shadow-lg shadow-primary/5" 
                        : "bg-card/20 border-white/5 hover:border-white/20"
                    )}
                  >
                    <span className={cn("font-bold text-sm", selectedProjectId === project.id ? "text-white" : "text-muted-foreground")}>{project.name}</span>
                    <div className="flex items-center gap-2 opacity-60">
                      <MapPin className="h-2.5 w-2.5" />
                      <span className="text-[9px] font-bold uppercase truncate">{project.address || 'Site Assignment'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-9 space-y-8">
            {!selectedProjectId ? (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="bg-primary/5 border border-primary/20 p-8 rounded-3xl space-y-2">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <h2 className="text-3xl font-headline font-bold text-white">Welcome back, {identity?.name}</h2>
                      <p className="text-muted-foreground">Select a project below to access secure technical drawings and blueprints.</p>
                    </div>
                    {identity?.firmId ? (
                      <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <Button variant="outline" className="gap-2" onClick={openMessageDesigner}>
                          <Mail className="h-4 w-4" /> Message Designer
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {projects.length === 0 ? (
                    <Card className="col-span-full border-dashed border-white/10 bg-card/10 py-32 flex flex-col items-center justify-center text-center space-y-4">
                      <FileText className="h-16 w-16 text-white/10" />
                      <p className="text-sm text-muted-foreground italic">No projects assigned to this account.</p>
                    </Card>
                  ) : (
                    projects.map(project => {
                      const displayImageUrl = formatDropboxUrl(project.renderingUrl || DEFAULT_PROJECT_RENDERING);
                      return (
                        <Card 
                          key={project.id} 
                          className="border-white/5 bg-card/20 hover:border-primary/30 transition-all group cursor-pointer overflow-hidden"
                          onClick={() => setSelectedProjectId(project.id)}
                        >
                          <CardContent className="p-0">
                            <div className="h-32 bg-black/40 relative overflow-hidden flex items-center justify-center">
                              {displayImageUrl ? (
                                <Image src={displayImageUrl} alt={project.name} fill className="object-cover opacity-40 group-hover:opacity-60 transition-opacity" />
                              ) : (
                                <Building2 className="h-12 w-12 text-white/5" />
                              )}
                              <Badge className="absolute top-3 right-3 bg-background/80 backdrop-blur-md border-white/10 text-[8px] font-black uppercase">
                                {project.status === 'Archived' ? 'ARCHIVE' : project.type || 'Residential'}
                              </Badge>
                            </div>
                            <div className="p-6 space-y-4">
                              <div className="space-y-1">
                                <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors">{project.name}</h3>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest flex items-center gap-1.5">
                                  <MapPin className="h-2.5 w-2.5 text-accent" /> {project.address || 'Site Assignment'}
                                </p>
                              </div>
                              <Button className="w-full h-10 bg-primary/10 border border-primary/20 text-primary group-hover:bg-primary group-hover:text-white transition-all font-bold gap-2">
                                OPEN VAULT <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            ) : activeProject ? (
              <div className="space-y-8 animate-in fade-in duration-500">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedProjectId(null)} className="h-7 px-2 text-[10px] uppercase font-black gap-1.5 hover:bg-white/5 text-muted-foreground">
                        <ArrowLeft className="h-3 w-3" /> Back to Portfolio
                      </Button>
                    </div>
                    <h2 className="text-4xl font-headline font-bold text-white">{activeProject.name}</h2>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" /> {activeProject.constructionCompany || 'Direct Client Registry'}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    {identity?.firmId ? (
                      <div className="flex gap-2">
                        <Button variant="outline" className="h-11 gap-2" onClick={openMessageDesigner}>
                          <Mail className="h-4 w-4" /> Message Designer
                        </Button>
                      </div>
                    ) : null}
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search blueprints..." 
                        className="pl-10 h-11 bg-card/30 border-white/10 rounded-xl"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="flex bg-card/30 p-1 rounded-xl border border-white/5">
                      <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" className="h-9 w-9 rounded-lg" onClick={() => setViewMode('grid')}><Grid className="h-4 w-4" /></Button>
                      <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-9 w-9 rounded-lg" onClick={() => setViewMode('list')}><ListIcon className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </header>

                <Tabs defaultValue="latest" className="space-y-6">
                  <TabsList className="bg-card/30 border border-white/5 p-1 rounded-xl h-12 w-fit">
                    <TabsTrigger value="latest" className="px-8 h-10 rounded-lg gap-2 font-bold"><FileText className="h-4 w-4" /> Latest Versions</TabsTrigger>
                    <TabsTrigger value="archive" className="px-8 h-10 rounded-lg gap-2 font-bold"><History className="h-4 w-4" /> Archived Sets</TabsTrigger>
                  </TabsList>

                  <TabsContent value="latest" className="m-0">
                    {isFetchingFiles ? (
                      <div className="py-32 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Fetching Data Stream...</p>
                      </div>
                    ) : filteredLatest.length === 0 ? (
                      <Card className="border-dashed border-white/10 bg-card/10 py-32 flex flex-col items-center justify-center text-center space-y-4">
                        <FileText className="h-16 w-16 text-white/10" />
                        <p className="text-sm text-muted-foreground italic">No blueprints found in the primary folder.</p>
                      </Card>
                    ) : viewMode === 'grid' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredLatest.map(file => (
                          <Card key={file.id} className="border-white/5 bg-card/20 hover:border-primary/30 transition-all group overflow-hidden">
                            <CardContent className="p-6 space-y-6">
                              <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                  <FileText className="h-6 w-6 text-primary" />
                                </div>
                                <div className="space-y-1 min-w-0">
                                  <h4 className="text-sm font-bold text-white truncate" title={file.name}>{file.name}</h4>
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase font-bold">
                                    <Clock className="h-2.5 w-2.5" /> Updated {file.createdTime ? format(parseISO(file.createdTime), 'MMM d, yyyy') : '—'}
                                  </p>
                                </div>
                              </div>
                              <Button 
                                className="w-full h-11 bg-primary font-black shadow-lg shadow-primary/10 gap-2"
                                onClick={() => handleDownload(file)}
                                disabled={!!isDownloading}
                              >
                                {isDownloading === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                DOWNLOAD PDF
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card className="border-white/5 bg-card/20 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-white/5">
                            <TableRow>
                              <TableHead>Filename</TableHead>
                              <TableHead>Modified</TableHead>
                              <TableHead>Size</TableHead>
                              <TableHead className="w-20"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredLatest.map(file => (
                              <TableRow key={file.id} className="hover:bg-white/5">
                                <TableCell className="font-bold text-sm">{file.name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{file.createdTime ? format(parseISO(file.createdTime), 'MMM d, yy') : '—'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{(file.size! / 1024 / 1024).toFixed(1)} MB</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" onClick={() => handleDownload(file)} disabled={!!isDownloading}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="archive" className="m-0">
                    <Card className="border-white/5 bg-card/20 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-white/5">
                          <TableRow>
                            <TableHead>Historical Set</TableHead>
                            <TableHead>Archived Date</TableHead>
                            <TableHead className="w-20"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {files.archives.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-20 text-muted-foreground italic">No historical versions available.</TableCell>
                            </TableRow>
                          ) : (
                            files.archives.map(file => (
                              <TableRow key={file.id} className="hover:bg-white/5">
                                <TableCell className="font-medium text-sm">{file.name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{file.createdTime ? format(parseISO(file.createdTime), 'MMM d, yyyy') : '—'}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" onClick={() => handleDownload(file)} disabled={!!isDownloading}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <Dialog open={isMessageOpen} onOpenChange={setIsMessageOpen}>
        <DialogContent className="sm:max-w-[600px] bg-[#1a1c1e] text-white border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> Message Designer
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Send a message to your lead designer. If you add your email, they can reply directly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Your email (optional)</Label>
              <Input
                value={messageEmail}
                onChange={(e) => setMessageEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-background/40 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Message</Label>
              <Textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message…"
                className="min-h-[160px] bg-background/40 border-white/10"
              />
            </div>
            <div className="text-[10px] text-white/50">
              Context included automatically: portal code, account name, and current project (if selected).
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsMessageOpen(false)} disabled={isSendingMessage}>
              Cancel
            </Button>
            <Button onClick={handleSendMessage} disabled={isSendingMessage || !messageText.trim()} className="gap-2">
              {isSendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="max-w-[1400px] mx-auto px-6 py-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 opacity-40">
        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Designer's Ink PlanPort • Secure Architecture Gateway</p>
        <div className="flex gap-6 text-[9px] font-bold uppercase">
          <span>Read-Only Vault</span>
          <span>Automatic Revisioning</span>
          <span>Certified Firm Portal</span>
        </div>
      </footer>
    </div>
  );
}
