import Panel from "../../ui/Panel";

const FIELDS: Array<[string, string]> = [
  ["Page number", "—"],
  ["Size", "—"],
  ["Rotation", "0°"],
];

/** Shown while a page is selected (via the dev selection simulator in
 * Phase 1, and a real page-thumbnail click once the Pages module ships). */
export default function PagePanel() {
  return (
    <Panel title="Page">
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
