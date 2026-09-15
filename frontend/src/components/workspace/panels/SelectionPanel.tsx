import Panel from "../../ui/Panel";

interface SelectionPanelProps {
  kind: "text" | "image" | "annotation";
}

const FIELDS_BY_KIND: Record<SelectionPanelProps["kind"], Array<[string, string]>> = {
  text: [
    ["Content", "—"],
    ["Font", "—"],
    ["Size", "—"],
  ],
  image: [
    ["Dimensions", "—"],
    ["Format", "—"],
  ],
  annotation: [
    ["Type", "—"],
    ["Author", "—"],
    ["Created", "—"],
  ],
};

/** Shown while a text/image/annotation selection exists — real conditional
 * rendering per subtype, driven by useSelectionContext. */
export default function SelectionPanel({ kind }: SelectionPanelProps) {
  const label = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} Selection`;
  return (
    <Panel title={label}>
      <dl className="space-y-1.5">
        {FIELDS_BY_KIND[kind].map(([field, value]) => (
          <div key={field} className="flex items-center justify-between text-xs">
            <dt className="text-text-muted">{field}</dt>
            <dd className="text-text-subtle">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
