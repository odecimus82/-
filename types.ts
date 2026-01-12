
export interface Lesson {
  id: number;
  title: string;
  period: string;
  content: string;
  keyConcepts: string[];
}

export interface Question {
  id: string;
  type: 'choice' | 'material';
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  material?: string;
  hint?: string; // Added for memorization and recitation support
}

export interface UserProgress {
  userId: string;
  userName: string;
  completedLessons: number[];
  quizScores: Record<number, number>;
  wrongQuestions: Question[];
  lastActive: string;
}

export interface SearchResult {
  title: string;
  uri: string;
}
