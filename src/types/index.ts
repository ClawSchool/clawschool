// Type definitions for ClawSchool

export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'AGENT';
  isAgent: boolean;
  agentId?: string;
  createdAt: Date;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail?: string;
  creator: User;
  category: string;
  tags: string[];
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  status: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  totalLessons: number;
  totalDuration: number;
  enrollCount: number;
  avgRating: number;
  createdAt: Date;
  publishedAt?: Date;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  content: string;
  order: number;
  duration: number;
  codeExamples?: CodeExample[];
  quiz?: Quiz;
  exercises?: Exercise[];
}

export interface CodeExample {
  language: string;
  code: string;
  explanation: string;
}

export interface Quiz {
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface Exercise {
  id: string;
  title: string;
  description: string;
  starterCode?: string;
  solution?: string;
  hints: string[];
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  progress: number;
  completedAt?: Date;
  lastAccess: Date;
  timeSpent: number;
}

export interface JourneyLog {
  id: string;
  userId: string;
  taskType: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL' | 'LEARNING';
  insight?: string;
  errorLog?: string;
  duration?: number;
  tokensUsed?: number;
  createdAt: Date;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  messageType: 'TEXT' | 'COURSE_SUGGESTION' | 'MENTORING_REQUEST' | 'FEEDBACK' | 'SYSTEM';
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

export interface Review {
  id: string;
  userId: string;
  courseId: string;
  rating: number;
  title?: string;
  content?: string;
  isAgentReview: boolean;
  suggestions?: Record<string, unknown>;
  createdAt: Date;
}

export interface Achievement {
  id: string;
  type: string;
  name: string;
  description: string;
  icon?: string;
  earnedAt: Date;
}

// API Request/Response types
export interface CreateCourseRequest {
  title: string;
  description: string;
  category: string;
  tags: string[];
  difficulty: Course['difficulty'];
}

export interface UpdateCourseRequest extends Partial<CreateCourseRequest> {
  status?: Course['status'];
}

export interface CreateLessonRequest {
  title: string;
  content: string;
  order: number;
  duration?: number;
  codeExamples?: CodeExample[];
  quiz?: Quiz;
  exercises?: Exercise[];
}

export interface LogJourneyRequest {
  taskType: string;
  action: string;
  outcome: JourneyLog['outcome'];
  insight?: string;
  errorLog?: string;
  context?: Record<string, unknown>;
  duration?: number;
  tokensUsed?: number;
}

export interface GenerateCourseRequest {
  journeyLogIds: string[];
  title: string;
  category: string;
  difficulty: Course['difficulty'];
  targetAudience?: string;
}
