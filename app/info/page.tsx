const socials: { label: string; href: string }[] = [
  { label: "GitHub", href: "https://github.com/mouadlotfi/safelink" }
];

export default function InfoPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="mb-3 flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
          <span className="text-sm font-medium text-slate-400">Safelink</span>
        </div>
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Info
        </h1>
        <p className="text-lg text-slate-400">
          Cleaner links, fewer trackers
        </p>
      </header>

      <section className="card p-6">
        <h2 className="text-xl font-semibold text-white">About Safelink</h2>
        <p className="mt-3 text-sm text-slate-300">
          Safelink removes tracking parameters from the links you share and offers alternative URLs for supported websites.
        </p>
      </section>

      <section className="card p-6">
        <h3 className="text-lg font-semibold text-white">Links</h3>
        <ul className="mt-4 grid gap-3 text-sm">
          {socials.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-[var(--border)] bg-white/5 px-4 py-3 text-blue-400 transition-colors hover:border-blue-500/30 hover:bg-white/10"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
