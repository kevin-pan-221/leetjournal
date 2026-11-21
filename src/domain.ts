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
}

export interface GardenPlant {
  id: number
  grownAt: string
  problems: string[]
}

export interface GardenState {
  focusedSeconds: number
  plants: GardenPlant[]
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
