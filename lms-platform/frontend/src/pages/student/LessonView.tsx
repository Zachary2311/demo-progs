import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { courseService } from '../../services/course.service';

// SECURITY FIX: Strict regex validation for video URLs
const YOUTUBE_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
const VIMEO_REGEX = /^https?:\/\/(www\.)?vimeo\.com\/\d+/;

function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url);
}

const LessonView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: lesson, isLoading } = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => courseService.getLesson(id!),
    enabled: !!id,
  });

  const completeMutation = useMutation({
    mutationFn: () => courseService.markLessonComplete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson', id] });
      queryClient.invalidateQueries({ queryKey: ['enrolledCourses'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!lesson) {
    return <div>Lesson not found</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">{lesson.title}</h1>

        {lesson.videoUrl && (
          <div className="mb-6">
            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
              {isYouTubeUrl(lesson.videoUrl) ? (
                <iframe
                  src={lesson.videoUrl.replace('watch?v=', 'embed/')}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              ) : (
                <video src={lesson.videoUrl} controls className="w-full h-full">
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          </div>
        )}

        <div className="prose max-w-none mb-6">
          <ReactMarkdown>{lesson.content}</ReactMarkdown>
        </div>

        {lesson.files && lesson.files.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Attachments</h2>
            <div className="space-y-2">
              {lesson.files.map((file: any) => (
                <a
                  key={file.id}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm text-gray-700">{file.originalName}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
          className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
        >
          {completeMutation.isPending ? 'Marking Complete...' : 'Mark as Complete'}
        </button>
      </div>
    </div>
  );
};

export default LessonView;
