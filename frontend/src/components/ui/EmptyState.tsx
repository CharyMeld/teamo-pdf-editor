import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Honest "nothing here yet" state — used by the thumbnail panel, canvas,
 * and inspector whenever there is no document/selection, instead of a
 * placeholder that pretends content exists. */
export default function EmptyState({ icon = "document", title, description, action }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="mb-1 text-text-subtle">
        <Icon name={icon} size={28} />
      </span>
      <p className="text-sm font-medium text-text-muted">{title}</p>
      {description && <p className="max-w-56 text-xs text-text-subtle">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
