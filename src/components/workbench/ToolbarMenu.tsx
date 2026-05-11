import type { ContextMenuItem } from "../context-menu/ContextMenuProvider";

export interface ToolbarActionItem {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  active?: boolean;
  rightLabel?: string;
  onRightSelect?: () => void;
  rightAriaLabel?: string;
}

export type ToolbarMenuItem =
  | ToolbarActionItem
  | {
      kind: "separator";
      label?: string;
    }
  | {
      kind: "submenu";
      label: string;
      items: ToolbarMenuItem[];
      disabled?: boolean;
    };

interface ToolbarActionItemProps {
  item: ToolbarActionItem;
  setOpenMenu: (label: string | undefined) => void;
}

function ToolbarActionItem({ item, setOpenMenu }: ToolbarActionItemProps) {
  const { label, onSelect, disabled, active, rightLabel, onRightSelect, rightAriaLabel } = item;
  return (
    <div className={`toolbar-menu-row ${active ? "active" : ""}`}>
      <button
        type="button"
        role="menuitem"
        aria-label={label}
        disabled={disabled}
        className="toolbar-menu-item-main"
        onClick={() => {
          setOpenMenu(undefined);
          onSelect?.();
        }}
      >
        <span className="toolbar-menu-check">{active ? "✓" : ""}</span>
        <span className="toolbar-menu-label">{label}</span>
      </button>
      {rightLabel ? (
        <button
          type="button"
          className="toolbar-menu-item-right"
          aria-label={rightAriaLabel ?? rightLabel}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            setOpenMenu(undefined);
            onRightSelect?.();
          }}
        >
          {rightLabel}
        </button>
      ) : null}
    </div>
  );
}

function ToolbarMenuContent({
  items,
  setOpenMenu,
}: {
  items: ToolbarMenuItem[];
  setOpenMenu: (label: string | undefined) => void;
}) {
  return (
    <>
      {items.map((item, index) => {
        if ("kind" in item && item.kind === "separator") {
          return (
            <div key={`separator-${item.label ?? index}`} className="toolbar-menu-separator" />
          );
        }
        if ("kind" in item && item.kind === "submenu") {
          return (
            <div
              key={item.label}
              className={`toolbar-menu-row toolbar-menu-submenu-root ${
                item.disabled ? "disabled" : ""
              }`}
            >
              <button
                type="button"
                role="menuitem"
                aria-label={item.label}
                disabled={item.disabled}
                className="toolbar-menu-item-main"
              >
                <span className="toolbar-menu-check" />
                <span className="toolbar-menu-label">{item.label}</span>
                <span className="toolbar-menu-arrow">›</span>
              </button>
              <div className="toolbar-submenu" role="menu" aria-label={`${item.label} submenu`}>
                <ToolbarMenuContent items={item.items} setOpenMenu={setOpenMenu} />
              </div>
            </div>
          );
        }
        return <ToolbarActionItem key={item.label} item={item} setOpenMenu={setOpenMenu} />;
      })}
    </>
  );
}

export interface ToolbarMenuProps {
  label: string;
  openMenu: string | undefined;
  setOpenMenu: (label: string | undefined) => void;
  items: ToolbarMenuItem[];
}

export function ToolbarMenu({ label, openMenu, setOpenMenu, items }: ToolbarMenuProps) {
  const isOpen = openMenu === label;
  return (
    <div
      className="toolbar-menu-root"
      onPointerEnter={() => {
        if (openMenu && !isOpen) setOpenMenu(label);
      }}
    >
      <button
        type="button"
        className="toolbar-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpenMenu(isOpen ? undefined : label)}
      >
        {label}
      </button>
      {isOpen ? (
        <div className="toolbar-menu" role="menu" aria-label={`${label} menu`}>
          <ToolbarMenuContent items={items} setOpenMenu={setOpenMenu} />
        </div>
      ) : null}
    </div>
  );
}

export const toContextMenuItem = (item: ToolbarMenuItem): ContextMenuItem => {
  if ("kind" in item && item.kind === "separator") {
    return { kind: "separator", label: item.label };
  }
  if ("kind" in item && item.kind === "submenu") {
    return {
      kind: "submenu",
      label: item.label,
      disabled: item.disabled,
      items: item.items.map(toContextMenuItem),
    };
  }
  return {
    label: item.label,
    disabled: item.disabled,
    active: item.active,
    rightLabel: item.rightLabel,
    rightAriaLabel: item.rightAriaLabel,
    onSelect: () => item.onSelect?.(),
    onRightSelect: item.onRightSelect,
  };
};
