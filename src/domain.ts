export interface Problem {
  id: string
  title: string
  category: string
  difficulty: string
  leetcodeUrl: string
  orderIndex: number
}

export interface PlanItem {
  kind: string
  problem: Problem
  estimatedMinutes: number
}

export interface TodayPlan {
  items: PlanItem[]
  reviewsDue: number
  streak: number
  xp: number
  level: string
}

export interface Dashboard {
  plan: TodayPlan
  week: boolean[]
  levelNumber: number
  levelFloorXp: number
  nextLevelXp: number
  practicedCount: number
  problemCount: number
  dueReviews: Review[]
}

export type GardenStage =
  | 'openField'
  | 'youngGrove'
  | 'meadow'
  | 'homestead'
  | 'valley'
  | 'countryside'

export type GardenVitality = 'thriving' | 'calm' | 'needsCare'

export interface GardenState {
  uniqueProblemsPracticed: number
  currentStage: GardenStage
  vitality: GardenVitality
  reviewsDue: number
  currentStreak: number
  weeklyDaysCompleted: number
  week: boolean[]
  todayProblem: Problem
  recentTakeaway: string | null
}

export interface Attempt {
  id: number
  problem: Problem
  startedAt: string
  pausedAt: string | null
  pausedSeconds: number
  notes: string
  isReview: boolean
}

export interface FocusContext {
  attempt: Attempt
  hints: string[]
  targetMinutes: number
}

export interface JournalEntry {
  id: number
  problem: Problem
  completedAt: string
  durationSeconds: number
  outcome: string
  confidence: number
  notes: string
  mistakes: string[]
  isReview: boolean
}

export interface Review {
  problem: Problem
  nextReviewDate: string
  reviewLevel: number
  lastOutcome: string
}

export interface AppSettings {
  localModel: string
  displayName: string
  dailyFocusMinutes: number
  weeklyGoalDays: number
  focusDurationMinutes: number
  hintDelayMinutes: number
  progressiveHints: boolean
  plantAnimations: boolean
  theme: string
}

export interface ProblemOverview {
  problem: Problem
  status: string
  attemptCount: number
  lastOutcome: string | null
  lastAttemptedAt: string | null
  nextReviewDate: string | null
}

export interface ProblemBook {
  id: string
  title: string
  subtitle: string
  description: string
  accent: string
  problemCount: number
  practicedCount: number
  solvedCount: number
  builtIn: boolean
}

export interface FinishAttemptInput {
  attemptId: number
  outcome: string
  confidence: number
  notes: string
  mistakes: string[]
}

export interface CreateBookInput {
  title: string
  subtitle: string
  description: string
  accent: string
}

export interface ImportBookProblemsInput {
  urls: string[]
  category: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
}

export interface ImportBookProblemsResult {
  added: number
  alreadyPresent: number
}
