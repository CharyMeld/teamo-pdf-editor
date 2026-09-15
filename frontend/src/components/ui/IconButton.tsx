import type { ButtonHTMLAttributes } from "react";
import Icon, { type IconName } from "./Icon";
import Tooltip from "./Tooltip";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}

/** Icon-only button. Always accessible: `label` becomes both the
 * aria-label and the tooltip text, so there is never an icon-only control
 * with no accessible name. */
export default function IconButton({
  icon,
  label,
  active = false,
  size = "md",
  className = "",
  disabled,
  ...rest
}: IconButtonProps) {
  const dimension = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <Tooltip text={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        className={[
          "inline-flex items-center justify-center rounded-md text-text-muted transition-colors",
          "hover:bg-surface-muted hover:text-text",
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
          active ? "bg-accent-subtle text-accent-subtle-text" : "",
          dimension,
          className,
        ].join(" ")}
        {...rest}
      >
        <Icon name={icon} />
      </button>
    </Tooltip>
  );
}
