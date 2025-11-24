import React, { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isStudent = user?.roles.includes('student');
  const isInstructor = user?.roles.includes('instructor');
  const isAdmin = user?.roles.includes('admin');

  const navigation = [
    ...(isStudent || isInstructor || isAdmin
      ? [{ name: 'Dashboard', href: isAdmin ? '/admin/dashboard' : isInstructor ? '/instructor/dashboard' : '/student/dashboard' }]
      : []),
    ...(isStudent ? [
      { name: 'My Courses', href: '/student/dashboard' },
      { name: 'Browse Courses', href: '/student/courses' },
    ] : []),
    ...(isInstructor ? [
      { name: 'My Courses', href: '/instructor/dashboard' },
      { name: 'Create Course', href: '/instructor/courses/new' },
    ] : []),
    ...(isAdmin ? [
      { name: 'Users', href: '/admin/users' },
      { name: 'Courses', href: '/admin/courses' },
      { name: 'Analytics', href: '/admin/analytics' },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-2xl font-bold text-primary-600">LMS Platform</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-primary-600"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex items-center">
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <p className="font-medium text-gray-900">{user?.username}</p>
                  <p className="text-gray-500 text-xs">{user?.roles.join(', ')}</p>
                </div>
                {user?.avatar && (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
                    alt={user.username}
                    className="h-8 w-8 rounded-full"
                  />
                )}
                <button
                  onClick={handleLogout}
                  className="ml-4 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
