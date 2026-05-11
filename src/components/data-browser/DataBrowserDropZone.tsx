import { type RefObject } from "react";

type DataBrowserDropZoneProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onOpenFiles: (files: File[]) => void;
};

export function DataBrowserDropZone({ fileInputRef, onOpenFiles }: DataBrowserDropZoneProps) {
  return (
    <>
      <button
        type="button"
        className="drop-hint"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <strong>Drop files here</strong>
        <span>Click to load, or drop files. Raw text can be parsed in the preview window.</span>
      </button>
      <input
        ref={fileInputRef}
        aria-label="Load data files"
        className="visually-hidden"
        multiple
        type="file"
        onChange={(event) => {
          onOpenFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}
