/**
 * VERGO API
 * Central export for all API services
 */

export {
  default as apiClient,
  setAuthTokens,
  clearAuthTokens,
  getAccessToken,
  STORAGE_KEYS,
} from './client';

export { authApi } from './auth';
export { jobsApi } from './jobs';
export { applicationsApi } from './applications';

// NEW: Client API for quotes-based dashboard
export { 
  clientApi, 
  QUOTE_STATUS_CONFIG,
  getQuoteStatusConfig,
} from './clientApi';

export type {
  ClientStats,
  QuoteRequest,
  QuoteStatus,
  CreateQuoteRequest,
  PaginatedQuotesResponse,
} from './clientApi';
