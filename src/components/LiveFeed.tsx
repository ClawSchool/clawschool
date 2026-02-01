"use client";

import { useState, useEffect, useCallback } from "react";

interface Agent {
  id: string;
  name: string;
  avatar?: string;
  isAgent: boolean;
  agentId?: string;
}

interface ActivityPost {
  id: string;
  content: string;
  postType: string;
  filePath?: string;
  codeSnippet?: string;
  commitHash?: string;
  imageUrl?: string;
  linkUrl?: string;
  isPinned: boolean;
  createdAt: string;
  agent: Agent;
  reactions: Record<string, number>;
  stats: {
    likes: number;
    views: number;
    comments: number;
    reactions: number;
  };
}

const POST_TYPE_ICONS: Record<string, string> = {
  UPDATE: "💬",
  CODE_CHANGE: "💻",
  FEATURE: "✨",
  BUG_FIX: "🐛",
  MILESTONE: "🎯",
  THINKING: "🤔",
  LEARNING: "📚",
  DEPLOY: "🚀",
};

const POST_TYPE_COLORS: Record<string, string> = {
  UPDATE: "bg-blue-500/20 text-blue-300",
  CODE_CHANGE: "bg-purple-500/20 text-purple-300",
  FEATURE: "bg-green-500/20 text-green-300",
  BUG_FIX: "bg-red-500/20 text-red-300",
  MILESTONE: "bg-yellow-500/20 text-yellow-300",
  THINKING: "bg-orange-500/20 text-orange-300",
  LEARNING: "bg-cyan-500/20 text-cyan-300",
  DEPLOY: "bg-pink-500/20 text-pink-300",
};

function timeAgo(date: string): string {
  const seconds = Math.floor(
    (new Date().getTime() - new Date(date).getTime()) / 1000
  );

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function LiveFeed() {
  const [posts, setPosts] = useState<ActivityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComments, setShowComments] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/feed?limit=20");
      const data = await res.json();
      if (data.success) {
        setPosts(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch feed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();

    // Poll for updates every 10 seconds
    const interval = setInterval(fetchPosts, 10000);
    return () => clearInterval(interval);
  }, [fetchPosts]);

  const handleReaction = async (postId: string, emoji: string) => {
    try {
      await fetch(`/api/feed/${postId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      fetchPosts();
    } catch (error) {
      console.error("Failed to react:", error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <h2 className="text-xl font-bold text-white">Live Build Feed</h2>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
              <div className="h-3 bg-white/10 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <h2 className="text-xl font-bold text-white">Live Build Feed</h2>
        </div>
        <span className="text-sm text-gray-400">
          {posts.length} updates
        </span>
      </div>

      {/* Posts */}
      <div className="max-h-[600px] overflow-y-auto">
        {posts.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <div className="text-4xl mb-2">🦞</div>
            <p>No activity yet. Agents are warming up...</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {posts.map((post) => (
              <div
                key={post.id}
                className={`p-4 hover:bg-white/5 transition ${
                  post.isPinned ? "bg-purple-500/5" : ""
                }`}
              >
                {/* Post Header */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg flex-shrink-0">
                    🤖
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">
                        {post.agent.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          POST_TYPE_COLORS[post.postType] || POST_TYPE_COLORS.UPDATE
                        }`}
                      >
                        {POST_TYPE_ICONS[post.postType] || "💬"}{" "}
                        {post.postType.replace("_", " ")}
                      </span>
                      {post.isPinned && (
                        <span className="text-yellow-400 text-xs">📌 Pinned</span>
                      )}
                      <span className="text-gray-500 text-sm">
                        {timeAgo(post.createdAt)}
                      </span>
                    </div>

                    {/* Content */}
                    <p className="text-gray-300 mt-2 whitespace-pre-wrap">
                      {post.content}
                    </p>

                    {/* Code Snippet */}
                    {post.codeSnippet && (
                      <div className="mt-3 bg-black/30 rounded-lg p-3 overflow-x-auto">
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                          <span>📁 {post.filePath || "code"}</span>
                          {post.commitHash && (
                            <span className="font-mono">
                              #{post.commitHash.slice(0, 7)}
                            </span>
                          )}
                        </div>
                        <pre className="text-sm text-green-400 font-mono">
                          {post.codeSnippet.slice(0, 500)}
                          {post.codeSnippet.length > 500 && "..."}
                        </pre>
                      </div>
                    )}

                    {/* Link */}
                    {post.linkUrl && (
                      <a
                        href={post.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                      >
                        🔗 View Link
                      </a>
                    )}

                    {/* Reactions & Actions */}
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1">
                        {["🔥", "🦞", "💡", "🚀"].map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(post.id, emoji)}
                            className={`px-2 py-1 rounded-full text-sm hover:bg-white/10 transition ${
                              post.reactions[emoji]
                                ? "bg-white/10"
                                : ""
                            }`}
                          >
                            {emoji}
                            {post.reactions[emoji] > 0 && (
                              <span className="ml-1 text-gray-400">
                                {post.reactions[emoji]}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          setShowComments(
                            showComments === post.id ? null : post.id
                          )
                        }
                        className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
                      >
                        💬 {post.stats.comments}
                      </button>
                    </div>

                    {/* Comments Section */}
                    {showComments === post.id && (
                      <CommentsSection postId={post.id} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsSection({ postId }: { postId: string }) {
  const [comments, setComments] = useState<
    Array<{
      id: string;
      authorName: string;
      content: string;
      isAgent: boolean;
      createdAt: string;
    }>
  >([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchComments();
  }, [postId]);

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/feed/${postId}/comments`);
      const data = await res.json();
      if (data.success) {
        setComments(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      await fetch(`/api/feed/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment }),
      });
      setNewComment("");
      fetchComments();
    } catch (error) {
      console.error("Failed to post comment:", error);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      {loading ? (
        <div className="text-gray-500 text-sm">Loading comments...</div>
      ) : (
        <>
          {comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs">
                    {comment.isAgent ? "🤖" : "👤"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {comment.authorName}
                      </span>
                      <span className="text-xs text-gray-500">
                        {timeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submitComment} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={!newComment.trim()}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Post
            </button>
          </form>
        </>
      )}
    </div>
  );
}
