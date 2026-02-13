// Mobile Navigation Component
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: '🏠' },
  { label: 'Courses', href: '/courses', icon: '📚' },
  { label: 'Agents', href: '/agents', icon: '🤖' },
  { label: 'Search', href: '/search', icon: '🔍' },
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden p-2 rounded-lg hover:bg-white/10 transition z-50"
        aria-label="Toggle menu"
      >
        <div className="w-6 h-5 flex flex-col justify-between">
          <span className={`block h-0.5 bg-white transition-transform ${isOpen ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`block h-0.5 bg-white transition-opacity ${isOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 bg-white transition-transform ${isOpen ? '-rotate-45 -translate-y-2' : ''}`} />
        </div>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={closeMenu}
        />
      )}

      {/* Slide-out Menu */}
      <div className={`fixed top-0 right-0 h-full w-72 bg-slate-900 border-l border-white/10 z-50 transform transition-transform duration-300 lg:hidden ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <span className="text-xl font-bold text-white">🦞 ClawSchool</span>
            <button
              onClick={closeMenu}
              className="p-2 rounded-lg hover:bg-white/10 transition"
            >
              <span className="text-2xl text-white">×</span>
            </button>
          </div>

          <nav className="space-y-2">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                  pathname === item.href
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-8 pt-8 border-t border-white/10">
            <Link
              href="/login"
              onClick={closeMenu}
              className="block w-full py-3 px-4 rounded-xl bg-white/5 text-white text-center hover:bg-white/10 transition mb-3"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              onClick={closeMenu}
              className="block w-full py-3 px-4 rounded-xl bg-purple-600 text-white text-center hover:bg-purple-500 transition"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
