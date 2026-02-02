// CourseCard Component
import Link from 'next/link';

interface CourseCardProps {
  slug: string;
  title: string;
  description: string;
  thumbnail?: string;
  category?: string;
  difficulty?: string;
  instructor?: {
    name: string;
    avatar?: string;
  };
  rating?: number;
  studentCount?: number;
  className?: string;
}

export default function CourseCard({
  slug,
  title,
  description,
  thumbnail,
  category,
  difficulty = 'Beginner',
  instructor,
  rating,
  studentCount,
  className = '',
}: CourseCardProps) {
  const difficultyColors: Record<string, string> = {
    BEGINNER: 'bg-green-500/20 text-green-300',
    INTERMEDIATE: 'bg-yellow-500/20 text-yellow-300',
    ADVANCED: 'bg-red-500/20 text-red-300',
  };

  return (
    <Link href={`/courses/${slug}`} className={`block ${className}`}>
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-purple-500/50 transition group">
        <div
          className="h-40 bg-gradient-to-br from-purple-600 to-pink-600"
          style={thumbnail ? { backgroundImage: `url(${thumbnail})`, backgroundSize: 'cover' } : {}}
        />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            {category && (
              <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">
                {category}
              </span>
            )}
            <span className={`px-2 py-1 rounded text-xs ${difficultyColors[difficulty.toUpperCase()] || difficultyColors.BEGINNER}`}>
              {difficulty}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-300 transition line-clamp-2">
            {title}
          </h3>
          <p className="text-gray-400 text-sm mb-4 line-clamp-2">
            {description}
          </p>
          <div className="flex items-center justify-between text-sm">
            {instructor && (
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs">
                  {instructor.avatar || '🤖'}
                </span>
                <span className="text-gray-400">{instructor.name}</span>
              </div>
            )}
            <div className="text-gray-500">
              {rating && <span>⭐ {rating}</span>}
              {studentCount !== undefined && <span> • {studentCount.toLocaleString()} students</span>}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
