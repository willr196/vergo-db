/**
 * Marketplace + Bookings API Service
 */

import apiClient from './client';
import type {
  Booking,
  BookingDetail,
  BookingStatus,
  MarketplaceStaff,
  StaffTier,
  SubscriptionTier,
} from '../types';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface ApiEnvelope<T> {
  ok: boolean;
  error?: string;
  code?: string;
  data?: T;
}

interface BrowseStaffPayload {
  staff?: BackendStaffRecord[];
  clientTier?: SubscriptionTier;
  pagination?: Partial<Pagination>;
}

interface PricingPlan {
  tier: SubscriptionTier;
  name: string;
  weeklyPrice: number;
  monthlyPrice: number | null;
  annualPrice: number | null;
  features: string[];
}

interface PricingRate {
  clientTier: SubscriptionTier;
  staffTier: StaffTier;
  hourlyRate: number;
  isBookable: boolean;
}

export interface PricingPayload {
  plans: PricingPlan[];
  hourlyRates: PricingRate[];
}

export interface BrowseStaffParams {
  tier?: StaffTier;
  search?: string;
  page?: number;
  limit?: number;
}

export interface BrowseStaffResponse {
  staff: MarketplaceStaff[];
  clientTier: SubscriptionTier | null;
  pagination: Pagination;
}

export interface BookingListParams {
  status?: BookingStatus;
  page?: number;
  limit?: number;
}

export interface BookingListResponse {
  bookings: Booking[];
  pagination: Pagination;
}

export interface CreateBookingPayload {
  staffId: string;
  eventName?: string;
  eventDate: string;
  eventEndDate?: string;
  location: string;
  venue?: string;
  shiftStart: string;
  shiftEnd: string;
  hoursEstimated?: number;
  clientNotes?: string;
}

export interface CancelBookingResponse {
  id: string;
  status: BookingStatus;
}

interface BackendStaffRecord {
  id: string;
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  tier?: StaffTier | null;
  staffTier?: StaffTier | null;
  bio?: string | null;
  staffBio?: string | null;
  avatar?: string | null;
  staffAvatar?: string | null;
  rating?: number | null;
  staffRating?: number | null;
  reviewCount?: number | null;
  staffReviewCount?: number | null;
  highlights?: string | null;
  staffHighlights?: string | null;
  hourlyRate?: number | null;
  isBookable?: boolean | null;
}

interface BackendBookingStaffRecord {
  id: string;
  name?: string;
  tier?: StaffTier | null;
  firstName?: string;
  lastName?: string;
  staffTier?: StaffTier | null;
  avatar?: string | null;
  staffAvatar?: string | null;
  rating?: number | null;
  staffRating?: number | null;
  bio?: string | null;
  staffBio?: string | null;
  highlights?: string | null;
  staffHighlights?: string | null;
}

interface BackendBookingRecord {
  id: string;
  status: string;
  eventName?: string | null;
  eventDate?: string | null;
  eventEndDate?: string | null;
  location: string;
  venue?: string | null;
  shiftStart: string;
  shiftEnd: string;
  hourlyRate?: number | null;
  hourlyRateCharged?: number | null;
  totalEstimated?: number | null;
  createdAt?: string | null;
  confirmedAt?: string | null;
  hoursEstimated?: number | null;
  clientNotes?: string | null;
  rejectionReason?: string | null;
  completedAt?: string | null;
  staff: BackendBookingStaffRecord;
}

const BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
];

function normalizeBookingStatus(status: string): BookingStatus {
  const upper = status.toUpperCase() as BookingStatus;
  return BOOKING_STATUSES.includes(upper) ? upper : 'PENDING';
}

function normalizeTier(tier?: StaffTier | null): StaffTier {
  return tier === 'ELITE' ? 'ELITE' : 'STANDARD';
}

function normalizeSubscriptionTier(tier?: SubscriptionTier | null): SubscriptionTier {
  return tier === 'PREMIUM' ? 'PREMIUM' : 'STANDARD';
}

function toDisplayName(staff: BackendStaffRecord | BackendBookingStaffRecord): string {
  if (staff.name && staff.name.trim().length > 0) return staff.name.trim();
  if ('fullName' in staff && typeof staff.fullName === 'string' && staff.fullName.trim().length > 0) {
    return staff.fullName.trim();
  }

  const firstName = 'firstName' in staff && staff.firstName ? staff.firstName.trim() : '';
  const lastName = 'lastName' in staff && staff.lastName ? staff.lastName.trim() : '';
  if (firstName && lastName) return `${firstName} ${lastName.charAt(0)}.`;
  if (firstName) return firstName;
  return 'Staff Member';
}

