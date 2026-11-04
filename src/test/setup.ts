import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import "fake-indexeddb/auto";
import { afterEach } from "vite-plus/test";

afterEach(() => cleanup());

// The Node TextEncoder and just-bash need to agree on the Uint8Array realm.
const nodeUint8Array = new TextEncoder().encode("").constructor as Uint8ArrayConstructor;
if (nodeUint8Array !== Uint8Array) {
  globalThis.Uint8Array = nodeUint8Array;
}

Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => `test-${Math.random().toString(16).slice(2)}`,
  },
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

class Path2DStub {
  constructor(_path?: string | Path2D) {}
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
}

globalThis.Path2D = Path2DStub as unknown as typeof Path2D;

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value() {
    return {
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      rect: () => {},
      fill: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      rotate: () => {},
      scale: () => {},
      translate: () => {},
      setTransform: () => {},
      resetTransform: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (text: string) => ({ width: text.length * 7 }),
      setLineDash: () => {},
      drawImage: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => null,
      arc: () => {},
      clip: () => {},
      canvas: this,
    } as unknown as CanvasRenderingContext2D;
  },
});
