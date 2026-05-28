"use client";

import { useCallback, useMemo, useRef } from "react";

type Point = { x: number; y: number };

type SignatureCanvasFieldProps = {
  label: string;
  description?: string;
  value: string | null;
  onChange: (nextValue: string | null) => void;
  heightClassName?: string;
};

const getCanvasPoint = (canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>): Point => {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
  };
};

export default function SignatureCanvasField({
  label,
  description,
  value,
  onChange,
  heightClassName = "h-40",
}: SignatureCanvasFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const hasInkRef = useRef(false);

  const ensureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    return { canvas, context };
  }, []);

  const resetCanvas = useCallback(() => {
    const canvasState = ensureCanvas();
    if (!canvasState) {
      return;
    }

    const { canvas, context } = canvasState;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111111";
    hasInkRef.current = false;
    lastPointRef.current = null;
  }, [ensureCanvas]);

  const resizeCanvas = useCallback(() => {
    const canvasState = ensureCanvas();
    if (!canvasState) {
      return;
    }

    const { canvas, context } = canvasState;
    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const nextWidth = Math.max(Math.round(rect.width * devicePixelRatio), 1);
    const nextHeight = Math.max(Math.round(rect.height * devicePixelRatio), 1);

    if (canvas.width === nextWidth && canvas.height === nextHeight) {
      return;
    }

    canvas.width = nextWidth;
    canvas.height = nextHeight;
    context.setTransform(1, 0, 0, 1, 0, 0);
    resetCanvas();
  }, [ensureCanvas, resetCanvas]);

  const drawLine = useCallback((from: Point, to: Point) => {
    const canvasState = ensureCanvas();
    if (!canvasState) {
      return;
    }

    const { context } = canvasState;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }, [ensureCanvas]);

  const beginDraw = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvasState = ensureCanvas();
    if (!canvasState) {
      return;
    }

    const point = getCanvasPoint(canvasState.canvas, event);
    isDrawingRef.current = true;
    lastPointRef.current = point;
    hasInkRef.current = true;
    canvasState.canvas.setPointerCapture(event.pointerId);
  }, [ensureCanvas]);

  const continueDraw = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) {
      return;
    }

    const canvasState = ensureCanvas();
    if (!canvasState) {
      return;
    }

    const nextPoint = getCanvasPoint(canvasState.canvas, event);
    const lastPoint = lastPointRef.current;
    if (!lastPoint) {
      lastPointRef.current = nextPoint;
      return;
    }

    drawLine(lastPoint, nextPoint);
    lastPointRef.current = nextPoint;
  }, [drawLine, ensureCanvas]);

  const endDraw = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvasState = ensureCanvas();
    if (!canvasState) {
      return;
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasState.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture races.
    }

    if (hasInkRef.current) {
      onChange(canvasState.canvas.toDataURL("image/png"));
    }
  }, [ensureCanvas, onChange]);

  const clear = useCallback(() => {
    resetCanvas();
    onChange(null);
  }, [onChange, resetCanvas]);

  const signaturePreview = useMemo(() => {
    return value ? (
      <img alt={`${label} preview`} className="max-h-24 max-w-full rounded-md border border-Color-Scheme-1-Border/30 bg-white object-contain p-2" src={value} />
    ) : null;
  }, [label, value]);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">{label}</div>
          {description ? <div className="mt-1 text-xs leading-5 text-Color-Neutral">{description}</div> : null}
        </div>
        <button
          className="rounded-md bg-Color-Neutral-Lightest px-3 py-1.5 text-xs font-medium text-Color-Scheme-1-Text transition hover:bg-Color-Neutral-Lighter"
          onClick={clear}
          type="button"
        >
          Clear
        </button>
      </div>
      {signaturePreview}
      <canvas
        ref={canvasRef}
        className={`${heightClassName} w-full rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]`}
        onPointerDown={beginDraw}
        onPointerMove={continueDraw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
      />
    </div>
  );
}
