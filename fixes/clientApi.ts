/**
 * Client API Service
 * API methods for client mobile dashboard (quotes-based)
 */

import apiClient from './client';

// ============================================
// Types
// ============================================

export interface ClientStats {
  totalQuotes: number;
  pending: number;
  quoted: number;
  accepted: number;
  completed: number;
  activeQuotes: number;
}

export interface QuoteRequest {
  id: string;
  eventType: string;
  eventDate: string | null;
  eventEndDate: string | null;
  location: string;
  venue: string | null;
  staffCount: number;
  roles: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  description: string | null;
  budget: string | null;
  status: QuoteStatus;
  quotedAmount: number | null;
  quoteSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type QuoteStatus = 'new' | 'quoted' | 'accepted' | 'rejected' | 'completed' | 'cancelled';

export interface CreateQuoteRequest {
  eventType: string;
  eventDate?: string;
  eventEndDate?: string;
  location: string;
  venue?: string;
  staffCount: number;
  roles: string;
  shiftStart?: string;
  shiftEnd?: string;
  description?: string;
  budget?: string;
}

interface BackendResponse<T> {
  ok: boolean;
  error?: string;
  stats?: T;
  quote?: T;
  quotes?: T[];
  data?: T | { quotes?: T[]; pagination?: PaginationInfo };
  pagination?: PaginationInfo;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedQuotesResponse {
  ok: boolean;
  quotes: QuoteRequest[];
  pagination: PaginationInfo;
}

// ============================================
// Client API
// ============================================

export const clientApi = {
  /**
   * Get dashboard statistics
   */
  async getStats(): Promise<ClientStats> {
    const response = await apiClient.get<BackendResponse<ClientStats>>(
      '/api/v1/client/mobile/stats'
    );
    
    if (response.data.ok && (response.data.stats || response.data.data)) {
      const stats = response.data.stats || response.data.data as ClientStats;
      return {
        totalQuotes: stats.totalQuotes || 0,
        pending: stats.pending || 0,
        quoted: stats.quoted || 0,
        accepted: stats.accepted || 0,
        completed: stats.completed || 0,
        activeQuotes: stats.activeQuotes || (stats.pending || 0) + (stats.quoted || 0),
      };
    }
    
    // Return empty stats on error
    return {
      totalQuotes: 0,
      pending: 0,
      quoted: 0,
      accepted: 0,
      completed: 0,
      activeQuotes: 0,
    };
  },

  /**
   * Get all quotes for the client
   */
  async getQuotes(
    status?: QuoteStatus,
    page = 1,
    limit = 20
  ): Promise<PaginatedQuotesResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (status) params.append('status', status);
    
    const response = await apiClient.get<BackendResponse<QuoteRequest[]>>(
      `/api/v1/client/mobile/quotes?${params.toString()}`
    );
    
    if (response.data.ok) {
      const quotes = response.data.quotes || 
        (response.data.data as { quotes?: QuoteRequest[] })?.quotes || 
        [];
      
      return {
        ok: true,
        quotes: quotes.map(normalizeQuote),
        pagination: response.data.pagination || {
          page,
          limit,
          total: quotes.length,
          totalPages: 1,
          hasMore: false,
        },
      };
    }
    
    return {
      ok: false,
      quotes: [],
      pagination: { page, limit, total: 0, totalPages: 1, hasMore: false },
    };
  },

  /**
   * Get a single quote by ID
   */
  async getQuote(quoteId: string): Promise<QuoteRequest> {
    const response = await apiClient.get<BackendResponse<QuoteRequest>>(
      `/api/v1/client/mobile/quotes/${quoteId}`
    );
    
    if (response.data.ok && (response.data.quote || response.data.data)) {
      return normalizeQuote((response.data.quote || response.data.data) as QuoteRequest);
    }
    
    throw new Error(response.data.error || 'Quote not found');
  },

  /**
   * Create a new quote request
   */
  async createQuote(data: CreateQuoteRequest): Promise<QuoteRequest> {
    const response = await apiClient.post<BackendResponse<QuoteRequest>>(
      '/api/v1/client/mobile/quotes',
      data
    );
    
    if (response.data.ok && (response.data.quote || response.data.data)) {
      return normalizeQuote((response.data.quote || response.data.data) as QuoteRequest);
    }
    
    throw new Error(response.data.error || 'Failed to create quote request');
  },

  /**
   * Cancel a quote request (only if status is 'new')
   */
  async cancelQuote(quoteId: string): Promise<void> {
    const response = await apiClient.delete<BackendResponse<void>>(
      `/api/v1/client/mobile/quotes/${quoteId}`
    );
    
    if (!response.data.ok) {
      throw new Error(response.data.error || 'Failed to cancel quote');
    }
  },
};

// ============================================
// Helpers
// ============================================

function normalizeQuote(quote: QuoteRequest): QuoteRequest {
  return {
    ...quote,
    // Ensure status is lowercase for frontend consistency
    status: (quote.status?.toLowerCase() || 'new') as QuoteStatus,
  };
}

// Status display helpers
export const QUOTE_STATUS_CONFIG: Record<QuoteStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  new: {
    label: 'Pending',
    color: '#D4AF37',
    bgColor: 'rgba(212, 175, 55, 0.15)',
    icon: '⏳',
  },
  quoted: {
    label: 'Quoted',
    color: '#17a2b8',
    bgColor: 'rgba(23, 162, 184, 0.15)',
    icon: '💰',
  },
  accepted: {
    label: 'Accepted',
    color: '#28a745',
    bgColor: 'rgba(40, 167, 69, 0.15)',
    icon: '✅',
  },
  rejected: {
    label: 'Declined',
    color: '#dc3545',
    bgColor: 'rgba(220, 53, 69, 0.15)',
    icon: '❌',
  },
  completed: {
    label: 'Completed',
    color: '#6c757d',
    bgColor: 'rgba(108, 117, 125, 0.15)',
    icon: '🎉',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#6c757d',
    bgColor: 'rgba(108, 117, 125, 0.15)',
    icon: '🚫',
  },
};

export function getQuoteStatusConfig(status: QuoteStatus) {
  return QUOTE_STATUS_CONFIG[status] || QUOTE_STATUS_CONFIG.new;
}

export default clientApi;
