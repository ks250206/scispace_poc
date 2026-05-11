import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from "react";
import type { ViewportState } from "../../domain/types";
import {
  baseDotSpacing,
  baseMajorGridSpacing,
  maxScale,
  minScale,
  wheelPanSensitivity,
} from "./workbenchView";

type WorkspacePanZoomOptions = {
  blurActiveWindow: () => void;
  setViewport: (viewport: ViewportState) => void;
  viewport: ViewportState;
};

export function useWorkspacePanZoom({
  blurActiveWindow,
  setViewport,
  viewport,
}: WorkspacePanZoomOptions) {
  const [isPanning, setIsPanning] = useState(false);
  const canvasDrag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null,
  );

  const canvasStyle = useMemo(
    () => ({
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
    }),
    [viewport],
  );

  const canvasShellStyle = useMemo(
    () =>
      ({
        "--canvas-dot-step": `${Number((baseDotSpacing * viewport.scale).toFixed(2))}px`,
        "--canvas-major-step": `${Number((baseMajorGridSpacing * viewport.scale).toFixed(2))}px`,
        "--canvas-dot-x": `${Number(viewport.x.toFixed(2))}px`,
        "--canvas-dot-y": `${Number(viewport.y.toFixed(2))}px`,
      }) as CSSProperties,
    [viewport],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (!event.metaKey && !event.ctrlKey && target.closest(".canvas-window")) return;
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        const nextScale = Math.min(
          maxScale,
          Math.max(minScale, viewport.scale - event.deltaY * 0.001),
        );
        const scale = Number(nextScale.toFixed(2));
        const centerX = event.clientX;
        const centerY = event.clientY;
        const worldCenterX = (centerX - viewport.x) / viewport.scale;
        const worldCenterY = (centerY - viewport.y) / viewport.scale;
        setViewport({
          ...viewport,
          x: centerX - worldCenterX * scale,
          y: centerY - worldCenterY * scale,
          scale,
        });
        return;
      }
      const horizontalDelta = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX;
      const panStep = wheelPanSensitivity * viewport.scale;
      setViewport({
        ...viewport,
        x: viewport.x - horizontalDelta * panStep,
        y: viewport.y - (event.shiftKey ? 0 : event.deltaY * panStep),
      });
    },
    [setViewport, viewport],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const isBackground =
        target.classList.contains("canvas-shell") || target.classList.contains("workspace-plane");
      if (event.button === 0 && isBackground) blurActiveWindow();
      if (event.button !== 1 && !event.altKey && !(event.button === 0 && isBackground)) return;
      canvasDrag.current = {
        x: event.clientX,
        y: event.clientY,
        originX: viewport.x,
        originY: viewport.y,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [blurActiveWindow, viewport.x, viewport.y],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (canvasDrag.current) {
        const drag = canvasDrag.current;
        setViewport({
          ...viewport,
          x: drag.originX + event.clientX - drag.x,
          y: drag.originY + event.clientY - drag.y,
        });
      }
    },
    [setViewport, viewport],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    canvasDrag.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return {
    canvasShellStyle,
    canvasStyle,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    isPanning,
  };
}
