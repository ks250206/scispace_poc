import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWorkbench, setupWorkbenchSuite, storeState } from "./workbenchTestUtils";

describe("Workbench workspace UI", () => {
  setupWorkbenchSuite();

  it("renders a filesystem browser, table window, plot window, and draggable terminal window", async () => {
    await renderWorkbench();
    expect(screen.getByText("~/raw")).toBeInTheDocument();
    expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("160 rows · virtualized")).toBeInTheDocument();
    expect(screen.getByText("Plot - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Command History")).toBeInTheDocument();
    expect(screen.getByText("No scispace commands yet.")).toBeInTheDocument();
  });

  it("pans the workspace from empty background drag without panning from windows", async () => {
    await renderWorkbench();
    const plane = document.querySelector(".workspace-plane") as HTMLElement;
    const windowFrame = document.querySelector(".canvas-window") as HTMLElement;

    fireEvent.pointerDown(plane, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(document.querySelector(".workbench") as HTMLElement, {
      clientX: 42,
      clientY: 55,
      pointerId: 1,
    });
    fireEvent.pointerUp(document.querySelector(".workbench") as HTMLElement, { pointerId: 1 });
    expect(storeState().viewport).toMatchObject({ x: -1888, y: -1035 });

    storeState().setViewport({ x: 0, y: 0, scale: 1 });
    fireEvent.pointerDown(windowFrame, { button: 0, clientX: 10, clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(document.querySelector(".workbench") as HTMLElement, {
      clientX: 42,
      clientY: 55,
      pointerId: 2,
    });
    fireEvent.pointerUp(document.querySelector(".workbench") as HTMLElement, { pointerId: 2 });
    expect(storeState().viewport).toMatchObject({ x: 0, y: 0 });
  });

  it("pans the workspace with wheel and keeps ctrl wheel as zoom", async () => {
    const user = userEvent.setup();
    await renderWorkbench();
    const shell = document.querySelector(".canvas-shell") as HTMLElement;
    expect(shell).toHaveAttribute("data-grid-mode", "dots");
    expect(shell.style.getPropertyValue("--canvas-dot-step")).toBe("24px");
    expect(shell.style.getPropertyValue("--canvas-major-step")).toBe("240px");

    fireEvent.wheel(shell, { deltaY: 120 });
    expect(storeState().viewport).toMatchObject({ x: -1920, y: -1170, scale: 1 });

    await user.click(screen.getByRole("button", { name: "Reset View" }));
    fireEvent.wheel(shell, { deltaY: 120, shiftKey: true });
    expect(storeState().viewport).toMatchObject({ x: -2010, y: -1080, scale: 1 });

    await user.click(screen.getByRole("button", { name: "Reset View" }));
    fireEvent.wheel(shell, { deltaX: 120, deltaY: 0, shiftKey: true });
    expect(storeState().viewport).toMatchObject({ x: -2010, y: -1080, scale: 1 });

    await user.click(screen.getByRole("button", { name: "Reset View" }));
    fireEvent.wheel(shell, { deltaX: 40 });
    expect(storeState().viewport).toMatchObject({ x: -1950, y: -1080, scale: 1 });

    act(() => storeState().setViewport({ x: -1920, y: -1080, scale: 0.5 }));
    fireEvent.wheel(shell, { deltaY: 120 });
    expect(storeState().viewport).toMatchObject({
      x: -1920,
      y: -1125,
      scale: 0.5,
    });
    expect(shell).toHaveAttribute("data-grid-mode", "dots");

    act(() => storeState().setViewport({ x: -1920, y: -1080, scale: 0.49 }));
    expect(shell).toHaveAttribute("data-grid-mode", "overview");
    expect(shell.style.getPropertyValue("--canvas-major-step")).toBe("117.6px");

    act(() => storeState().setViewport({ x: -1920, y: -1080, scale: 2 }));
    fireEvent.wheel(shell, { deltaY: 120, shiftKey: true });
    expect(storeState().viewport).toMatchObject({
      x: -2100,
      y: -1080,
      scale: 2,
    });

    await user.click(screen.getByRole("button", { name: "Reset View" }));
    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: 100, ctrlKey: true });
    expect(storeState().viewport).toMatchObject({
      x: -1680,
      y: -940,
      scale: 0.9,
    });
    expect(shell.style.getPropertyValue("--canvas-dot-step")).toBe("21.6px");

    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: 5000, ctrlKey: true });
    expect(storeState().viewport.scale).toBe(0.1);

    fireEvent.wheel(shell, { clientX: 480, clientY: 320, deltaY: -5000, ctrlKey: true });
    expect(storeState().viewport.scale).toBe(3);
  });
});
