import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { DialogProvider, useDialog } from "./DialogProvider";

function DialogHarness() {
  const dialog = useDialog();
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const confirmed = await dialog.confirm({
            title: "Confirm action",
            message: "Proceed?",
            confirmLabel: "Proceed",
          });
          document.body.dataset.confirmed = String(confirmed);
        }}
      >
        Open confirm
      </button>
      <button
        type="button"
        onClick={async () => {
          const value = await dialog.prompt({
            title: "Prompt value",
            defaultValue: "initial",
            confirmLabel: "Apply",
          });
          document.body.dataset.promptValue = value ?? "cancelled";
        }}
      >
        Open prompt
      </button>
      <button
        type="button"
        onClick={async () => {
          await dialog.confirm({
            title: "Delete value",
            message: "Delete?",
            confirmLabel: "Delete",
            tone: "destructive",
          });
        }}
      >
        Open destructive
      </button>
    </div>
  );
}

const renderHarness = () =>
  render(
    <DialogProvider>
      <DialogHarness />
    </DialogProvider>,
  );

describe("DialogProvider", () => {
  it("resolves confirm dialogs from confirm and cancel actions", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open confirm" }));
    await user.click(screen.getByRole("button", { name: "Proceed" }));
    await waitFor(() => expect(document.body.dataset.confirmed).toBe("true"));

    await user.click(screen.getByRole("button", { name: "Open confirm" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.body.dataset.confirmed).toBe("false"));
  });

  it("resolves prompt dialogs with edited text or null on escape", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open prompt" }));
    const input = screen.getByRole("textbox", { name: "Prompt value" });
    expect(input).toHaveValue("initial");
    fireEvent.change(input, { target: { value: "edited" } });
    expect(input).toHaveValue("edited");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(document.body.dataset.promptValue).toBe("edited"));

    await user.click(screen.getByRole("button", { name: "Open prompt" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.body.dataset.promptValue).toBe("cancelled"));
  });

  it("marks destructive confirm buttons", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open destructive" }));
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("danger");
  });
});
