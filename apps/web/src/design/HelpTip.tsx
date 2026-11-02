import "@/design/HelpTip.css";
import { useRef, useState, type ReactNode } from "react";
import { Popover } from "radix-ui";
import { Icons } from "@/design/icons";

type Props = { label: string; children: ReactNode };

export function HelpTip({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const pointerPressed = useRef(false);

  function change(next: boolean) {
    setOpen(next);
    if (!next) {
      setPinned(false);
    }
  }

  function preview(next: boolean) {
    if (!pinned) {
      setOpen(next);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={change}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="aegis-help-tip"
          aria-label={label}
          onPointerDown={() => {
            pointerPressed.current = true;
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") {
              preview(true);
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") {
              preview(false);
            }
          }}
          onFocus={() => {
            if (!pointerPressed.current) {
              preview(true);
            }
          }}
          onBlur={() => {
            pointerPressed.current = false;
            preview(false);
          }}
          onClick={(event) => {
            event.preventDefault();
            pointerPressed.current = false;
            if (open && pinned) {
              change(false);
            } else {
              setOpen(true);
              setPinned(true);
            }
          }}
        >
          <Icons.CircleHelp size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="aegis-help-tip__content"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {children}
          <Popover.Arrow className="aegis-help-tip__arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
