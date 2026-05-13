import type { ChangeEvent, DragEvent } from "react";
import { uploadOpenCommand } from "../DataBrowser";
import type { useDialog } from "../dialog/DialogProvider";
import type { useScispaceStore } from "../../store/scispaceStore";
import { quoteCommandArg } from "./workbenchView";

interface UseWorkbenchDataActionsOptions {
  dialog: ReturnType<typeof useDialog>;
  runScispace: ReturnType<typeof useScispaceStore.getState>["runScispace"];
  stageUploadPayload: (fileName: string, text: string, mode?: "tabular" | "raw") => string;
}

export const useWorkbenchDataActions = ({
  dialog,
  runScispace,
  stageUploadPayload,
}: UseWorkbenchDataActionsOptions) => {
  const openFiles = async (files: File[]) => {
    for (const file of files) {
      const text = await file.text();
      const uploadId = stageUploadPayload(file.name, text);
      void runScispace(uploadOpenCommand(uploadId, file.name), { source: "gui" });
    }
  };

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    await openFiles(Array.from(event.dataTransfer.files));
  };

  const handleLoadDataFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await openFiles(files);
  };

  const handleNewFolder = async () => {
    const name = await dialog.prompt({
      title: "Folder name",
      defaultValue: "New Folder",
      confirmLabel: "Create",
    });
    if (name) void runScispace(`file-mkdir ~/raw/${quoteCommandArg(name)}`, { source: "gui" });
  };

  return { handleDrop, handleLoadDataFiles, handleNewFolder };
};
