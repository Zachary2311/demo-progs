import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '../../services/analytics.service';

const AdminDashboard: React.FC = () => {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: analyticsService.getAdminDashboard,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Users</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData?.totalUsers || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Courses</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData?.totalCourses || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Enrollments</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData?.totalEnrollments || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Published Courses</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData?.publishedCourses || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Role Distribution</h2>
          </div>
          <div className="p-6">
            {dashboardData?.roleDistribution && dashboardData.roleDistribution.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.roleDistribution.map((item: any) => (
                  <div key={item.role} className="flex items-center justify-between">
                    <span className="text-gray-700 capitalize">{item.role}</span>
                    <span className="font-semibold text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No data available</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Top Courses</h2>
          </div>
          <div className="p-6">
            {dashboardData?.topCourses && dashboardData.topCourses.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.topCourses.map((course: any) => (
                  <div key={course.id} className="border-l-4 border-primary-500 pl-4">
                    <h3 className="font-medium text-gray-900">{course.title}</h3>
                    <p className="text-sm text-gray-600">
                      {course.enrollments} students • {course.instructor}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No courses yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">System Stats</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-gray-500 text-sm">Total Lessons</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData?.totalLessons || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-sm">Total Quizzes</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData?.totalQuizzes || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-sm">Total Assignments</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardData?.totalAssignments || 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
