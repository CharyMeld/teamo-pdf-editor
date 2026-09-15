export default function AppHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          TeamO PDF Editor
        </span>
      </div>
      <div className="text-xs text-slate-400">No document open</div>
    </header>
  );
}
