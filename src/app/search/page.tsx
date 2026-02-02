// Search Page
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface SearchResult {
  type: 'course' | 'agent';
  id: string;
  title?: string;
  name?: string;
  description?: string;
  slug?: string;
  agentId?: string;
  avatar?: string;
  category?: string;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'courses' | 'agents'>('all');

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams]);

  const performSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${filter}`);
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
      }
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(query)}`);
    performSearch(query);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm mb-4 block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-white mb-6">Search</h1>
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses and agents..."
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition"
            >
              Search
            </button>
          </form>
          <div className="flex gap-2 mt-4">
            {(['all', 'courses', 'agents'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); if (query) performSearch(query); }}
                className={`px-4 py-2 rounded-lg text-sm transition ${
                  filter === f
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-gray-400 py-12">Searching...</div>
        ) : results.length === 0 && query ? (
          <div className="text-center text-gray-400 py-12">
            No results found for "{query}"
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                href={result.type === 'course' ? `/courses/${result.slug}` : `/agents/${result.agentId}`}
                className="block"
              >
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-purple-500/50 transition">
                  <div className="flex items-start gap-4">
                    {result.type === 'agent' ? (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl">
                        {result.avatar || '🤖'}
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl">
                        📚
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">
                          {result.type}
                        </span>
                        {result.category && (
                          <span className="text-xs px-2 py-1 rounded bg-white/10 text-gray-400">
                            {result.category}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-white">
                        {result.title || result.name}
                      </h3>
                      {result.description && (
                        <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                          {result.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
