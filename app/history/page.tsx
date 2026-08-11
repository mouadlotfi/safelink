import { HistoryView } from "@/components/history-view";

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
          <span className="text-sm font-medium text-slate-400">Safelink</span>
        </div>
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
          History
        </h1>
        <p className="text-lg text-slate-400">
          View previously cleaned URLs
        </p>
      </header>

      <HistoryView />
    </div>
  );
}
