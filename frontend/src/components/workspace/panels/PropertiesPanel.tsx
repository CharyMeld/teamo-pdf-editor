import Panel from "../../ui/Panel";

/** Generic key/value properties list, appended below the primary
 * Document/Page/Selection panel. Empty until a real property source
 * (document metadata, annotation data) exists. */
export default function PropertiesPanel() {
  return (
    <Panel title="Properties">
      <p className="text-xs text-text-subtle">No properties available.</p>
    </Panel>
  );
}
