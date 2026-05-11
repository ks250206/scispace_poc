import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ContextMenuActionItem {
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  rightLabel?: string;
  rightAriaLabel?: string;
  onSelect: () => void;
  onRightSelect?: () => void;
}

export type ContextMenuItem =
  | ContextMenuActionItem
  | {
      kind: "separator";
      label?: string;
    }
  | {
      kind: "submenu";
      label: string;
      items: ContextMenuItem[];
      disabled?: boolean;
    };

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

function ContextMenuItems({
  items,
  closeContextMenu,
}: {
  items: ContextMenuItem[];
  closeContextMenu: () => void;
}) {
  return (
    <>
      {items.map((item, index) => {
        if ("kind" in item && item.kind === "separator") {
          return (
            <div key={`separator-${item.label ?? index}`} className="context-menu-separator" />
          );
        }
        if ("kind" in item && item.kind === "submenu") {
          return (
            <div
              key={`submenu-${item.label}-${index}`}
              className={`context-menu-row context-menu-submenu-root ${
                item.disabled ? "disabled" : ""
              }`}
            >
              <button
                type="button"
                role="menuitem"
                aria-label={item.label}
                disabled={item.disabled}
                className="context-menu-item-main"
              >
                <span className="context-menu-check" />
                <span className="context-menu-label">{item.label}</span>
                <span className="context-menu-arrow">›</span>
              </button>
              <div className="context-submenu" role="menu" aria-label={`${item.label} submenu`}>
                <ContextMenuItems items={item.items} closeContextMenu={closeContextMenu} />
              </div>
            </div>
          );
        }
        return (
          <div
            key={`item-${item.ariaLabel ?? item.label}-${index}`}
            className={`context-menu-row ${item.active ? "active" : ""} ${
              item.danger ? "danger" : ""
            }`}
          >
            <button
              type="button"
              role="menuitem"
              aria-label={item.ariaLabel}
              disabled={item.disabled}
              className="context-menu-item-main"
              onClick={() => {
                closeContextMenu();
                item.onSelect();
              }}
            >
              <span className="context-menu-check">{item.active ? "✓" : ""}</span>
              <span className="context-menu-label">{item.label}</span>
            </button>
            {item.rightLabel ? (
              <button
                type="button"
                className="context-menu-item-right"
                aria-label={item.rightAriaLabel ?? item.rightLabel}
                disabled={item.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  closeContextMenu();
                  item.onRightSelect?.();
                }}
              >
                {item.rightLabel}
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

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
          <ContextMenuItems items={menu.items} closeContextMenu={closeContextMenu} />
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
