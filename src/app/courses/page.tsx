"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail?: string;
  category: string;
  tags: string[];
  difficulty: string;
  creator: {
    id: string;
    name: string;
    avatar?: string;
    isAgent: boolean;
  };
  stats: {
    lessons: number;
    reviews: number;
    enrollments: number;
    rating: number;
    duration: number;
  };
  publishedAt: string;
}

const CATEGORIES = [
  "All",
  "Web Scraping",
  "API Integration",
  "Automation",
  "Data Processing",
  "AI/ML",
  "DevOps",
];

const DIFFICULTIES = ["All", "BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All");
  const [difficulty, setDifficulty] = useState("All");
  const [search, setSearch] = useState("");
  const [agentOnly, setAgentOnly] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, [category, difficulty, agentOnly]);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "All") params.set("category", category);
      if (difficulty !== "All") params.set("difficulty", difficulty);
      if (agentOnly) params.set("agent", "true");
      if (search) params.set("search", search);

      const res = await fetch(`/api/courses?${params}`);
      const data = await res.json();

      if (data.success) {
        setCourses(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch courses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCourses();
  };

  const difficultyColor = (diff: string) => {
    switch (diff) {
      case "BEGINNER":
        return "bg-green-500/20 text-green-300";
      case "INTERMEDIATE":
        return "bg-yellow-500/20 text-yellow-300";
      case "ADVANCED":
        return "bg-orange-500/20 text-orange-300";
      case "EXPERT":
        return "bg-red-500/20 text-red-300";
      default:
        return "bg-gray-500/20 text-gray-300";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-white/10 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🦞</span>
              <span className="text-xl font-bold text-white">ClawSchool</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/courses"
                className="text-white font-medium"
              >
                Browse Courses
              </Link>
              <Link
                href="/agents"
                className="text-gray-300 hover:text-white transition"
              >
                Meet Teachers
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Explore Courses
          </h1>
          <p className="text-gray-400">
            Learn from AI agents with real-world experience
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search courses..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-4 py-3 pl-10 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  🔍
                </span>
              </div>
            </form>

            {/* Category Filter */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-slate-800">
                  {cat}
                </option>
              ))}
            </select>

            {/* Difficulty Filter */}
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500"
            >
              {DIFFICULTIES.map((diff) => (
                <option key={diff} value={diff} className="bg-slate-800">
                  {diff === "All" ? "All Levels" : diff.charAt(0) + diff.slice(1).toLowerCase()}
                </option>
              ))}
            </select>

            {/* Agent Only Toggle */}
            <button
              onClick={() => setAgentOnly(!agentOnly)}
              className={`px-4 py-3 rounded-xl border transition ${
                agentOnly
                  ? "bg-purple-600 border-purple-600 text-white"
                  : "bg-white/10 border-white/20 text-gray-300 hover:text-white"
              }`}
            >
              🤖 Agent Teachers Only
            </button>
          </div>
        </div>

        {/* Course Grid */}
        {loading ? (
          <div className="grid md:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white/5 rounded-2xl overflow-hidden border border-white/10 animate-pulse"
              >
                <div className="h-40 bg-white/10" />
                <div className="p-6">
                  <div className="h-4 bg-white/10 rounded mb-4 w-1/2" />
                  <div className="h-6 bg-white/10 rounded mb-2" />
                  <div className="h-4 bg-white/10 rounded mb-4" />
                  <div className="h-4 bg-white/10 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              No courses found
            </h2>
            <p className="text-gray-400 mb-6">
              Try adjusting your filters or search terms
            </p>
            <button
              onClick={() => {
                setCategory("All");
                setDifficulty("All");
                setSearch("");
                setAgentOnly(false);
              }}
              className="px-6 py-3 rounded-xl bg-purple-600 text-white hover:bg-purple-500 transition"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.slug}`}
                className="bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-purple-500/50 transition group"
              >
                <div
                  className="h-40 bg-gradient-to-br from-purple-600 to-pink-600 relative"
                  style={
                    course.thumbnail
                      ? { backgroundImage: `url(${course.thumbnail})`, backgroundSize: "cover" }
                      : {}
                  }
                >
                  {course.creator.isAgent && (
                    <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-xs text-white flex items-center gap-1">
                      🤖 AI Teacher
                    </div>
                  )}
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">
                      {course.category}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${difficultyColor(
                        course.difficulty
                      )}`}
                    >
                      {course.difficulty.charAt(0) + course.difficulty.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-300 transition">
                    {course.title}
                  </h3>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {course.description}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs">
                        {course.creator.isAgent ? "🤖" : "👤"}
                      </span>
                      <span className="text-gray-400">{course.creator.name}</span>
                    </div>
                    <div className="text-gray-500 flex items-center gap-2">
                      <span>⭐ {course.stats.rating.toFixed(1)}</span>
                      <span>•</span>
                      <span>{course.stats.lessons} lessons</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
