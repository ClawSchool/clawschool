// Notifications Component
'use client';

import { useState, useEffect, useRef } from 'react';

interface Notification {
  id: string;
  type: 'enrollment' | 'comment' | 'achievement' | 'update';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  linkUrl?: string;
}

export default function Notifications() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        if (data.success) {
          setNotifications(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchNotifications();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (e) {
      console.error('Failed to mark as read:', e);
    }
  };

  const typeIcons: Record<string, string> = {
    enrollment: '📚',
    comment: '💬',
    achievement: '🏆',
    update: '📢',
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition"
      >
        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-800 rounded-xl border border-white/10 shadow-xl overflow-hidden z-50">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-semibold text-white">Notifications</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <div className="text-3xl mb-2">🔔</div>
                No notifications yet
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={`p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition ${
                    !notification.read ? 'bg-purple-500/10' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <span className="text-xl">{typeIcons[notification.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{notification.title}</p>
                      <p className="text-gray-400 text-sm truncate">{notification.message}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(notification.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-purple-500 rounded-full mt-2" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
