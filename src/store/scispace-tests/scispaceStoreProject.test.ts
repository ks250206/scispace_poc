import { describe, expect, it } from "vite-plus/test";
import { makeStore, openImport } from "./scispaceStoreTestUtils";

describe("scispace store project behavior", () => {
  it("resets Zustand and Dexie to a fresh project", async () => {
    const { db, store } = await makeStore();
    openImport(store, "pending.csv", "x,y\n1,2");
    await store.getState().importTextFile("sample.csv", "x,y\n0,1");
    await store.getState().runScispace("elt waveform.csv as derived.csv");
    store.getState().closeWindow("table-seed");
    store.getState().setViewport({ x: 32, y: 48, scale: 0.8 });

    await store.getState().createNewProject();

    const state = store.getState();
    expect(state.files.map((file) => file.path)).toEqual(["~/raw/waveform.csv"]);
    expect(state.datasets.map((dataset) => dataset.id)).toEqual(["seed-waveform"]);
    expect(state.windows.map((window) => window.kind)).toEqual([
      "browser",
      "table",
      "plot",
      "terminal",
      "history",
    ]);
    expect(state.plotSpecs.map((plot) => plot.id)).toEqual(["seed-plot"]);
    expect(state.pendingImports).toHaveLength(0);
    expect(state.terminalEvents).toHaveLength(0);
    expect(state.commandHistory).toHaveLength(0);
    expect(state.activeDatasetId).toBe("seed-waveform");
    expect(state.activeWindowId).toBeUndefined();
    expect(state.currentPlotId).toBe("seed-plot");
    expect(state.viewport).toEqual({ x: -1920, y: -1080, scale: 1 });
    expect(await db.files.get("~/raw/sample.csv")).toBeUndefined();
    expect((await db.datasets.toArray()).some((dataset) => dataset.name === "derived.csv")).toBe(
      false,
    );
    expect((await db.layout.get("main"))?.value.windows.map((window) => window.kind)).toEqual([
      "browser",
      "table",
      "plot",
      "terminal",
      "history",
    ]);
  });

  it("saves the current project before creating and switching projects", async () => {
    const { db, store } = await makeStore();
    const firstProjectId = store.getState().currentProjectId;

    await store.getState().runScispace("elt waveform.csv as derived.csv");
    await store.getState().createNewProject("Second Project");

    const secondProjectId = store.getState().currentProjectId;
    expect(secondProjectId).not.toBe(firstProjectId);
    expect(store.getState().projects.map((project) => project.name)).toContain("Second Project");
    expect(store.getState().datasets.map((dataset) => dataset.name)).toEqual(["waveform.csv"]);

    expect(
      (await db.projects.get(firstProjectId ?? ""))?.datasets.map((dataset) => dataset.name),
    ).toContain("derived.csv");

    await store.getState().switchProject(firstProjectId ?? "");

    expect(store.getState().currentProjectId).toBe(firstProjectId);
    expect(store.getState().datasets.map((dataset) => dataset.name)).toContain("derived.csv");
    expect((await db.layout.get("main"))?.value.currentProjectId).toBe(firstProjectId);
  });

  it("renames saved projects and deletes non-current projects", async () => {
    const { db, store } = await makeStore();
    const firstProjectId = store.getState().currentProjectId;

    await store.getState().saveCurrentProject("Analysis");
    expect(
      store.getState().projects.find((project) => project.id === firstProjectId),
    ).toMatchObject({
      name: "Analysis",
    });
    expect(await db.projects.get(firstProjectId ?? "")).toMatchObject({ name: "Analysis" });

    await store.getState().createNewProject("Scratch");
    const secondProjectId = store.getState().currentProjectId;
    await store.getState().deleteProject(firstProjectId ?? "");

    expect(store.getState().currentProjectId).toBe(secondProjectId);
    expect(store.getState().projects.some((project) => project.id === firstProjectId)).toBe(false);
    expect(await db.projects.get(firstProjectId ?? "")).toBeUndefined();
  });

  it("tracks project dirty state and clears it when saving or switching projects", async () => {
    const { store } = await makeStore();
    const firstProjectId = store.getState().currentProjectId;

    expect(store.getState().projectDirty).toBe(false);

    await store.getState().runScispace("elt waveform.csv as derived.csv", { source: "gui" });
    expect(store.getState().projectDirty).toBe(true);

    await store.getState().saveCurrentProject();
    expect(store.getState().projectDirty).toBe(false);

    await store.getState().createNewProject("Scratch");
    expect(store.getState().projectDirty).toBe(false);

    await store.getState().runScispace("elt waveform.csv as scratch-derived.csv", {
      source: "gui",
    });
    expect(store.getState().projectDirty).toBe(true);

    await store.getState().switchProject(firstProjectId ?? "");
    expect(store.getState().projectDirty).toBe(false);
  });

  it("normalizes blank and duplicate project names", async () => {
    const { store } = await makeStore();
    const firstProjectId = store.getState().currentProjectId;

    await store.getState().saveCurrentProject("Analysis");
    await store.getState().createNewProject("Analysis");
    await store.getState().saveCurrentProject("   ");

    const projects = store.getState().projects;
    expect(projects.find((project) => project.id === firstProjectId)?.name).toBe("Analysis");
    expect(projects.map((project) => project.name)).toContain("Analysis (1)");
  });

  it("exports and imports project json as a new project", async () => {
    const { db, store } = await makeStore();
    await store.getState().saveCurrentProject("Analysis");
    await store.getState().runScispace("elt waveform.csv as derived.csv");

    const exported = await store.getState().exportCurrentProjectJson();
    await store.getState().createNewProject("Scratch");
    await store.getState().importProjectJson(exported);

    expect(store.getState().projects.map((project) => project.name)).toContain("Analysis (1)");
    expect(store.getState().projectDirty).toBe(false);
    expect(store.getState().datasets.map((dataset) => dataset.name)).toContain("derived.csv");
    expect((await db.projects.toArray()).map((project) => project.name)).toContain("Analysis (1)");
    expect((await db.layout.get("main"))?.value.currentProjectId).toBe(
      store.getState().currentProjectId,
    );
  });

  it("rejects invalid project json", async () => {
    const { store } = await makeStore();

    await expect(
      store.getState().importProjectJson(JSON.stringify({ nope: true })),
    ).rejects.toThrow("Project JSON must contain files and datasets arrays");
  });
});
