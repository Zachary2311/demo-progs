import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { courseService } from '../../services/course.service';

const CourseCatalog: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: courses, isLoading } = useQuery({
    queryKey: ['courses', { search, published: true }],
    queryFn: () => courseService.getCourses({ search, published: true }),
  });

  const enrollMutation = useMutation({
    mutationFn: (courseId: string) => courseService.enrollCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['enrolledCourses'] });
    },
  });

  const handleEnroll = (courseId: string) => {
    enrollMutation.mutate(courseId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Course Catalog</h1>
        <input
          type="text"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses?.data.map((course) => (
          <div key={course.id} className="bg-white rounded-lg shadow-md overflow-hidden">
            {course.thumbnail && (
              <img src={course.thumbnail} alt={course.title} className="w-full h-48 object-cover" />
            )}
            <div className="p-6">
              <h3 className="font-bold text-xl text-gray-900 mb-2">{course.title}</h3>
              <p className="text-gray-600 mb-4 line-clamp-3">{course.description}</p>
              {course.instructor && (
                <p className="text-sm text-gray-500 mb-2">
                  Instructor: {course.instructor.username}
                </p>
              )}
              {course._count && (
                <p className="text-sm text-gray-500 mb-4">
                  {course._count.enrollments} students enrolled
                </p>
              )}
              <div className="flex gap-2">
                <Link
                  to={`/student/courses/${course.id}`}
                  className="flex-1 bg-primary-600 text-white text-center px-4 py-2 rounded-lg hover:bg-primary-700"
                >
                  View Details
                </Link>
                <button
                  onClick={() => handleEnroll(course.id)}
                  disabled={enrollMutation.isPending}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {enrollMutation.isPending ? 'Enrolling...' : 'Enroll'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {courses?.data.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No courses found</p>
        </div>
      )}
    </div>
  );
};

export default CourseCatalog;