function normalizeStaff(staff: BackendStaffRecord): MarketplaceStaff {
  return {
    id: staff.id,
    name: toDisplayName(staff),
    tier: normalizeTier(staff.tier ?? staff.staffTier),
    bio: staff.bio ?? staff.staffBio ?? null,
    avatar: staff.avatar ?? staff.staffAvatar ?? null,
    rating: staff.rating ?? staff.staffRating ?? null,
    reviewCount: staff.reviewCount ?? staff.staffReviewCount ?? 0,
    highlights: staff.highlights ?? staff.staffHighlights ?? null,
    hourlyRate: staff.hourlyRate ?? null,
    isBookable: Boolean(staff.isBookable),
  };
}

function normalizeBookingStaff(staff: BackendBookingStaffRecord) {
  return {
    id: staff.id,
    name: toDisplayName(staff),
    tier: normalizeTier(staff.tier ?? staff.staffTier),
    avatar: staff.avatar ?? staff.staffAvatar ?? null,
    rating: staff.rating ?? staff.staffRating ?? null,
    bio: staff.bio ?? staff.staffBio ?? null,
    highlights: staff.highlights ?? staff.staffHighlights ?? null,
  };
}

function normalizeBooking(booking: BackendBookingRecord): Booking {
  const normalizedStaff = normalizeBookingStaff(booking.staff);

  return {
    id: booking.id,
    status: normalizeBookingStatus(booking.status),
    eventName: booking.eventName ?? null,
    eventDate: booking.eventDate ?? new Date().toISOString(),
    location: booking.location,
    venue: booking.venue ?? null,
    shiftStart: booking.shiftStart,
    shiftEnd: booking.shiftEnd,
    hourlyRate: booking.hourlyRate ?? booking.hourlyRateCharged ?? 0,
    totalEstimated: booking.totalEstimated ?? null,
    createdAt: booking.createdAt ?? new Date().toISOString(),
    confirmedAt: booking.confirmedAt ?? null,
    staff: {
      id: normalizedStaff.id,
      name: normalizedStaff.name,
      tier: normalizedStaff.tier,
      avatar: normalizedStaff.avatar,
      rating: normalizedStaff.rating,
    },
  };
}

function normalizeBookingDetail(booking: BackendBookingRecord): BookingDetail {
  const base = normalizeBooking(booking);
  const normalizedStaff = normalizeBookingStaff(booking.staff);

  return {
    ...base,
    eventEndDate: booking.eventEndDate ?? null,
    hoursEstimated: booking.hoursEstimated ?? null,
    clientNotes: booking.clientNotes ?? null,
    rejectionReason: booking.rejectionReason ?? null,
    completedAt: booking.completedAt ?? null,
    staff: {
      ...base.staff,
      bio: normalizedStaff.bio,
      highlights: normalizedStaff.highlights,
    },
  };
}

function normalizePagination(
  pagination: Partial<Pagination> | undefined,
  page: number,
  limit: number,
  totalFallback: number
): Pagination {
  const safePage = pagination?.page ?? page;
  const safeLimit = pagination?.limit ?? limit;
  const total = pagination?.total ?? totalFallback;
  const totalPages = pagination?.totalPages ?? Math.max(1, Math.ceil(total / Math.max(safeLimit, 1)));
  const hasMore = pagination?.hasMore ?? safePage * safeLimit < total;

  return {
    page: safePage,
    limit: safeLimit,
    total,
    totalPages,
    hasMore,
  };
}

