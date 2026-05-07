import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("Workbench UI", () => {
  it("renders a filesystem browser, table window, plot window, and draggable terminal window", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    expect(screen.getByText("~/raw")).toBeInTheDocument();
    expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("160 rows · virtualized")).toBeInTheDocument();
    expect(screen.getByText("Plot - waveform.csv")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("opens the table path from the data browser selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByText("SciSpace")).toBeInTheDocument());
    const fileButton = screen.getByRole("button", { name: /waveform\.csv/ });
    await user.click(fileButton);

    expect(fileButton).toHaveClass("selected");
    expect(screen.getByText("Table - waveform.csv")).toBeInTheDocument();
  });
});
