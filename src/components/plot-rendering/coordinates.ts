import uPlot from "uplot";

const minRenderScale = 0.1;

const plotCoordinateScale = (workspaceScale: number, renderScale: number): number => {
  const safeWorkspaceScale = Math.max(minRenderScale, workspaceScale || 1);
  return renderScale / safeWorkspaceScale;
};

export const normalizePlotClientPoint = (
  client: { x: number; y: number },
  rect: Pick<DOMRect, "left" | "top">,
  workspaceScale: number,
  renderScale: number,
): { left: number; top: number } => {
  const coordinateScale = plotCoordinateScale(workspaceScale, renderScale);
  return {
    left: (client.x - rect.left) * coordinateScale,
    top: (client.y - rect.top) * coordinateScale,
  };
};

export const plotPositionFromClient = normalizePlotClientPoint;

export const plotSizeFromRenderedRect = (
  rect: Pick<DOMRect, "width" | "height">,
  workspaceScale: number,
  renderScale: number,
): { width: number; height: number } => {
  const coordinateScale = plotCoordinateScale(workspaceScale, renderScale);
  return {
    width: rect.width * coordinateScale,
    height: rect.height * coordinateScale,
  };
};

export const scaledPlotClientPoint = (
  client: { x: number; y: number },
  rect: Pick<DOMRect, "left" | "top">,
  workspaceScale: number,
  renderScale: number,
): { x: number; y: number } => {
  const position = normalizePlotClientPoint(client, rect, workspaceScale, renderScale);
  return {
    x: rect.left + position.left,
    y: rect.top + position.top,
  };
};

const plotMouseEventInit = (
  event: MouseEvent,
  client: { x: number; y: number },
  coordinateScale: number,
): MouseEventInit =>
  ({
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    view: event.view,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: client.x,
    clientY: client.y,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
    relatedTarget: event.relatedTarget,
    movementX: event.movementX * coordinateScale,
    movementY: event.movementY * coordinateScale,
  }) as MouseEventInit;

export const createScaledPlotMouseEvent = (
  event: MouseEvent,
  target: HTMLElement,
  workspaceScale: number,
  renderScale: number,
): MouseEvent => {
  const rect = target.getBoundingClientRect();
  const client = scaledPlotClientPoint(
    { x: event.clientX, y: event.clientY },
    rect,
    workspaceScale,
    renderScale,
  );
  return new MouseEvent(
    event.type,
    plotMouseEventInit(event, client, plotCoordinateScale(workspaceScale, renderScale)),
  );
};

const bindScaledPlotMouse =
  (workspaceScale: number, renderScale: number): uPlot.Cursor.MouseListenerFactory =>
  (_, target, handler) =>
  (event) => {
    if (!target.classList.contains("u-over")) {
      handler(event);
      return null;
    }
    const scaledEvent = createScaledPlotMouseEvent(event, target, workspaceScale, renderScale);
    handler(scaledEvent);
    if (scaledEvent.defaultPrevented) event.preventDefault();
    return null;
  };

export const scaledPlotCursorBind = (
  workspaceScale: number,
  renderScale: number,
): uPlot.Cursor.Bind => {
  const bind = bindScaledPlotMouse(workspaceScale, renderScale);
  return {
    mousedown: bind,
    mouseup: bind,
    click: bind,
    dblclick: bind,
    mousemove: bind,
    mouseleave: bind,
    mouseenter: bind,
  };
};

export const plotScaleRange = (
  scale: Pick<uPlot.Scale, "min" | "max"> | undefined,
): { min: number; max: number } | undefined => {
  const min = Number(scale?.min);
  const max = Number(scale?.max);
  return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : undefined;
};
