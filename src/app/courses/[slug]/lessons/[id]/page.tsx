// Lesson Viewer Page
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Lesson {
  id: string;
  title: string;
  content: string;
  order: number;
  durationMinutes?: number;
  videoUrl?: string;
  course: {
    id: string;
    title: string;
    slug: string;
    lessons: { id: string; title: string; order: number }[];
  };
}

export default function LessonViewerPage() {
  const params = useParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLesson() {
      try {
        const res = await fetch(`/api/lessons/${params.id}`);
        const data = await res.json();
        if (data.success) {
          setLesson(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch lesson:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchLesson();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading lesson...</div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Lesson not found</h1>
          <Link href="/courses" className="text-purple-400 hover:text-purple-300">
            Browse courses →
          </Link>
        </div>
      </div>
    );
  }

  const currentIndex = lesson.course.lessons.findIndex(l => l.id === lesson.id);
  const prevLesson = lesson.course.lessons[currentIndex - 1];
  const nextLesson = lesson.course.lessons[currentIndex + 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={`/courses/${lesson.course.slug}`} className="text-purple-400 hover:text-purple-300 text-sm">
            ← Back to {lesson.course.title}
          </Link>
          <span className="text-gray-400 text-sm">
            Lesson {lesson.order} of {lesson.course.lessons.length}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6">{lesson.title}</h1>

        {/* Video Player (if available) */}
        {lesson.videoUrl && (
          <div className="mb-8 rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
            <span className="text-gray-500">Video Player: {lesson.videoUrl}</span>
          </div>
        )}

        {/* Lesson Content */}
        <div className="prose prose-invert max-w-none">
          <div className="bg-white/5 rounded-xl p-8 border border-white/10">
            <div className="text-gray-300 whitespace-pre-wrap">{lesson.content}</div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-8 border-t border-white/10">
          {prevLesson ? (
            <Link
              href={`/courses/${lesson.course.slug}/lessons/${prevLesson.id}`}
              className="px-6 py-3 rounded-xl bg-white/5 text-white hover:bg-white/10 transition"
            >
              ← Previous: {prevLesson.title}
            </Link>
          ) : <div />}
          {nextLesson ? (
            <Link
              href={`/courses/${lesson.course.slug}/lessons/${nextLesson.id}`}
              className="px-6 py-3 rounded-xl bg-purple-600 text-white hover:bg-purple-500 transition"
            >
              Next: {nextLesson.title} →
            </Link>
          ) : (
            <Link
              href={`/courses/${lesson.course.slug}`}
              className="px-6 py-3 rounded-xl bg-green-600 text-white hover:bg-green-500 transition"
            >
              Complete Course 🎉
            </Link>
          )}
        </div>
      </div>

      {/* Sidebar - Lesson List */}
      <div className="fixed right-4 top-24 w-72 max-h-[calc(100vh-120px)] overflow-y-auto bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 hidden lg:block">
        <h3 className="text-white font-semibold mb-4">Course Content</h3>
        <div className="space-y-2">
          {lesson.course.lessons.map((l, i) => (
            <Link
              key={l.id}
              href={`/courses/${lesson.course.slug}/lessons/${l.id}`}
              className={`block p-3 rounded-lg text-sm transition ${
                l.id === lesson.id
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                  : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              <span className="text-xs text-gray-500 mr-2">{i + 1}.</span>
              {l.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
