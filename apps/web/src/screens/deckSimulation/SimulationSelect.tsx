import type { ComponentProps } from "react";
import { Icons } from "@/design/icons";

type SimulationSelectProps = ComponentProps<"select"> & { wrapperClassName?: string };

export function SimulationSelect({ wrapperClassName, className, children, ...props }: SimulationSelectProps) {
  return (
    <span className={["deck-sim-select", wrapperClassName].filter(Boolean).join(" ")}>
      <select className={["deck-sim-select__control", className].filter(Boolean).join(" ")} {...props}>
        {children}
      </select>
      <span className="deck-sim-select__chevron" aria-hidden="true">
        <Icons.ChevronDown size={14} />
      </span>
    </span>
  );
}
