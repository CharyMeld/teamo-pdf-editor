import type { Command } from "../../commands/types";
import { BREAKPOINTS, useMediaQuery } from "../../hooks/useMediaQuery";
import Badge from "../ui/Badge";
import DropdownMenu from "../ui/DropdownMenu";
import Icon, { type IconName } from "../ui/Icon";
import Tooltip from "../ui/Tooltip";

interface CommandButtonProps {
  command: Command;
  /** Wires the real handler for commands whose `status` is "available" but
   * whose `run` depends on component-level state (e.g. zoom). Falls back
   * to `command.run` when omitted. */
  onRun?: () => void;
  /**
   * Phase 15 fix: `command.dropdown[]` sub-items (e.g. Rotate Left/Right
   * under the "Rotate" split button) are static registry data with no
   * `run` of their own — exactly like the top-level `command` itself,
   * they need their real handler looked up externally by id. Without
   * this, every dropdown sub-item's `onSelect` fell back to
   * `sub.run` (always `undefined`), so choosing it silently did
   * nothing — a real "dead button" caught by Phase 15's own
   * integration testing, not a hypothetical. Pass the same
   * `runHandlers` map `CommandGroup`/`MobileCommandSheet` already hold.
   */
  runHandlers?: Record<string, () => void>;
  /** Compact rendering for overflow menus / mobile action sheets instead
   * of the full ribbon card. */
  compact?: boolean;
  /** For an otherwise-implemented command that's temporarily inert because
   * of current app state (e.g. "Next Page" with no document open) rather
   * than because the feature doesn't exist yet. Renders disabled with this
   * specific reason instead of "not yet available". */
  disabledReason?: string;
}

/**
 * The single component every ribbon command renders through. This is what
 * guarantees there are no dead buttons and no fake-working buttons:
 * - `status: "available"` → real button, calls the real handler.
 * - `status: "unavailable"` → visibly disabled (reduced opacity, "Planned"
 *   badge, lock glyph), `aria-disabled`, not clickable, and its tooltip
 *   says plainly that it isn't built yet.
 */
export default function CommandButton({
  command,
  onRun,
  runHandlers,
  compact = false,
  disabledReason,
}: CommandButtonProps) {
  const isAvailable = command.status === "available" && !disabledReason;
  const isUnimplemented = command.status !== "available";
  const handleRun = onRun ?? command.run;
  // Desktop (≥1024px) gets a genuinely larger command card — bigger icon,
  // bigger label, more breathing room — matching professional desktop
  // productivity software. Tablet keeps the original compact card exactly
  // as tested; only the numeric icon `size` needs a JS-level check since it
  // can't be expressed as a Tailwind class.
  const isDesktop = !useMediaQuery(BREAKPOINTS.tablet);

  const content = compact ? (
    <span className="flex items-center gap-2">
      {command.icon && <Icon name={command.icon as IconName} />}
      <span>{command.label}</span>
      {isUnimplemented && <Badge>Planned</Badge>}
    </span>
  ) : (
    <span
      className={
        isDesktop
          ? "flex w-24 flex-col items-center gap-1.5 text-center"
          : "flex w-16 flex-col items-center gap-1 text-center"
      }
    >
      <span className={isDesktop ? "flex h-7 items-center justify-center" : "flex h-5 items-center justify-center"}>
        {command.icon ? (
          <Icon name={command.icon as IconName} size={isDesktop ? 24 : 18} />
        ) : (
          <span className={isDesktop ? "text-lg font-semibold" : "text-sm font-semibold"}>
            {command.label.charAt(0)}
          </span>
        )}
        {isUnimplemented && (
          <span className={isDesktop ? "-mt-4 ml-5 text-text-subtle" : "-mt-3 ml-4 text-text-subtle"}>
            <Icon name="lock" size={isDesktop ? 12 : 10} />
          </span>
        )}
      </span>
      <span className={isDesktop ? "text-[13px] font-medium leading-tight" : "text-[11px] leading-tight"}>
        {command.label}
      </span>
    </span>
  );

  const button = (
    <button
      type="button"
      aria-disabled={!isAvailable}
      disabled={!isAvailable}
      onClick={isAvailable ? handleRun : undefined}
      className={[
        "rounded-md transition-colors",
        compact ? "w-full px-2 py-1.5 text-left text-xs" : isDesktop ? "px-3 py-2.5" : "px-2 py-1.5",
        isAvailable
          ? "text-text hover:bg-surface-muted"
          : "cursor-not-allowed text-text-subtle opacity-60",
      ].join(" ")}
    >
      {content}
    </button>
  );

  const tooltipText = isAvailable
    ? command.label
    : disabledReason
      ? `${command.label} — ${disabledReason}`
      : `${command.label} — not yet available`;

  const wrapped = (
    <Tooltip text={tooltipText} hint={command.description}>
      {button}
    </Tooltip>
  );

  if (!command.dropdown || command.dropdown.length === 0) {
    return wrapped;
  }

  return (
    <span className="flex items-start">
      {wrapped}
      <DropdownMenu
        items={command.dropdown.map((sub) => ({
          id: sub.id,
          label: sub.label,
          disabled: sub.status !== "available",
          disabledHint: sub.status === "available" ? undefined : "Not yet available",
          onSelect: runHandlers?.[sub.id] ?? sub.run,
        }))}
        renderTrigger={(triggerProps) => (
          <button
            type="button"
            {...triggerProps}
            aria-label={`${command.label} options`}
            className="mt-1 rounded p-0.5 text-text-subtle hover:bg-surface-muted hover:text-text"
          >
            <Icon name="chevronDown" size={12} />
          </button>
        )}
      />
    </span>
  );
}
