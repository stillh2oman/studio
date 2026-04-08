'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLedgerData } from '@/hooks/use-ledger-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Database, ExternalLink, Pause, Play, RefreshCw, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, getDocs, limit, orderBy, query as fsQuery, setDoc, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import type { MemoryBankFile } from '@/lib/types';

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function MemoryBankTab() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { memoryBankFiles, dataRootId } = useLedgerData();

  const [dropboxPath, setDropboxPath] = useState("/Designer's Ink Team Folder");
  const [query, setQuery] = useState('');
  const [isCrawling, setIsCrawling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [queryEmbedding, setQueryEmbedding] = useState<number[] | null>(null);
  const [batchSize, setBatchSize] = useState(5);

  const stopRef = useRef(false);

  const stateRef = useMemoFirebase(
    () => (dataRootId ? doc(firestore, 'employees', dataRootId, 'config', 'memory_bank_state') : null),
    [firestore, dataRootId],
  );
  const { data: state } = useDoc<any>(stateRef);

  const queuedCount = useMemo(
    () => (memoryBankFiles || []).filter(f => f.status === 'queued').length,
    [memoryBankFiles],
  );
  const indexedCount = useMemo(
    () => (memoryBankFiles || []).filter(f => f.status === 'indexed').length,
    [memoryBankFiles],
  );
  const errorCount = useMemo(
    () => (memoryBankFiles || []).filter(f => f.status === 'error').length,
    [memoryBankFiles],
  );

  const filesById = useMemo(() => {
    const m = new Map<string, MemoryBankFile>();
    for (const f of memoryBankFiles || []) m.set(f.id, f);
    return m;
  }, [memoryBankFiles]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = memoryBankFiles || [];
    if (q) {
      // Fallback text filter (before embeddings resolve).
      items = items.filter(f =>
        (f.name || '').toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q) ||
        (f.keywords || []).some(k => (k || '').toLowerCase().includes(q)) ||
        (f.spaces || []).some(s => (s || '').toLowerCase().includes(q)) ||
        (f.features || []).some(s => (s || '').toLowerCase().includes(q))
      );
    }

    if (queryEmbedding) {
      return [...items]
        .map(f => ({
          f,
          score: f.embedding ? cosine(queryEmbedding, f.embedding) : 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }

    return items.slice(0, 10).map(f => ({ f, score: 0 }));
  }, [memoryBankFiles, query, queryEmbedding]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const resp = await fetch('/api/gemini/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `Embedding failed (${resp.status})`);
      }
      const data = await resp.json();
      setQueryEmbedding(Array.isArray(data.embedding) ? data.embedding : null);
      toast({ title: 'Search ready', description: 'Showing best matches.' });
    } catch (e: any) {
      setQueryEmbedding(null);
      toast({ variant: 'destructive', title: 'Search fallback', description: e?.message || 'Using keyword search only.' });
    } finally {
      setIsSearching(false);
    }
  };

  const fileExtOk = (name: string) => /\.(pdf|png|jpe?g)$/i.test(name);

  const resetIndexState = async () => {
    if (!dataRootId) return;
    await setDoc(
      doc(firestore, 'employees', dataRootId, 'config', 'memory_bank_state'),
      {
        dropboxPath,
        cursor: null,
        hasMore: true,
        scanned: 0,
        queued: 0,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    toast({ title: 'Reset', description: 'Memory Bank crawl state reset.' });
  };

  const crawlStep = async () => {
    if (!dataRootId) return;
    const cursor = state?.cursor as string | null;
    const hasMore = state?.hasMore !== false;
    if (!hasMore) return;

    const resp = await fetch('/api/dropbox/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cursor ? JSON.stringify({ cursor }) : JSON.stringify({ path: dropboxPath, recursive: true }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error || `Dropbox list failed (${resp.status})`);
    }
    const data = await resp.json();
    const entries = (data.entries || []).filter((e: any) => e['.tag'] === 'file');
    const candidates = entries.filter((e: any) => fileExtOk(String(e.name || '')));

    let queued = 0;
    let skipped = 0;
    for (const e of candidates) {
      const path = e.path_display;
      const name = e.name;
      const id = String(e.id || path);
      const existing = filesById.get(id);
      const existingCreated = existing?.createdTime || '';
      const incomingCreated = String(e.server_modified || '');
      if (existing && existing.status === 'indexed' && existingCreated === incomingCreated) {
        skipped++;
        continue;
      }
      const docRef = doc(firestore, 'employees', dataRootId, 'memory_bank_files', id);
      const record: Partial<MemoryBankFile> = {
        id,
        source: 'dropbox',
        dropboxPath: path,
        webViewLink: `https://www.dropbox.com/home${path}`,
        name,
        size: e.size,
        createdTime: e.server_modified,
        status: 'queued',
        indexedAt: new Date().toISOString(),
      };
      await setDoc(docRef, record as any, { merge: true });
      queued++;
    }

    await setDoc(
      doc(firestore, 'employees', dataRootId, 'config', 'memory_bank_state'),
      {
        dropboxPath,
        cursor: data.cursor || null,
        hasMore: !!data.has_more,
        scanned: (state?.scanned || 0) + entries.length,
        queued: (state?.queued || 0) + queued,
      skipped: (state?.skipped || 0) + skipped,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  };

  const processBatch = async () => {
    if (!dataRootId) return;
    const colRef = collection(firestore, 'employees', dataRootId, 'memory_bank_files');
    const q = fsQuery(colRef, where('status', '==', 'queued'), orderBy('indexedAt', 'asc'), limit(batchSize));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const f = d.data() as MemoryBankFile;
      try {
        const linkResp = await fetch('/api/dropbox/temporary-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: f.dropboxPath }),
        });
        if (!linkResp.ok) throw new Error(`temporary-link failed (${linkResp.status})`);
        const { link } = await linkResp.json();

        const descResp = await fetch('/api/gemini/describe-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: f.name, downloadUrl: link }),
        });
        if (!descResp.ok) {
          const err = await descResp.json().catch(() => ({}));
          throw new Error(err?.error || `describe-plan failed (${descResp.status})`);
        }
        const ai = await descResp.json();
        await setDoc(
          doc(firestore, 'employees', dataRootId, 'memory_bank_files', f.id),
          {
            status: 'indexed',
            description: String(ai.description || ''),
            keywords: Array.isArray(ai.keywords) ? ai.keywords : [],
            spaces: Array.isArray(ai.spaces) ? ai.spaces : [],
            features: Array.isArray(ai.features) ? ai.features : [],
            embedding: Array.isArray(ai.embedding) ? ai.embedding : undefined,
            indexedAt: new Date().toISOString(),
            lastError: null,
          },
          { merge: true },
        );
      } catch (e: any) {
        await setDoc(
          doc(firestore, 'employees', dataRootId, 'memory_bank_files', f.id),
          {
            status: 'error',
            lastError: String(e?.message || e || 'Unknown error'),
            attempts: (f.attempts || 0) + 1,
            lastAttemptAt: new Date().toISOString(),
          },
          { merge: true },
        );
      }
    }
  };

  const start = async () => {
    if (!dataRootId) return;
    stopRef.current = false;
    setIsCrawling(true);
    setIsProcessing(true);
    toast({ title: 'Indexing started', description: 'Leave this tab open while it runs.' });
  };

  const stop = () => {
    stopRef.current = true;
    setIsCrawling(false);
    setIsProcessing(false);
    toast({ title: 'Paused', description: 'You can resume anytime.' });
  };

  useEffect(() => {
    if (!dataRootId) return;
    if (!isCrawling && !isProcessing) return;

    let cancelled = false;
    const loop = async () => {
      while (!cancelled && !stopRef.current) {
        try {
          // Crawl until exhausted, then keep processing queue
          if (isCrawling && (state?.hasMore !== false)) {
            await crawlStep();
          } else {
            setIsCrawling(false);
          }

          if (isProcessing) {
            await processBatch();
          }
        } catch (e: any) {
          toast({ variant: 'destructive', title: 'Index error', description: e?.message || 'Unknown error' });
          break;
        }
        await new Promise(r => setTimeout(r, 250));
      }
    };
    loop();
    return () => {
      cancelled = true;
    };
  }, [dataRootId, isCrawling, isProcessing, state, batchSize]);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-xl bg-card/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" /> Architectural Memory Bank
          </CardTitle>
          <CardDescription>
            Index all .png/.jpg/.pdf files in a Dropbox folder tree, then search by description.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Input value={dropboxPath} onChange={e => setDropboxPath(e.target.value)} placeholder="Dropbox path" />
            </div>
            <div className="flex gap-2">
              <Button onClick={start} disabled={isCrawling || isProcessing}>
                <Play className="h-4 w-4 mr-2" /> Start
              </Button>
              <Button variant="outline" onClick={stop} disabled={!isCrawling && !isProcessing}>
                <Pause className="h-4 w-4 mr-2" /> Pause
              </Button>
              <Button variant="ghost" onClick={resetIndexState}>
                <RefreshCw className="h-4 w-4 mr-2" /> Reset
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="text-xs text-muted-foreground">
              <div><span className="font-bold text-white">{indexedCount}</span> indexed</div>
              <div><span className="font-bold text-white">{queuedCount}</span> queued</div>
              <div><span className="font-bold text-white">{errorCount}</span> errors</div>
            </div>
            <div className="text-xs text-muted-foreground md:col-span-2">
              <div>scanned: <span className="font-bold text-white">{state?.scanned || 0}</span></div>
              <div>skipped unchanged: <span className="font-bold text-white">{state?.skipped || 0}</span></div>
              <div>cursor: <span className="font-mono text-white/80">{state?.cursor ? String(state.cursor).slice(0, 24) + '…' : '—'}</span></div>
              <div>has more: <span className="font-bold text-white">{state?.hasMore === false ? 'no' : 'yes'}</span></div>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              <Input
                value={String(batchSize)}
                onChange={e => setBatchSize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">AI batch</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Describe what you're looking for..." />
            <Button variant="outline" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-xl bg-card/30">
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>{results.length} shown</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground">No results yet. Run Index Dropbox first.</div>
          ) : (
            results.map(({ f, score }) => (
              <div key={f.id} className="border border-border/50 rounded-xl p-4 bg-background/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{f.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{f.dropboxPath}</div>
                    <div className="text-sm text-foreground/90 mt-2 whitespace-pre-wrap">{f.description}</div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {(f.features || []).slice(0, 6).map(x => (
                        <Badge key={x} variant="outline" className="text-[10px]">{x}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {score ? <div className="text-xs text-muted-foreground">score: {score.toFixed(3)}</div> : null}
                    <a className="text-xs text-primary underline inline-flex items-center gap-1" href={f.webViewLink} target="_blank" rel="noreferrer">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

