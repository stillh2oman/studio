
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Lock, 
  ShieldAlert, 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Minimize2,
  AlertCircle,
  Loader2,
  Pencil,
  Type,
  Hand,
  Trash2,
  Undo,
  MessageSquarePlus,
  Save,
  X,
  Eye,
  EyeOff,
  Download,
  SendHorizontal
} from "lucide-react";
import { PrintOrderForm } from "./PrintOrderForm";
import { SubmitRevisionDialog } from "./SubmitRevisionDialog";
import { normalizeDropboxUrl, resolvePdfJsUrl, toDirectDropboxFileUrl } from "@/lib/dropbox-utils";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { DocumentReference } from "firebase/firestore";
import { getDoc, updateDoc } from "firebase/firestore";

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

function loadPdfJsFromCdn(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF.js can only load in the browser."));
  }
  if (window.pdfjsLib) {
    return Promise.resolve(window.pdfjsLib);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pdfjs="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.pdfjsLib));
      existing.addEventListener("error", () => reject(new Error("Failed to load PDF.js script.")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.setAttribute("data-pdfjs", "true");
    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error("PDF.js loaded, but pdfjsLib global was not found."));
        return;
      }
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js script."));
    document.head.appendChild(script);
  });
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

interface Annotation {
  id: string;
  x: number;
  y: number;
  text: string;
}

interface Callout {
  id: string;
  anchor: Point;
  target: Point;
  text: string;
}

/** Stored on the blueprint Firestore doc so field notes survive sessions (same PDF in the hub). */
const CLIENT_FIELD_MARKUPS_KEY = "clientFieldMarkups" as const;

interface ClientFieldMarkupsV1 {
  v: 1;
  showMarkups: boolean;
  strokes: Record<string, Stroke[]>;
  annotations: Record<string, Annotation[]>;
  callouts: Record<string, Callout[]>;
}

function recordNumKeysToStrings<T>(r: Record<number, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(r)) {
    const n = Number(k);
    if (!Number.isFinite(n)) continue;
    out[String(n)] = v as T;
  }
  return out;
}

function recordStringKeysToNum<T>(r: Record<string, T> | undefined): Record<number, T> {
  const out: Record<number, T> = {};
  if (!r || typeof r !== "object") return out;
  for (const k of Object.keys(r)) {
    const n = parseInt(k, 10);
    if (!Number.isNaN(n)) out[n] = r[k];
  }
  return out;
}

function buildClientFieldMarkupsPayload(
  showMarkups: boolean,
  strokes: Record<number, Stroke[]>,
  annotations: Record<number, Annotation[]>,
  callouts: Record<number, Callout[]>
): ClientFieldMarkupsV1 {
  return {
    v: 1,
    showMarkups,
    strokes: recordNumKeysToStrings(strokes),
    annotations: recordNumKeysToStrings(annotations),
    callouts: recordNumKeysToStrings(callouts),
  };
}

interface PDFViewerProps {
  url: string;
  title: string;
  version: string;
  gcName?: string;
  projectName?: string;
  allowDownload?: boolean;
  designerEmail?: string;
  /** Blueprint field view: print shop order. Hidden for contracts. */
  showPrintOrder?: boolean;
  /** Blueprint field view: submit revision to designer. Hidden for contracts. */
  showSubmitRevision?: boolean;
  /**
   * When set, drawings and notes are loaded from and saved to the blueprint document in Firestore
   * (toggle visibility only hides them in the UI; erase with trash/undo updates the saved copy).
   */
  markupPersistence?: { blueprintRef: DocumentReference | null } | null;
}

type Tool = 'pan' | 'pen' | 'text' | 'callout';

const MARKUP_COLOR = "#ef4444"; // Architectural Red
const DEFAULT_PEN_WIDTH = 3;
const PEN_WIDTH_CHOICES = [2, 3, 5] as const;

