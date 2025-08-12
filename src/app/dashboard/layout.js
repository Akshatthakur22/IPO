"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

const DashboardLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading } = useAuth();

  useEffect(() => {
    // Fetch notifications
    fetchNotifications();

    // Close sidebar on route change (mobile)
    setSidebarOpen(false);
  }, [pathname]);

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/notifications");
      const data = await response.json();
      if (data.success) {
        setNotifications(data.data.slice(0, 5));
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const navigationItems = [
    { name: "Overview", href: "/dashboard", icon: "📊", exact: true },
    { name: "IPOs", href: "/dashboard/ipos", icon: "🏢" },
    { name: "Live Tracking", href: "/dashboard/live", icon: "📈" },
    { name: "Analytics", href: "/dashboard/analytics", icon: "📋" },
    { name: "Allotments", href: "/dashboard/allotments", icon: "🎯" },
    { name: "Watchlist", href: "/dashboard/watchlist", icon: "⭐" },
    { name: "Alerts", href: "/dashboard/alerts", icon: "🔔" },
    { name: "Settings", href: "/dashboard/settings", icon: "⚙️" },
  ];

  const adminItems = [
    { name: "Manage IPOs", href: "/dashboard/admin/ipos", icon: "🏗️" },
    { name: "Data Sync", href: "/dashboard/admin/sync", icon: "🔄" },
    { name: "Users", href: "/dashboard/admin/users", icon: "👥" },
    { name: "System", href: "/dashboard/admin/system", icon: "🖥️" },
  ];

  const isActive = (href, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:static lg:inset-0`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b">
          <Link href="/dashboard" className="text-xl font-bold text-gray-900">
            IPO Tracker
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-gray-600 hover:text-gray-900"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {navigationItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive(item.href, item.exact)
                    ? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className="mr-3 text-lg">{item.icon}</span>
                {item.name}
              </Link>
            ))}
          </div>

          {/* Admin Section */}
          {user.role === "admin" && (
            <div className="mt-8">
              <div className="px-3 mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Administration
                </h3>
              </div>
              <div className="space-y-1">
                {adminItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive(item.href)
                        ? "bg-red-50 text-red-700 border-r-2 border-red-700"
                        : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <span className="mr-3 text-lg">{item.icon}</span>
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="mt-8 px-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Quick Stats
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Open IPOs:</span>
                  <span className="font-medium text-green-600">5</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Watchlist:</span>
                  <span className="font-medium text-blue-600">12</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Alerts:</span>
                  <span className="font-medium text-orange-600">
                    {notifications.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* User Profile */}
        <div className="absolute bottom-0 w-full p-4 border-t">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.name}
              </p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Logout"
            >
              🚪
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top header */}
        <header className="bg-white shadow-sm border-b">
          <div className="flex items-center justify-between h-16 px-6">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-600 hover:text-gray-900"
            >
              ☰
            </button>

            {/* Page title */}
            <div className="flex-1 lg:flex-initial">
              <h1 className="text-xl font-semibold text-gray-900">
                {navigationItems.find((item) => isActive(item.href, item.exact))
                  ?.name || "Dashboard"}
              </h1>
            </div>

            {/* Header actions */}
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <div className="relative">
                <button className="p-2 text-gray-400 hover:text-gray-600 relative">
                  🔔
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Quick actions */}
              <Link
                href="/dashboard/live"
                className="hidden md:flex items-center px-3 py-1 text-sm bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors"
              >
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                Live
              </Link>

              {/* User menu */}
              <div className="flex items-center space-x-2">
                <div className="hidden md:block text-sm text-gray-700">
                  {user.name}
                </div>
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t mt-12">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div>© 2024 IPO Tracker. All rights reserved.</div>
              <div className="flex items-center space-x-4">
                <Link href="/help" className="hover:text-gray-700">
                  Help
                </Link>
                <Link href="/privacy" className="hover:text-gray-700">
                  Privacy
                </Link>
                <Link href="/terms" className="hover:text-gray-700">
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Keyboard shortcuts */}
      <div className="hidden">
        <div id="keyboard-shortcuts">
          <kbd>Ctrl+/</kbd> - Search
          <kbd>Ctrl+L</kbd> - Live tracking
          <kbd>Ctrl+A</kbd> - Analytics
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
