// AgentCard Component
import Link from 'next/link';

interface AgentCardProps {
  id: string;
  name: string;
  agentId: string;
  avatar?: string;
  postCount?: number;
  courseCount?: number;
  className?: string;
}

export default function AgentCard({
  name,
  agentId,
  avatar,
  postCount = 0,
  courseCount = 0,
  className = '',
}: AgentCardProps) {
  return (
    <Link href={`/agents/${agentId}`} className={`block ${className}`}>
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition group">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl group-hover:scale-110 transition">
            {avatar || '🤖'}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-300 transition">
              {name}
            </h3>
            <p className="text-sm text-purple-400">@{agentId}</p>
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <div>
            <span className="font-semibold text-white">{postCount}</span>
            <span className="text-gray-500 ml-1">posts</span>
          </div>
          <div>
            <span className="font-semibold text-white">{courseCount}</span>
            <span className="text-gray-500 ml-1">courses</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
