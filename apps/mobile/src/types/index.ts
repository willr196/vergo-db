/**
 * VERGO App TypeScript Types
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

// ============================================
// User Types
// ============================================

export type UserType = 'jobseeker' | 'client';
export type SubscriptionTier = 'STANDARD' | 'PREMIUM';

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
  type: 'client';
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

  // Marketplace subscription
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: string;
  subscriptionStartedAt?: string | null;
  subscriptionExpiresAt?: string | null;

  // Status
  isApproved: boolean;
  approvedAt?: string;

  createdAt: string;
  updatedAt: string;
}

export type AuthUser = JobSeeker | ClientCompany;

export function isJobSeekerUser(user: AuthUser | null | undefined): user is JobSeeker {
  return Boolean(user && user.type === 'jobseeker');
}

export function isClientCompanyUser(user: AuthUser | null | undefined): user is ClientCompany {
  return Boolean(user && user.type === 'client');
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
export type JobTier = 'STANDARD' | 'SHORTLIST' | 'GOLD';

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
  payType?: 'HOURLY' | 'DAILY' | 'FIXED';
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
  tier?: JobTier;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  applicationDeadline?: string;
  shortlistReviewedAt?: string | null;
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
  receivedAt?: string;
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
// Marketplace + Booking Types
// ============================================

export type StaffTier = 'STANDARD' | 'ELITE';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface MarketplaceStaff {
  id: string;
  name: string;
  tier: StaffTier;
  bio: string | null;
  avatar: string | null;
  rating: number | null;
  reviewCount: number;
  highlights: string | null;
  hourlyRate: number | null;
  isBookable: boolean;
}

export interface Booking {
  id: string;
  status: BookingStatus;
  eventName: string | null;
  eventDate: string;
  location: string;
  venue: string | null;
  shiftStart: string;
  shiftEnd: string;
  hourlyRate: number;
  totalEstimated: number | null;
  createdAt: string;
  confirmedAt: string | null;
  staff: {
    id: string;
    name: string;
    tier: StaffTier;
    avatar: string | null;
    rating: number | null;
  };
}

export interface BookingDetail extends Booking {
  eventEndDate: string | null;
  hoursEstimated: number | null;
  clientNotes: string | null;
  rejectionReason: string | null;
  completedAt: string | null;
  staff: {
    id: string;
    name: string;
    tier: StaffTier;
    avatar: string | null;
    rating: number | null;
    bio: string | null;
    highlights: string | null;
  };
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
  JobSeekerTabs: NavigatorScreenParams<JobSeekerTabParamList> | undefined;
  JobDetail: { jobId: string };
  ApplyToJob: { jobId: string; job: Job };
  ApplicationDetail: { applicationId: string };
  EditProfile: undefined;

  // Client
  ClientTabs: NavigatorScreenParams<ClientTabParamList> | undefined;
  ClientJobDetail: { jobId: string; initialTab?: 'applications' | 'details' };
  CreateJob: undefined;
  CreateQuote: undefined;
  MyQuotes: undefined;
  EditJob: { jobId: string };
  ApplicantDetail: { applicationId: string };
  ApplicantList: { jobId: string };
  EditClientProfile: undefined;

  // Marketplace + Bookings
  StaffDetail: { staffId: string; staff?: MarketplaceStaff };
  CreateBooking: { staffId: string; staff: MarketplaceStaff };
  BookingDetail: { bookingId: string };
};

export type JobSeekerTabParamList = {
  Jobs: undefined;
  Applications: undefined;
  Profile: undefined;
};

export type ClientTabParamList = {
  Dashboard: undefined;
  Browse: undefined;
  Bookings: undefined;
  Profile: undefined;

  // Legacy tabs retained for compatibility with existing screens/tests
  MyJobs: { initialFilter?: 'all' | 'active' | 'closed' } | undefined;
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