export function PDFViewer({
  url,
  title,
  version,
  gcName = "Contractor",
  projectName = "Project",
  allowDownload = false,
  designerEmail,
  showPrintOrder = true,
  showSubmitRevision = true,
  markupPersistence = null,
}: PDFViewerProps) {
  const { toast } = useToast();
  const [pdf, setPdf] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dialogPortalHost, setDialogPortalHost] = useState<HTMLDivElement | null>(null);
  const setDialogPortalRef = useCallback((node: HTMLDivElement | null) => {
    setDialogPortalHost((prev) => (prev === node ? prev : node));
  }, []);
  const [detectedPaperSize, setDetectedPaperSize] = useState<"36x24" | "48x36">("36x24");

  // Markup State
  const [activeTool, setActiveTool] = useState<Tool>('pan');
  const [showMarkups, setShowMarkups] = useState(true);
  const [strokes, setStrokes] = useState<Record<number, Stroke[]>>({});
  const [annotations, setAnnotations] = useState<Record<number, Annotation[]>>({});
  const [callouts, setCallouts] = useState<Record<number, Callout[]>>({});
  const [penWidth, setPenWidth] = useState<number>(DEFAULT_PEN_WIDTH);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [calloutAnchor, setCalloutAnchor] = useState<Point | null>(null);
  const [calloutTarget, setCalloutTarget] = useState<Point | null>(null);
  
  // Panning State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number, y: number, scrollLeft: number, scrollTop: number } | null>(null);

  // Text Overlay State
  const [textInput, setTextInput] = useState<{ x: number, y: number, type: 'text' | 'callout' } | null>(null);
  const [currentText, setCurrentText] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markupCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfjsRef = useRef<any>(null);
  const lastWrittenMarkupsJson = useRef<string | null>(null);
  const markupSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [markupHydrated, setMarkupHydrated] = useState(() => !markupPersistence?.blueprintRef);

  const fitToContainer = useCallback(async () => {
    if (!pdf || !scrollContainerRef.current) return;
    try {
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
      const padding = 24;
      const containerWidth = scrollContainerRef.current.clientWidth - padding;
      const containerHeight = scrollContainerRef.current.clientHeight - padding;
      const scaleW = containerWidth / viewport.width;
      const scaleH = containerHeight / viewport.height;
      const newScale = Math.min(scaleW, scaleH);
      setScale(Math.max(0.1, Math.min(newScale, 4.0)));
    } catch (err) {
      console.error("Error fitting to container:", err);
    }
  }, [pdf, currentPage]);

  useEffect(() => {
    if (isFullscreen) {
      const timer = setTimeout(() => fitToContainer(), 150);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, fitToContainer]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Lock scroll in expanded mode; Escape exits CSS fallback when browser fullscreen is unavailable.
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement === containerRef.current) return;
      setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const loadPdf = async () => {
      if (!url) return;
      setLoading(true);
      setError(null);
      setPdf(null);
      setCurrentPage(1);
      setNumPages(0);
      try {
        if (!pdfjsRef.current) {
          const pdfjs = await loadPdfJsFromCdn();
          pdfjs.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          pdfjsRef.current = pdfjs;
        }
        // pdf.js runs in a worker whose base URL is the worker script, not this page — relative `/api/...` URLs break without an absolute origin.
        const docUrl = resolvePdfJsUrl(url);
        // Range + stream: pdf.js issues chunked GETs through our same-origin proxy so huge PDFs
        // are not pulled as a single multi‑hundred‑MB response (which can OOM or time out on App Hosting).
        const loadingTask = pdfjsRef.current.getDocument({
          url: docUrl,
          withCredentials: false,
          disableRange: false,
          disableStream: false
        });
        const pdfDoc = await loadingTask.promise;
        const firstPage = await pdfDoc.getPage(1);
        const view = firstPage.getViewport({ scale: 1 });
        const maxDimPoints = Math.max(view.width, view.height);
        setDetectedPaperSize(maxDimPoints > 3000 ? "48x36" : "36x24");
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err: any) {
        console.error("Error loading PDF:", err);
        const hint = err?.message ? String(err.message) : "";
        setError(
          hint && hint.length < 220
            ? `Could not open this PDF. ${hint}`
            : "Could not open this PDF. If it is stored in Dropbox, confirm the link is shared as “anyone with the link can view,” then try again."
        );
        setLoading(false);
      }
    };
    loadPdf();
  }, [url]);

  useEffect(() => {
    const ref = markupPersistence?.blueprintRef;
    if (!ref) {
      setMarkupHydrated(true);
      lastWrittenMarkupsJson.current = null;
      return;
    }
    setMarkupHydrated(false);
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(ref);
        if (cancelled) return;
        const raw = snap.exists() ? (snap.data() as Record<string, unknown>)[CLIENT_FIELD_MARKUPS_KEY] : null;
        const m = raw as ClientFieldMarkupsV1 | null | undefined;
        if (m && m.v === 1) {
          const nextStrokes = recordStringKeysToNum<Stroke[]>(m.strokes);
          const nextAnnotations = recordStringKeysToNum<Annotation[]>(m.annotations);
          const nextCallouts = recordStringKeysToNum<Callout[]>(m.callouts);
          const nextShow = typeof m.showMarkups === "boolean" ? m.showMarkups : true;
          lastWrittenMarkupsJson.current = JSON.stringify(
            buildClientFieldMarkupsPayload(nextShow, nextStrokes, nextAnnotations, nextCallouts)
          );
          setStrokes(nextStrokes);
          setAnnotations(nextAnnotations);
          setCallouts(nextCallouts);
          setShowMarkups(nextShow);
        } else {
          const empty = buildClientFieldMarkupsPayload(true, {}, {}, {});
          lastWrittenMarkupsJson.current = JSON.stringify(empty);
          setStrokes({});
          setAnnotations({});
          setCallouts({});
          setShowMarkups(true);
        }
      } catch (e) {
        console.warn("Could not load saved PDF field notes", e);
        if (!cancelled) {
          lastWrittenMarkupsJson.current = JSON.stringify(buildClientFieldMarkupsPayload(true, {}, {}, {}));
          setStrokes({});
          setAnnotations({});
          setCallouts({});
          setShowMarkups(true);
        }
      } finally {
        if (!cancelled) setMarkupHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markupPersistence?.blueprintRef, url]);

  useEffect(() => {
    const ref = markupPersistence?.blueprintRef;
    if (!ref || !markupHydrated) return;
    const payload = buildClientFieldMarkupsPayload(showMarkups, strokes, annotations, callouts);
    const serialized = JSON.stringify(payload);
    if (serialized === lastWrittenMarkupsJson.current) return;
    if (markupSaveTimerRef.current) clearTimeout(markupSaveTimerRef.current);
    markupSaveTimerRef.current = setTimeout(() => {
      markupSaveTimerRef.current = null;
      void (async () => {
        try {
          await updateDoc(ref, { [CLIENT_FIELD_MARKUPS_KEY]: payload });
          lastWrittenMarkupsJson.current = serialized;
        } catch (err) {
          console.warn("PDF field notes save failed", err);
          toast({
            variant: "destructive",
            title: "Could not save field notes",
            description: "Your markups stay in this tab. Check your connection or Firestore rules, then try again.",
          });
        }
      })();
    }, 650);
    return () => {
      if (markupSaveTimerRef.current) clearTimeout(markupSaveTimerRef.current);
    };
  }, [strokes, annotations, callouts, showMarkups, markupHydrated, markupPersistence?.blueprintRef, toast]);

  useEffect(() => {
    if (pdf && !loading) {
      const timer = setTimeout(() => fitToContainer(), 100);
      return () => clearTimeout(timer);
    }
  }, [pdf, loading, fitToContainer]);

  const drawMarkups = useCallback(() => {
    const canvas = markupCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // markupCanvas is rendered at devicePixelRatio resolution; draw in CSS pixel units
    // so pointer coordinates and paint are aligned at all DPR/zoom values.
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!showMarkups) return;
    const pageStrokes = strokes[currentPage] || [];
    const pageAnnotations = annotations[currentPage] || [];
    const pageCallouts = callouts[currentPage] || [];
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    pageStrokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color || MARKUP_COLOR;
      ctx.lineWidth = typeof stroke.width === "number" && Number.isFinite(stroke.width) ? stroke.width : DEFAULT_PEN_WIDTH;
      ctx.moveTo(stroke.points[0].x * scale, stroke.points[0].y * scale);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * scale, stroke.points[i].y * scale);
      }
      ctx.stroke();
    });
    if (isDrawing && activeTool === 'pen' && currentStroke.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = MARKUP_COLOR;
      ctx.lineWidth = penWidth;
      ctx.moveTo(currentStroke[0].x * scale, currentStroke[0].y * scale);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x * scale, currentStroke[i].y * scale);
      }
      ctx.stroke();
    }
    pageCallouts.forEach(call => {
      ctx.beginPath();
      ctx.strokeStyle = MARKUP_COLOR;
      ctx.lineWidth = 2;
      ctx.moveTo(call.anchor.x * scale, call.anchor.y * scale);
      ctx.lineTo(call.target.x * scale, call.target.y * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(call.anchor.x * scale, call.anchor.y * scale, 4, 0, Math.PI * 2);
      ctx.fillStyle = MARKUP_COLOR;
      ctx.fill();
      const padding = 6;
      ctx.font = `bold 14px Inter, sans-serif`;
      const textWidth = ctx.measureText(call.text).width;
      const textHeight = 16;
      ctx.fillStyle = "white";
      ctx.fillRect(call.target.x * scale, call.target.y * scale - textHeight - padding/2, textWidth + padding * 2, textHeight + padding);
      ctx.strokeStyle = MARKUP_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(call.target.x * scale, call.target.y * scale - textHeight - padding/2, textWidth + padding * 2, textHeight + padding);
      ctx.fillStyle = MARKUP_COLOR;
      ctx.fillText(call.text, call.target.x * scale + padding, call.target.y * scale);
    });
    if (activeTool === 'callout' && isDrawing && calloutAnchor && calloutTarget) {
      ctx.beginPath();
      ctx.strokeStyle = MARKUP_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.moveTo(calloutAnchor.x * scale, calloutAnchor.y * scale);
      ctx.lineTo(calloutTarget.x * scale, calloutTarget.y * scale);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(calloutAnchor.x * scale, calloutAnchor.y * scale, 4, 0, Math.PI * 2);
      ctx.fillStyle = MARKUP_COLOR;
      ctx.fill();
    }
    ctx.font = `bold 14px Inter, sans-serif`;
    pageAnnotations.forEach(ann => {
      const padding = 4;
      const textWidth = ctx.measureText(ann.text).width;
      const textHeight = 14;
      ctx.fillStyle = "white";
      ctx.fillRect(ann.x * scale - padding, ann.y * scale - textHeight, textWidth + padding * 2, textHeight + padding);
      ctx.strokeStyle = MARKUP_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(ann.x * scale - padding, ann.y * scale - textHeight, textWidth + padding * 2, textHeight + padding);
      ctx.fillStyle = MARKUP_COLOR;
      ctx.fillText(ann.text, ann.x * scale, ann.y * scale);
    });
  }, [currentPage, strokes, annotations, callouts, isDrawing, currentStroke, scale, calloutAnchor, calloutTarget, activeTool, showMarkups, penWidth]);

  useEffect(() => {
    const renderPage = async () => {
      if (!pdf || !canvasRef.current || !markupCanvasRef.current) return;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
      try {
        const page = await pdf.getPage(currentPage);
        const viewport = page.getViewport({ scale, rotation: page.rotate });
        const canvas = canvasRef.current;
        const markupCanvas = markupCanvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        const outputScale = window.devicePixelRatio || 1;
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";
        markupCanvas.height = Math.floor(viewport.height * outputScale);
        markupCanvas.width = Math.floor(viewport.width * outputScale);
        markupCanvas.style.width = Math.floor(viewport.width) + "px";
        markupCanvas.style.height = Math.floor(viewport.height) + "px";
        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
        const renderContext = { canvasContext: context, transform, viewport, canvas };
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        renderTaskRef.current = null;
        drawMarkups();
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException') return;
        console.error("Error rendering page:", err);
      }
    };
    renderPage();
    return () => { if (renderTaskRef.current) renderTaskRef.current.cancel(); };
  }, [pdf, currentPage, scale, drawMarkups]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = markupCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const touch = "touches" in e ? (e as React.TouchEvent).touches[0] : null;
    const clientX = touch ? touch.clientX : (e as React.MouseEvent).clientX;
    const clientY = touch ? touch.clientY : (e as React.MouseEvent).clientY;
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (textInput || !showMarkups) return;
    const coords = getCoordinates(e);
    if (!coords) return;
    if (activeTool === 'pan') {
      const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
      setIsPanning(true);
      setPanStart({ x: clientX, y: clientY, scrollLeft: scrollContainerRef.current?.scrollLeft || 0, scrollTop: scrollContainerRef.current?.scrollTop || 0 });
      return;
    }
    if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentStroke([coords]);
    } else if (activeTool === 'text') {
      setTextInput({ x: coords.x, y: coords.y, type: 'text' });
    } else if (activeTool === 'callout') {
      setCalloutAnchor(coords);
      setCalloutTarget(coords);
      setIsDrawing(true);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPanning && panStart && scrollContainerRef.current) {
      const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
      const dx = clientX - panStart.x;
      const dy = clientY - panStart.y;
      scrollContainerRef.current.scrollLeft = panStart.scrollLeft - dx;
      scrollContainerRef.current.scrollTop = panStart.scrollTop - dy;
      return;
    }
    if (!isDrawing || !showMarkups) return;
    const coords = getCoordinates(e);
    if (!coords) return;
    if (activeTool === 'pen') {
      setCurrentStroke(prev => [...prev, coords]);
    } else if (activeTool === 'callout') {
      setCalloutTarget(coords);
    }
  };

  const endDrawing = () => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    if (!isDrawing || !showMarkups) return;
    if (activeTool === 'pen' && currentStroke.length > 1) {
      setStrokes(prev => ({ ...prev, [currentPage]: [...(prev[currentPage] || []), { points: currentStroke, color: MARKUP_COLOR, width: penWidth }] }));
    } else if (activeTool === 'callout' && calloutAnchor && calloutTarget) {
      setTextInput({ x: calloutTarget.x, y: calloutTarget.y, type: 'callout' });
    }
    setIsDrawing(false);
    setCurrentStroke([]);
  };

  const saveTextMarkup = () => {
    if (!textInput || !currentText.trim()) {
      setTextInput(null);
      setCurrentText("");
      setCalloutAnchor(null);
      setCalloutTarget(null);
      return;
    }
    if (textInput.type === 'text') {
      setAnnotations(prev => ({ ...prev, [currentPage]: [...(prev[currentPage] || []), { id: Math.random().toString(36).substr(2, 9), x: textInput.x, y: textInput.y, text: currentText }] }));
    } else if (textInput.type === 'callout' && calloutAnchor && calloutTarget) {
      setCallouts(prev => ({ ...prev, [currentPage]: [...(prev[currentPage] || []), { id: Math.random().toString(36).substr(2, 9), anchor: calloutAnchor, target: calloutTarget, text: currentText }] }));
    }
    setTextInput(null);
    setCurrentText("");
    setCalloutAnchor(null);
    setCalloutTarget(null);
  };

  const exportMarkedImage = () => {
    if (!canvasRef.current || !markupCanvasRef.current) return null;
    const canvas = canvasRef.current;
    const markup = markupCanvasRef.current;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(markup, 0, 0);
    return exportCanvas.toDataURL('image/jpeg', 0.8);
  };

  const undoLastMarkup = () => {
    setStrokes(prev => ({ ...prev, [currentPage]: (prev[currentPage] || []).slice(0, -1) }));
    setAnnotations(prev => ({ ...prev, [currentPage]: (prev[currentPage] || []).slice(0, -1) }));
    setCallouts(prev => ({ ...prev, [currentPage]: (prev[currentPage] || []).slice(0, -1) }));
  };

  const clearAllMarkups = () => {
    if (
      confirm(
        "Clear all field notes and drawings on this page? This removes them from PlanPort (including after you leave)."
      )
    ) {
      setStrokes(prev => ({ ...prev, [currentPage]: [] }));
      setAnnotations(prev => ({ ...prev, [currentPage]: [] }));
      setCallouts(prev => ({ ...prev, [currentPage]: [] }));
    }
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen();
      return;
    }
    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }
    void el.requestFullscreen().catch(() => {
      setIsFullscreen(true);
    });
  };

  return (
    <div ref={containerRef} dir="ltr" className={cn("flex flex-col h-full min-h-0 bg-card rounded-md overflow-hidden border border-border pdf-viewer-container", isFullscreen ? "fixed inset-0 z-[9999] rounded-none border-0 h-dvh" : "relative")} onContextMenu={e => e.preventDefault()}>
      <div className="bg-ink text-ink-foreground p-3 flex flex-wrap items-center justify-between gap-4 z-50 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="bg-secondary p-2 rounded-md border border-border"><Lock className="text-ledger-red w-4 h-4" /></div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide truncate max-w-[200px] text-foreground">{title}</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-ledger-yellow/40 text-ledger-yellow bg-transparent font-bold text-[9px] h-4">SECURE FIELD VIEW</Badge>
              <span className="text-[9px] text-muted-foreground font-mono">v{version}</span>
            </div>
          </div>
        </div>

        {!loading && !error && (
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-secondary rounded-md p-1 border border-border gap-1">
              <Button variant="ghost" size="sm" className={cn("h-8 w-8 p-0", showMarkups ? "text-ledger-yellow" : "text-muted-foreground")} onClick={() => setShowMarkups(!showMarkups)}><Eye className="w-4 h-4" /></Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button variant={activeTool === 'pan' ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setActiveTool('pan')}><Hand className="w-4 h-4" /></Button>
              <Button variant={activeTool === 'pen' ? 'secondary' : 'ghost'} size="sm" className={cn("h-8 w-8 p-0", activeTool === 'pen' && "bg-red-500")} onClick={() => setActiveTool('pen')} disabled={!showMarkups}><Pencil className="w-4 h-4" /></Button>
              <Button variant={activeTool === 'text' ? 'secondary' : 'ghost'} size="sm" className={cn("h-8 w-8 p-0", activeTool === 'text' && "bg-red-500")} onClick={() => setActiveTool('text')} disabled={!showMarkups}><Type className="w-4 h-4" /></Button>
              <Button variant={activeTool === 'callout' ? 'secondary' : 'ghost'} size="sm" className={cn("h-8 w-8 p-0", activeTool === 'callout' && "bg-red-500")} onClick={() => setActiveTool('callout')} disabled={!showMarkups}><MessageSquarePlus className="w-4 h-4" /></Button>
              {activeTool === "pen" && showMarkups ? (
                <>
                  <div className="w-px h-4 bg-border mx-1" />
                  <div className="flex items-center gap-1 px-1">
                    {PEN_WIDTH_CHOICES.map((w) => (
                      <Button
                        key={w}
                        type="button"
                        variant={penWidth === w ? "secondary" : "ghost"}
                        size="sm"
                        className="h-8 px-2 text-[10px] font-bold"
                        onClick={() => setPenWidth(w)}
                        title={`Pen width ${w}`}
                      >
                        {w}px
                      </Button>
                    ))}
                  </div>
                </>
              ) : null}
              <div className="w-px h-4 bg-border mx-1" />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={undoLastMarkup} disabled={!showMarkups}><Undo className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:text-destructive" onClick={clearAllMarkups} disabled={!showMarkups}><Trash2 className="w-4 h-4" /></Button>
            </div>

            <div className="flex items-center bg-secondary rounded-md p-1 border border-border gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-[10px] font-bold px-2 min-w-[60px] text-center">PAGE {currentPage} / {numPages}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}><ChevronRight className="w-4 h-4" /></Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.max(0.3, s - 0.2))}><ZoomOut className="w-4 h-4" /></Button>
              <span className="text-[10px] font-bold w-10 text-center">{Math.round(scale * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.min(4, s + 0.2))}><ZoomIn className="w-4 h-4" /></Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}</Button>
            </div>
          </div>
        )}
        
        <div className="flex items-center gap-3">
          {showSubmitRevision && !loading && !error && (
            <SubmitRevisionDialog 
              blueprintName={title}
              designerEmail={designerEmail}
              portalContainer={dialogPortalHost}
              onCapture={() => exportMarkedImage()}
              trigger={
                <Button className="font-bold h-9">
                  <SendHorizontal className="w-4 h-4 mr-2" />
                  Submit Change Request
                </Button>
              }
            />
          )}
          {allowDownload && !loading && !error && (
            <Button
              variant="outline"
              size="sm"
              className="font-bold border-border"
              onClick={() => window.open(toDirectDropboxFileUrl(url), "_blank")}
            >
              <Download className="w-4 h-4 mr-2" /> Download
            </Button>
          )}
          {showPrintOrder && (
            <PrintOrderForm blueprintName={title} gcName={gcName} projectName={projectName} totalPages={numPages} detectedPaperSize={detectedPaperSize} portalContainer={dialogPortalHost} />
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto bg-background relative select-none flex justify-center p-6">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/90 z-10 px-6">
            <Loader2 className="w-12 h-12 text-foreground animate-spin" />
            <div className="space-y-2 text-center max-w-sm">
              <p className="text-foreground font-bold uppercase tracking-wide text-sm">Loading PDF from Dropbox…</p>
              <p className="text-muted-foreground text-xs">Large files can take a moment. If this never finishes, check that the link is a shared PDF (anyone with the link can view).</p>
            </div>
          </div>
        )}
        {error && <div className="flex flex-col items-center justify-center h-full w-full text-center p-8 bg-card border border-border"><AlertCircle className="w-12 h-12 text-destructive mb-4" /><h4 className="text-foreground font-bold uppercase tracking-wide text-lg mb-2">Unable to load PDF</h4><p className="text-muted-foreground text-sm mb-6 max-w-lg">{error}</p><Badge variant="destructive" className="opacity-90 uppercase tracking-wide">Dropbox / link check</Badge></div>}
        {!loading && !error && (
          <div className="shadow-2xl border-4 border-black/50 bg-white relative inline-block h-fit self-start mb-12">
            <canvas ref={canvasRef} className="block pointer-events-none" />
            <canvas ref={markupCanvasRef} className={cn("absolute top-0 left-0 w-full h-full block pointer-events-auto", activeTool === 'pan' ? (isPanning ? "cursor-grabbing" : "cursor-grab") : (!showMarkups ? "pointer-events-none" : "cursor-crosshair"))} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={endDrawing} onMouseLeave={endDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={endDrawing} />
            {textInput && (
              <div className="absolute z-[60] bg-white border-2 border-primary shadow-2xl p-2 rounded-lg flex items-center gap-2 animate-in zoom-in-95" style={{ left: textInput.x * scale, top: textInput.y * scale, transform: 'translate(-50%, -100%) translateY(-10px)' }}>
                <Input autoFocus className="h-8 min-w-[200px] border-accent" placeholder="Enter field note..." value={currentText} onChange={e => setCurrentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveTextMarkup(); if (e.key === 'Escape') setTextInput(null); }} />
                <Button size="sm" className="h-8 px-2 bg-green-600 hover:bg-green-700" onClick={saveTextMarkup}><Save className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" onClick={() => setTextInput(null)}><X className="w-4 h-4" /></Button>
              </div>
            )}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center z-10 overflow-hidden"><p className="text-6xl font-black rotate-[-45deg] whitespace-nowrap text-white uppercase tracking-tighter">PLANPORT SECURE HUB - {gcName.toUpperCase()}</p></div>
          </div>
        )}
      </div>
      <div className="bg-secondary p-2 text-muted-foreground border-t border-border flex justify-between items-center text-[8px] uppercase tracking-widest font-bold z-40">
        <span className="flex items-center gap-2"><ShieldAlert className="w-3 h-3 text-ledger-red" /> Authorized Field View • {activeTool.toUpperCase()} MODE ACTIVE</span>
        <span>ID: {version}-{title.substring(0,3).toUpperCase()}</span>
      </div>
      <div
        ref={setDialogPortalRef}
        className="absolute inset-0 z-[10020] pointer-events-none [&>*]:pointer-events-auto"
        aria-hidden
      />
    </div>
  );
}
