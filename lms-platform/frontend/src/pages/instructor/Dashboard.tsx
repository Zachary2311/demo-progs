import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '../../services/analytics.service';

const InstructorDashboard: React.FC = () => {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['instructorDashboard'],
    queryFn: analyticsService.getInstructorDashboard,
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
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Instructor Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Courses</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData?.totalCourses || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Students</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData?.totalStudents || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Pending Grading</p>
          <p className="text-3xl font-bold text-gray-900">{dashboardData?.pendingGrading || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Avg Completion</p>
          <p className="text-3xl font-bold text-gray-900">
            {dashboardData?.averageCompletion ? `${Math.round(dashboardData.averageCompletion)}%` : '0%'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">My Courses</h2>
        </div>
        <div className="p-6">
          {dashboardData?.courses && dashboardData.courses.length > 0 ? (
            <div className="space-y-4">
              {dashboardData.courses.map((course: any) => (
                <div key={course.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">{course.title}</h3>
                      <p className="text-sm text-gray-600">
                        {course.students} students • {course.modules} modules
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm ${course.isPublished ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {course.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No courses yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstructorDashboard;
