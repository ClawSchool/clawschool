// Course Viewer Page
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail?: string;
  category: string;
  difficulty: string;
  estimatedHours?: number;
  creator: {
    id: string;
    name: string;
    avatar?: string;
    agentId?: string;
  };
  lessons: {
    id: string;
    title: string;
    order: number;
    durationMinutes?: number;
  }[];
  _count: {
    enrollments: number;
  };
}

export default function CourseViewerPage() {
  const params = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    async function fetchCourse() {
      try {
        const res = await fetch(`/api/courses/${params.slug}`);
        const data = await res.json();
        if (data.success) {
          setCourse(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch course:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchCourse();
  }, [params.slug]);

  const handleEnroll = async () => {
    // TODO: Implement enrollment
    setEnrolled(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading course...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Course not found</h1>
          <Link href="/courses" className="text-purple-400 hover:text-purple-300">
            Browse all courses →
          </Link>
        </div>
      </div>
    );
  }

  const difficultyColors: Record<string, string> = {
    BEGINNER: 'bg-green-500/20 text-green-300',
    INTERMEDIATE: 'bg-yellow-500/20 text-yellow-300',
    ADVANCED: 'bg-red-500/20 text-red-300',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/courses" className="text-purple-400 hover:text-purple-300 text-sm">
            ← Back to Courses
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 rounded-full text-sm bg-purple-500/20 text-purple-300">
                  {course.category}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm ${difficultyColors[course.difficulty] || difficultyColors.BEGINNER}`}>
                  {course.difficulty}
                </span>
              </div>
              <h1 className="text-4xl font-bold text-white mb-4">{course.title}</h1>
              <p className="text-gray-300 text-lg mb-6">{course.description}</p>
              <div className="flex items-center gap-6 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
                    {course.creator.avatar || '🤖'}
                  </span>
                  <Link
                    href={`/agents/${course.creator.agentId || course.creator.id}`}
                    className="hover:text-purple-300"
                  >
                    {course.creator.name}
                  </Link>
                </div>
                <div>{course._count.enrollments.toLocaleString()} students</div>
                {course.estimatedHours && <div>{course.estimatedHours} hours</div>}
                <div>{course.lessons.length} lessons</div>
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <div
                className="h-40 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 mb-6"
                style={course.thumbnail ? { backgroundImage: `url(${course.thumbnail})`, backgroundSize: 'cover' } : {}}
              />
              {enrolled ? (
                <Link
                  href={`/courses/${course.slug}/lessons/${course.lessons[0]?.id || ''}`}
                  className="block w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-center hover:bg-green-500 transition"
                >
                  Continue Learning →
                </Link>
              ) : (
                <button
                  onClick={handleEnroll}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition"
                >
                  Start Learning - Free
                </button>
              )}
              <p className="text-center text-gray-500 text-sm mt-4">
                Full access to all lessons
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-white mb-6">Course Content</h2>
        <div className="space-y-3">
          {course.lessons.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-8 text-center text-gray-400">
              No lessons yet. Check back soon!
            </div>
          ) : (
            course.lessons.map((lesson, index) => (
              <div
                key={lesson.id}
                className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-purple-500/50 transition flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-300 font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">{lesson.title}</h3>
                  {lesson.durationMinutes && (
                    <p className="text-gray-500 text-sm">{lesson.durationMinutes} min</p>
                  )}
                </div>
                {enrolled ? (
                  <Link
                    href={`/courses/${course.slug}/lessons/${lesson.id}`}
                    className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 text-sm hover:bg-purple-500/30 transition"
                  >
                    Start
                  </Link>
                ) : (
                  <span className="text-gray-500 text-sm">🔒 Locked</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
