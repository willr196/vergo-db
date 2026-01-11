/**
 * VERGO App TypeScript Types
 */

// ============================================
// User Types
// ============================================

export type UserType = 'jobseeker' | 'client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profileImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobSeeker extends User {
  type: 'jobseeker';
  bio?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  postcode?: string;
  
  // Work preferences
  availability: AvailabilityStatus;
  preferredRoles: JobRole[];
  minimumHourlyRate?: number;
  maxTravelDistance?: number;
  
  // Documents & verification
  hasDBSCheck: boolean;
  dbsCheckDate?: string;
  nationalInsurance?: string;
  rightToWork: boolean;
  rightToWorkDocument?: string;
  
  // Experience
  yearsExperience: number;
  skills: string[];
  previousEmployers?: string[];
  
  // Stats
  completedJobs: number;
  rating?: number;
}

export interface ClientCompany {
  id: string;
  email: string;
  companyName: string;
  contactFirstName: string;
  contactLastName: string;
  phone?: string;
  logo?: string;
  
  // Company details
  description?: string;
  website?: string;
  address?: string;
  city?: string;
  postcode?: string;
  
  // Status
  isApproved: boolean;
  approvedAt?: string;
  
  createdAt: string;
  updatedAt: string;
}

export type AvailabilityStatus = 'available' | 'limited' | 'unavailable';

// ============================================
// Job Types
// ============================================

export type JobRole = 
  | 'bartender'
  | 'server'
  | 'chef'
  | 'sous_chef'
  | 'kitchen_porter'
  | 'event_manager'
  | 'event_coordinator'
  | 'front_of_house'
  | 'back_of_house'
  | 'runner'
  | 'barista'
  | 'sommelier'
  | 'mixologist'
  | 'catering_assistant'
  | 'other';

export type JobStatus = 'draft' | 'published' | 'closed' | 'cancelled' | 'filled';

export interface Job {
  id: string;
  clientCompanyId: string;
  clientCompany?: ClientCompany;
  
  // Basic info
  title: string;
  role: JobRole;
  description: string;
  requirements?: string;
  
  // Location
  venue: string;
  address: string;
  city: string;
  postcode?: string;
  
  // Schedule
  date: string;
  startTime: string;
  endTime: string;
  breakDuration?: number; // minutes
  
  // Compensation
  hourlyRate: number;
  totalHours?: number;
  estimatedPay?: number;
  
  // Requirements
  uniformRequired?: boolean;
  uniformDetails?: string;
  dbsRequired: boolean;
  experienceRequired?: number; // years
  
  // Capacity
  positions?: number;
  positionsAvailable?: number;
  positionsFilled?: number;
  applicationCount?: number;
  
  // Status
  status?: JobStatus | string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  applicationDeadline?: string;
}

export interface JobFilters {
  role?: JobRole;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  minHourlyRate?: number;
  maxHourlyRate?: number;
  dbsRequired?: boolean;
  search?: string;
}

// ============================================
// Application Types
// ============================================

export type ApplicationStatus = 
  | 'pending'
  | 'received'
  | 'reviewing'
  | 'shortlisted'
  | 'hired'
  | 'rejected'
  | 'withdrawn';

export interface Application {
  id: string;
  jobId: string;
  job?: Job;
  userId: string;
  user?: JobSeeker;
  jobSeeker?: JobSeeker;
  
  status: ApplicationStatus;
  coverNote?: string;
  
  // Status history
  receivedAt: string;
  reviewedAt?: string;
  shortlistedAt?: string;
  decidedAt?: string;
  
  // Feedback
  rejectionReason?: string;
  clientNotes?: string;
  
  createdAt: string;
  updatedAt: string;
}

// ============================================
// API Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
  userType: UserType;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: JobSeeker | ClientCompany;
  userType: UserType;
}

export interface RegisterJobSeekerRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface RegisterClientRequest {
  email: string;
  password: string;
  companyName: string;
  contactFirstName: string;
  contactLastName: string;
  phone?: string;
}

// ============================================
// Navigation Types
// ============================================

export type RootStackParamList = {
  // Auth
  Welcome: undefined;
  Login: { userType: UserType };
  Register: { userType: UserType };
  ForgotPassword: undefined;
  
  // Job Seeker
  JobSeekerTabs: undefined;
  JobDetail: { jobId: string };
  ApplyToJob: { jobId: string; job: Job };
  ApplicationDetail: { applicationId: string };
  EditProfile: undefined;
  
  // Client
  ClientTabs: undefined;
  ClientJobDetail: { jobId: string };
  CreateJob: undefined;
  EditJob: { jobId: string };
  ApplicantDetail: { applicationId: string };
  ApplicantList: { jobId: string };
};

export type JobSeekerTabParamList = {
  Jobs: undefined;
  Applications: undefined;
  Profile: undefined;
};

export type ClientTabParamList = {
  Dashboard: undefined;
  MyJobs: undefined;
  CompanyProfile: undefined;
};

// ============================================
// Notification Types
// ============================================

export type NotificationType = 
  | 'new_job'
  | 'application_update'
  | 'job_reminder'
  | 'new_applicant'
  | 'job_filled';

export interface PushNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
