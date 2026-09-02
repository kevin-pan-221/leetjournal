use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    pub id: String,
    pub title: String,
    pub category: String,
    pub difficulty: String,
    pub leetcode_url: String,
    pub neetcode_url: Option<String>,
    pub order_index: i32,
    pub category_order: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanItem {
    pub kind: String,
    pub problem: Problem,
    pub estimated_minutes: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayPlan {
    pub items: Vec<PlanItem>,
    pub reviews_due: i32,
    pub streak: i32,
    pub xp: i32,
    pub level: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub plan: TodayPlan,
    pub week: Vec<bool>,
    pub level_number: i32,
    pub level_floor_xp: i32,
    pub next_level_xp: i32,
    pub practiced_count: i32,
    pub problem_count: i32,
    pub due_reviews: Vec<ReviewItem>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GardenStage {
    OpenField,
    YoungGrove,
    Meadow,
    Homestead,
    Valley,
    Countryside,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GardenVitality {
    Thriving,
    Calm,
    NeedsCare,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GardenState {
    pub unique_problems_practiced: u32,
    pub current_stage: GardenStage,
    pub vitality: GardenVitality,
    pub reviews_due: u32,
    pub current_streak: u32,
    pub weekly_days_completed: u8,
    pub week: Vec<bool>,
    pub today_problem: Problem,
    pub recent_takeaway: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveAttempt {
    pub id: i64,
    pub problem: Problem,
    pub started_at: String,
    pub paused_at: Option<String>,
    pub paused_seconds: i64,
    pub notes: String,
    pub is_review: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: i64,
    pub problem: Problem,
    pub completed_at: String,
    pub duration_seconds: i64,
    pub outcome: String,
    pub confidence: i32,
    pub notes: String,
    pub mistakes: Vec<String>,
    pub is_review: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishAttemptInput {
    pub attempt_id: i64,
    pub outcome: String,
    pub confidence: i32,
    pub notes: String,
    pub mistakes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub problem: Problem,
    pub next_review_date: String,
    pub review_level: i32,
    pub last_outcome: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub display_name: String,
    pub daily_focus_minutes: i32,
    pub weekly_goal_days: i32,
    pub focus_duration_minutes: i32,
    pub hint_delay_minutes: i32,
    pub progressive_hints: bool,
    pub plant_animations: bool,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            display_name: "Coder".into(),
            daily_focus_minutes: 30,
            weekly_goal_days: 5,
            focus_duration_minutes: 25,
            hint_delay_minutes: 10,
            progressive_hints: true,
            plant_animations: true,
            theme: "warm-garden".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusContext {
    pub attempt: ActiveAttempt,
    pub hints: Vec<String>,
    pub target_minutes: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemOverview {
    pub problem: Problem,
    pub status: String,
    pub attempt_count: i32,
    pub last_outcome: Option<String>,
    pub last_attempted_at: Option<String>,
    pub next_review_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemBook {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub description: String,
    pub accent: String,
    pub problem_count: i32,
    pub practiced_count: i32,
    pub solved_count: i32,
    pub built_in: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBookInput {
    pub title: String,
    pub subtitle: String,
    pub description: String,
    pub accent: String,
}
