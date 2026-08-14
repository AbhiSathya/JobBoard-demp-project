export type Role = 'admin' | 'candidate'
export type JobStatus = 'open' | 'closed'
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead'
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship'
export type ApplicationStatus = 'applied' | 'shortlisted' | 'rejected'

export interface User {
  id: number
  email: string
  role: Role
  company_name: string | null
}

export interface EducationEntry {
  institution: string
  degree: string
  field?: string | null
  graduation_year?: number | null
}

export interface ProjectEntry {
  name: string
  summary: string
  skills: string[]
}

export interface CandidateProfile {
  id: number
  user_id: number
  name: string
  headline: string | null
  years_experience: number
  skills: string[]
  education: EducationEntry[]
  projects: ProjectEntry[]
  preferred_location: string | null
  preferred_role_type: string | null
  domain_interests: string[]
  updated_at: string
}

export interface Job {
  id: number
  admin_id: number
  title: string
  description: string
  required_skills: string[]
  experience_level: ExperienceLevel
  location: string
  employment_type: EmploymentType
  domain: string | null
  company_name: string
  status: JobStatus
  created_at: string
  updated_at: string
}

export interface JobListResponse {
  items: Job[]
  total: number
  page: number
  page_size: number
}

export interface Application {
  id: number
  job_id: number
  candidate_id: number
  status: ApplicationStatus
  cover_note: string | null
  profile_snapshot: CandidateProfile
  created_at: string
  updated_at: string
  job: Job | null
}

export interface MatchIntent {
  roles: string[]
  skills: string[]
  experience_level: string | null
  locations: string[]
  domains: string[]
  employment_type: string | null
}

export interface MatchResult {
  job: Job
  score: number
  band: 'strong' | 'good' | 'fair' | null
  explanation: string
  skills_matched: string[]
  skills_missing: string[]
}

export interface MatchResponse {
  intent: MatchIntent
  used_ai: boolean
  low_confidence: boolean
  results: MatchResult[]
  weak_matches_only: boolean
}

export interface JobApplicationCount {
  job_id: number
  job_title: string
  count: number
}

export interface SkillCount {
  skill: string
  count: number
}

export interface PipelineCounts {
  applied: number
  shortlisted: number
  rejected: number
}

export interface AnalyticsResponse {
  applications_per_job: JobApplicationCount[]
  skill_distribution: SkillCount[]
  pipeline_counts: PipelineCounts
  total_jobs: number
  total_applications: number
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details: unknown[]
  }
}
