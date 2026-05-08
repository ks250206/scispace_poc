import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type DialogTone = "default" | "destructive";

interface BaseDialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  tone?: DialogTone;
}

interface PromptOptions extends BaseDialogOptions {
  defaultValue?: string;
}

interface DialogApi {
  alert: (options: BaseDialogOptions) => Promise<void>;
  confirm: (options: BaseDialogOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

type DialogRequest =
  | (BaseDialogOptions & {
      kind: "alert";
      resolve: () => void;
    })
  | (BaseDialogOptions & {
      kind: "confirm";
      resolve: (value: boolean) => void;
    })
  | (PromptOptions & {
      kind: "prompt";
      resolve: (value: string | null) => void;
    });

const DialogContext = createContext<DialogApi | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest>();
  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const openDialog = useCallback((nextRequest: DialogRequest) => {
    setPromptValue(nextRequest.kind === "prompt" ? (nextRequest.defaultValue ?? "") : "");
    setRequest(nextRequest);
  }, []);

  const closeDialog = useCallback(
    (confirmed: boolean) => {
      if (!request) return;
      if (request.kind === "alert") {
        request.resolve();
      } else if (request.kind === "confirm") {
        request.resolve(confirmed);
      } else {
        request.resolve(confirmed ? promptValue : null);
      }
      setRequest(undefined);
    },
    [promptValue, request],
  );

  const alert = useCallback(
    (options: BaseDialogOptions) =>
      new Promise<void>((resolve) => openDialog({ ...options, kind: "alert", resolve })),
    [openDialog],
  );

  const confirm = useCallback(
    (options: BaseDialogOptions) =>
      new Promise<boolean>((resolve) => openDialog({ ...options, kind: "confirm", resolve })),
    [openDialog],
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => openDialog({ ...options, kind: "prompt", resolve })),
    [openDialog],
  );

  useEffect(() => {
    if (!request) return;
    window.requestAnimationFrame(() => {
      if (request.kind === "prompt") {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        confirmButtonRef.current?.focus();
      }
    });
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDialog, request]);

  const submitDialog = (event: FormEvent) => {
    event.preventDefault();
    closeDialog(true);
  };

  const confirmLabel =
    request?.confirmLabel ??
    (request?.kind === "alert" ? "OK" : request?.kind === "prompt" ? "Save" : "Confirm");

  return (
    <DialogContext.Provider value={{ alert, confirm, prompt }}>
      {children}
      {request ? (
        <div
          className="app-dialog-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog(false);
          }}
        >
          <form
            className={`app-dialog ${request.tone === "destructive" ? "destructive" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            onSubmit={submitDialog}
          >
            <header className="app-dialog-header">
              <h2 id="app-dialog-title">{request.title}</h2>
            </header>
            {request.message ? <p className="app-dialog-message">{request.message}</p> : null}
            {request.kind === "prompt" ? (
              <input
                ref={inputRef}
                className="app-dialog-input"
                aria-label={request.title}
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
              />
            ) : null}
            <div className="app-dialog-actions">
              {request.kind !== "alert" ? (
                <button type="button" onClick={() => closeDialog(false)}>
                  Cancel
                </button>
              ) : null}
              <button
                ref={confirmButtonRef}
                type="submit"
                className={request.tone === "destructive" ? "danger" : "primary"}
              >
                {confirmLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used inside DialogProvider");
  return context;
}
