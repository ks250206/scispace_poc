import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("Workbench UI", () => {
  it("renders a filesystem browser, table window, plot window, and bottom terminal", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.getByText("~/raw")).toBeInTheDocument();
    expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("Plot - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });
});
