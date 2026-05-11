import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ContextMenuItem {
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

interface ContextMenuRequest {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuItem[];
}

interface ContextMenuState extends ContextMenuRequest {
  id: number;
}

interface ContextMenuContextValue {
  openContextMenu: (request: ContextMenuRequest) => void;
  closeContextMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | undefined>(undefined);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState>();

  const closeContextMenu = useCallback(() => setMenu(undefined), []);
  const openContextMenu = useCallback((request: ContextMenuRequest) => {
    setMenu({ ...request, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest(".context-menu")) return;
      closeContextMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, [closeContextMenu, menu]);

  const value = useMemo(
    () => ({ openContextMenu, closeContextMenu }),
    [closeContextMenu, openContextMenu],
  );

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {menu ? (
        <div
          className="context-menu"
          role="menu"
          aria-label={menu.title ?? "Context menu"}
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {menu.title ? <div className="context-menu-title">{menu.title}</div> : null}
          {menu.items.map((item) => (
            <button
              key={`${menu.id}-${item.ariaLabel ?? item.label}`}
              type="button"
              role="menuitem"
              aria-label={item.ariaLabel}
              disabled={item.disabled}
              className={item.danger ? "danger" : undefined}
              onClick={() => {
                closeContextMenu();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) throw new Error("useContextMenu must be used inside ContextMenuProvider");
  return context;
}
