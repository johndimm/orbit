import Link from 'next/link';
import { Home, Github, ArrowUpRight } from 'lucide-react';

const GARDEN_URL = 'https://johndimm.vercel.app';
const GITHUB_URL = 'https://github.com/johndimm/Careers';

export const metadata = {
  title: 'About · Orbit',
  description: 'Explore connections between people and companies',
};

export default function About() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="flex items-center justify-between border-b border-slate-800/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <a
            href={GARDEN_URL}
            aria-label="All apps"
            title="All apps — John Dimm"
            className="flex items-center justify-center rounded-lg border border-slate-700/50 bg-slate-800/50 p-2 text-slate-400 transition-colors hover:text-slate-200 hover:border-slate-600"
          >
            <Home className="h-4 w-4" />
          </a>
          <span className="text-lg font-semibold text-slate-100 tracking-tight">Orbit</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 transition-colors hover:text-slate-200 hover:border-slate-600"
        >
          Open app <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Orbit</h1>
        <p className="mt-3 text-lg text-slate-400">Explore connections between people and companies</p>

        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-slate-300">
          <p>
            Orbit explores the connections between people and companies. Search for a person and it
            maps the organizations in their professional orbit; search for a company and it surfaces
            the people around it. Each result becomes a node in a graph you can wander through,
            following careers from one company to the next.
          </p>
          <p>
            Like Constellations, the graph is built on the fly from live language-model queries
            rather than a fixed database, with web results from DuckDuckGo filling in the details and
            company logos. It grew out of a set of experiments in mapping professional networks.
          </p>
        </div>

        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Built with</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {['React / Next.js', 'DeepSeek', 'DuckDuckGo'].map((t) => (
              <span key={t} className="rounded-md bg-slate-800/70 px-3 py-1.5 text-sm text-slate-300">
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-5 border-t border-slate-800/50 pt-6 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2.5 font-semibold text-slate-900 transition-colors hover:bg-white"
          >
            Open Orbit <ArrowUpRight className="h-4 w-4" />
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-slate-200"
          >
            <Github className="h-4 w-4" /> GitHub
          </a>
          <a
            href={GARDEN_URL}
            className="ml-auto text-slate-500 transition-colors hover:text-slate-300"
          >
            ← All apps
          </a>
        </div>
      </main>
    </div>
  );
}
