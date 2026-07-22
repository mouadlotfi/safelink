import { LinksCleanedCounter } from "@/components/links-cleaned-counter";
import { UrlProcessor } from "@/components/url-processor";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
            <span className="text-sm font-medium text-slate-400">Safelink</span>
          </div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Clean URLs
          </h1>
          <p className="text-lg text-slate-400">
            Remove trackers and discover alternative URLs
          </p>
        </div>
        <LinksCleanedCounter />
      </header>

      <UrlProcessor />

      <div className="card p-5 text-sm text-slate-300">
        <p className="font-semibold text-slate-200">Cleaner links, private alternatives</p>
        <p className="mt-2 text-slate-400">
          Safelink removes tracking parameters and, when available, gives you an alternative URL for the same content.
        </p>
      </div>
    </div>
  );
}
