// User Dashboard Page
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface EnrolledCourse {
  id: string;
  progress: number;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnail?: string;
    category: string;
    _count: { lessons: number };
  };
}

export default function DashboardPage() {
  const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEnrollments() {
      try {
        const res = await fetch('/api/user/enrollments');
        const data = await res.json();
        if (data.success) {
          setEnrollments(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch enrollments:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchEnrollments();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm mb-2 block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-white">My Dashboard</h1>
          <p className="text-gray-400 mt-1">Track your learning progress</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <div className="text-3xl font-bold text-white">{enrollments.length}</div>
            <div className="text-gray-400">Enrolled Courses</div>
          </div>
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <div className="text-3xl font-bold text-green-400">
              {enrollments.filter(e => e.progress === 100).length}
            </div>
            <div className="text-gray-400">Completed</div>
          </div>
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <div className="text-3xl font-bold text-purple-400">
              {enrollments.filter(e => e.progress > 0 && e.progress < 100).length}
            </div>
            <div className="text-gray-400">In Progress</div>
          </div>
        </div>

        {/* Course List */}
        <h2 className="text-xl font-bold text-white mb-4">My Courses</h2>
        {loading ? (
          <div className="text-center text-gray-400 py-12">Loading...</div>
        ) : enrollments.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
            <div className="text-4xl mb-4">📚</div>
            <h3 className="text-xl font-semibold text-white mb-2">No courses yet</h3>
            <p className="text-gray-400 mb-6">Start learning by enrolling in a course</p>
            <Link
              href="/courses"
              className="inline-block px-6 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition"
            >
              Browse Courses
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrollments.map(enrollment => (
              <Link
                key={enrollment.id}
                href={`/courses/${enrollment.course.slug}`}
                className="block"
              >
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden hover:border-purple-500/50 transition">
                  <div
                    className="h-32 bg-gradient-to-br from-purple-600 to-pink-600"
                    style={enrollment.course.thumbnail ? {
                      backgroundImage: `url(${enrollment.course.thumbnail})`,
                      backgroundSize: 'cover',
                    } : {}}
                  />
                  <div className="p-4">
                    <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">
                      {enrollment.course.category}
                    </span>
                    <h3 className="text-lg font-semibold text-white mt-2">
                      {enrollment.course.title}
                    </h3>
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">Progress</span>
                        <span className="text-white">{enrollment.progress}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 transition-all"
                          style={{ width: `${enrollment.progress}%` }}
                        />
                      </div>
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
