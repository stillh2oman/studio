"use client";

import { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

type SignaturePadProps = {
  className?: string;
  width?: number;
  height?: number;
  onChange?: (dataUrl: string | null) => void;
};

export function SignaturePad({
  className,
  width = 400,
  height = 140,
  onChange,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInkRef = useRef(false);

  const emit = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    onChange?.(hasInkRef.current ? c.toDataURL("image/png") : null);
  }, [onChange]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [width, height]);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const scaleX = r.width > 0 ? c.width / r.width : 1;
    const scaleY = r.height > 0 ? c.height / r.height : 1;
    let clientX: number;
    let clientY: number;
    if ("touches" in e && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      const me = e as React.MouseEvent;
      clientX = me.clientX;
      clientY = me.clientY;
    }
    return {
      x: (clientX - r.left) * scaleX,
      y: (clientY - r.top) * scaleY,
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInkRef.current = true;
  };

  const end = () => {
    if (drawing.current) {
      drawing.current = false;
      emit();
    }
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    hasInkRef.current = false;
    onChange?.(null);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="touch-none rounded-md border border-input bg-white cursor-crosshair block w-full max-w-full h-auto"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <Button type="button" variant="outline" size="sm" onClick={clear} className="gap-1">
        <Eraser className="w-3.5 h-3.5" />
        Clear
      </Button>
    </div>
  );
}
