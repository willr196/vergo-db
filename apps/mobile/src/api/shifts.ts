import apiClient from './client';
import type { BookingStatus, Shift } from '../types';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ShiftListResponse {
  shifts: Shift[];
  pagination: Pagination;
}

export interface ShiftListFilters {
  status?: BookingStatus;
  view?: 'upcoming' | 'history';
  page?: number;
  limit?: number;
}

export const shiftsApi = {
  async getShifts({ status, view, page = 1, limit = 20 }: ShiftListFilters = {}): Promise<ShiftListResponse> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    if (view) params.set('view', view);
    const response = await apiClient.get<ApiEnvelope<ShiftListResponse>>(
      `/api/v1/mobile/shifts?${params.toString()}`
    );
    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Failed to load shifts');
    }
    return response.data.data;
  },

  async getShift(shiftId: string): Promise<Shift> {
    const response = await apiClient.get<ApiEnvelope<Shift>>(`/api/v1/mobile/shifts/${shiftId}`);
    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Shift not found');
    }
    return response.data.data;
  },

  async confirmShift(shiftId: string): Promise<Shift> {
    const response = await apiClient.post<ApiEnvelope<Shift>>(
      `/api/v1/mobile/shifts/${shiftId}/confirm`,
      { acceptedTerms: true }
    );
    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Failed to confirm shift');
    }
    return response.data.data;
  },

  async declineShift(shiftId: string, reason?: string): Promise<Shift> {
    const response = await apiClient.post<ApiEnvelope<Shift>>(
      `/api/v1/mobile/shifts/${shiftId}/decline`,
      reason ? { reason } : {}
    );
    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Failed to decline shift');
    }
    return response.data.data;
  },

  async checkIn(shiftId: string): Promise<Shift> {
    const response = await apiClient.post<ApiEnvelope<Shift>>(
      `/api/v1/mobile/shifts/${shiftId}/check-in`,
      {}
    );
    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Failed to check in');
    }
    return response.data.data;
  },

  async checkOut(shiftId: string, notes?: string): Promise<Shift> {
    const response = await apiClient.post<ApiEnvelope<Shift>>(
      `/api/v1/mobile/shifts/${shiftId}/check-out`,
      notes ? { notes } : {}
    );
    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Failed to check out');
    }
    return response.data.data;
  },
};

export default shiftsApi;