export const marketplaceApi = {
  async browseStaff(params: BrowseStaffParams = {}): Promise<BrowseStaffResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (params.tier) query.set('tier', params.tier);
    if (params.search) query.set('search', params.search);

    const response = await apiClient.get<ApiEnvelope<BrowseStaffPayload>>(
      `/api/v1/marketplace/staff/pricing?${query.toString()}`
    );

    if (!response.data.ok) {
      throw new Error(response.data.error || 'Failed to browse staff');
    }

    const payload = response.data.data ?? {};
    const staff = (payload.staff ?? []).map(normalizeStaff);

    return {
      staff,
      clientTier: payload.clientTier ? normalizeSubscriptionTier(payload.clientTier) : null,
      pagination: normalizePagination(payload.pagination, page, limit, staff.length),
    };
  },

  async getStaffProfile(staffId: string): Promise<MarketplaceStaff> {
    const response = await apiClient.get<ApiEnvelope<BackendStaffRecord | { staff: BackendStaffRecord }>>(
      `/api/v1/marketplace/staff/${staffId}/pricing`
    );

    if (!response.data.ok) {
      throw new Error(response.data.error || 'Failed to load staff profile');
    }

    const payload = response.data.data;
    if (!payload) {
      throw new Error('Staff profile not found');
    }

    const rawStaff = 'staff' in payload ? payload.staff : payload;
    return normalizeStaff(rawStaff);
  },

  async getPricing(): Promise<PricingPayload> {
    const response = await apiClient.get<ApiEnvelope<{
      plans?: Array<{
        tier: SubscriptionTier;
        name: string;
        weeklyPrice: number;
        monthlyPrice: number | null;
        annualPrice: number | null;
        features: string[] | string | null;
      }>;
      hourlyRates?: Array<{
        clientTier: SubscriptionTier;
        staffTier: StaffTier;
        hourlyRate: number;
        isBookable: boolean;
      }>;
    }>>('/api/v1/marketplace/pricing');

    if (!response.data.ok) {
      throw new Error(response.data.error || 'Failed to load pricing');
    }

    const payload = response.data.data ?? {};

    return {
      plans: (payload.plans ?? []).map((plan) => ({
        tier: normalizeSubscriptionTier(plan.tier),
        name: plan.name,
        weeklyPrice: plan.weeklyPrice,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        features: Array.isArray(plan.features)
          ? plan.features
          : typeof plan.features === 'string' && plan.features.trim().length > 0
            ? [plan.features]
            : [],
      })),
      hourlyRates: (payload.hourlyRates ?? []).map((rate) => ({
        clientTier: normalizeSubscriptionTier(rate.clientTier),
        staffTier: normalizeTier(rate.staffTier),
        hourlyRate: rate.hourlyRate,
        isBookable: rate.isBookable,
      })),
    };
  },

  async createBooking(data: CreateBookingPayload): Promise<Booking> {
    const response = await apiClient.post<ApiEnvelope<BackendBookingRecord | { id: string; status: string }>>(
      '/api/v1/bookings',
      data
    );

    if (!response.data.ok) {
      const error = response.data.error || 'Failed to create booking';
      const typedError = new Error(error) as Error & { code?: string };
      typedError.code = response.data.code;
      throw typedError;
    }

    const payload = response.data.data;
    if (!payload) {
      throw new Error('Booking response was empty');
    }

    if ('staff' in payload) {
      return normalizeBooking(payload);
    }

    if (payload.id) {
      try {
        return await marketplaceApi.getBookingDetail(payload.id);
      } catch {
        return {
          id: payload.id,
          status: normalizeBookingStatus(payload.status),
          eventName: data.eventName ?? null,
          eventDate: data.eventDate,
          location: data.location,
          venue: data.venue ?? null,
          shiftStart: data.shiftStart,
          shiftEnd: data.shiftEnd,
          hourlyRate: 0,
          totalEstimated: null,
          createdAt: new Date().toISOString(),
          confirmedAt: null,
          staff: {
            id: data.staffId,
            name: 'Staff Member',
            tier: 'STANDARD',
            avatar: null,
            rating: null,
          },
        };
      }
    }

    throw new Error('Failed to parse booking response');
  },

  async getBookings(params: BookingListParams = {}): Promise<BookingListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (params.status) query.set('status', params.status);

    const response = await apiClient.get<ApiEnvelope<{
      bookings?: BackendBookingRecord[];
      pagination?: Partial<Pagination>;
    }>>(`/api/v1/bookings?${query.toString()}`);

    if (!response.data.ok) {
      throw new Error(response.data.error || 'Failed to load bookings');
    }

    const payload = response.data.data ?? {};
    const bookings = (payload.bookings ?? []).map(normalizeBooking);

    return {
      bookings,
      pagination: normalizePagination(payload.pagination, page, limit, bookings.length),
    };
  },

  async getBookingDetail(bookingId: string): Promise<BookingDetail> {
    const response = await apiClient.get<ApiEnvelope<BackendBookingRecord>>(`/api/v1/bookings/${bookingId}`);

    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Booking not found');
    }

    return normalizeBookingDetail(response.data.data);
  },

  async cancelBooking(bookingId: string): Promise<CancelBookingResponse> {
    const response = await apiClient.post<ApiEnvelope<{ id: string; status: string }>>(
      `/api/v1/bookings/${bookingId}/cancel`
    );

    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Failed to cancel booking');
    }

    return {
      id: response.data.data.id,
      status: normalizeBookingStatus(response.data.data.status),
    };
  },
};

export default marketplaceApi;
