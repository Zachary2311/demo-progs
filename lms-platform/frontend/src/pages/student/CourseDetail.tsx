import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { courseService } from '../../services/course.service';

const CourseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => courseService.getCourse(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!course) {
    return <div>Course not found</div>;
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-md p-8 mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{course.title}</h1>
        <p className="text-gray-600 mb-4">{course.description}</p>
        {course.instructor && (
          <p className="text-sm text-gray-500">Instructor: {course.instructor.username}</p>
        )}
      </div>

      <div className="space-y-6">
        {course.modules?.map((module, moduleIndex) => (
          <div key={module.id} className="bg-white rounded-lg shadow-md">
            <div className="bg-primary-50 px-6 py-4 border-b border-primary-100">
              <h2 className="text-xl font-semibold text-gray-900">
                Module {moduleIndex + 1}: {module.title}
              </h2>
              {module.description && (
                <p className="text-gray-600 mt-2">{module.description}</p>
              )}
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {module.lessons?.map((lesson, lessonIndex) => (
                  <Link
                    key={lesson.id}
                    to={`/student/lessons/${lesson.id}`}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-medium text-sm">{lessonIndex + 1}</span>
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{lesson.title}</h3>
                        {lesson.duration && (
                          <p className="text-sm text-gray-500">{lesson.duration} minutes</p>
                        )}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(!course.modules || course.modules.length === 0) && (
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <p className="text-gray-500">No modules available yet</p>
        </div>
      )}
    </div>
  );
};

export default CourseDetail;
