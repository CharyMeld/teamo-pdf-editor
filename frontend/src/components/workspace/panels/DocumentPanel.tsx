import Panel from "../../ui/Panel";

const FIELDS: Array<[string, string]> = [
  ["Title", "—"],
  ["Pages", "—"],
  ["File size", "—"],
  ["Modified", "—"],
];

/** Shown when there is no selection: document-level metadata. Every value
 * is an honest "—" placeholder since no document is ever opened in Phase 1
 * — this becomes real once the Documents module's upload/load endpoint
 * ships. */
export default function DocumentPanel() {
  return (
    <Panel title="Document">
      <dl className="space-y-1.5">
        {FIELDS.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <dt className="text-text-muted">{label}</dt>
            <dd className="text-text-subtle">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
