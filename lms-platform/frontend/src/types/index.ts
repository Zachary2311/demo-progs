export interface User {
  id: string;
  discordId: string;
  username: string;
  discriminator: string | null;
  email: string | null;
  avatar: string | null;
  roles: string[];
  createdAt: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  category: string | null;
  tags: string | null;
  thumbnail: string | null;
  isPublished: boolean;
  instructorId: string;
  createdAt: string;
  updatedAt: string;
  instructor?: {
    id: string;
    username: string;
    avatar: string | null;
  };
  modules?: Module[];
  progress?: number;
  _count?: {
    enrollments: number;
    modules: number;
  };
}

export interface Module {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  lessons?: Lesson[];
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  content: string;
  videoUrl: string | null;
  orderIndex: number;
  duration: number | null;
  files?: File[];
  createdAt: string;
  updatedAt: string;
}

export interface Quiz {
  id: string;
  lessonId: string | null;
  title: string;
  description: string | null;
  timeLimit: number | null;
  passingScore: number;
  maxAttempts: number;
  randomizeQuestions: boolean;
  showCorrectAnswers: boolean;
  questions?: QuizQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  questionText: string;
  questionType: 'multiple_choice' | 'true_false' | 'short_answer';
  options: string | null;
  points: number;
  orderIndex: number;
  explanation: string | null;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  score: number | null;
  maxScore: number;
  isPassed: boolean;
  startedAt: string;
  completedAt: string | null;
  answers?: QuizAnswer[];
}

export interface QuizAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  answer: string;
  isCorrect: boolean | null;
  pointsEarned: number | null;
  question?: QuizQuestion;
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string | null;
  maxScore: number;
  allowLateSubmission: boolean;
  lateDeductionPercent: number | null;
  createdAt: string;
  updatedAt: string;
  course?: {
    id: string;
    title: string;
  };
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  userId: string;
  content: string | null;
  fileUrl: string | null;
  submittedAt: string;
  gradedAt: string | null;
  score: number | null;
  feedback: string | null;
  isLate: boolean;
  assignment?: Assignment;
  user?: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export interface Grade {
  id: string;
  userId: string;
  courseId: string;
  overallGrade: number;
  letterGrade: string | null;
  course?: {
    id: string;
    title: string;
  };
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  metadata: string | null;
  createdAt: string;
}

export interface DashboardData {
  enrolledCourses?: number;
  completedLessons?: number;
  averageGrade?: number;
  courses?: Course[];
  grades?: Grade[];
  upcomingAssignments?: Assignment[];
  totalCourses?: number;
  totalStudents?: number;
  pendingGrading?: number;
  totalUsers?: number;
  totalEnrollments?: number;
  publishedCourses?: number;
  [key: string]: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
