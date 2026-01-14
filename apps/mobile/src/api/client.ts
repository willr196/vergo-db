/**
 * VERGO API Client
 * Axios instance with auth interceptors and error handling
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';

// VERGO Backend API
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://vergo-app.fly.dev';

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'vergo_access_token',
  REFRESH_TOKEN: 'vergo_refresh_token',
  USER_TYPE: 'vergo_user_type',
  USER_DATA: 'vergo_user_data',
} as const;

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      logger.warn('Failed to get auth token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    // Handle 401 - attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
        const userType = await SecureStore.getItemAsync(STORAGE_KEYS.USER_TYPE);
        
        if (refreshToken) {
          const refreshEndpoint = userType === 'client'
            ? `${API_BASE_URL}/api/v1/client/mobile/refresh`
            : `${API_BASE_URL}/api/v1/user/mobile/refresh`;
          const response = await axios.post(refreshEndpoint, {
            refreshToken,
          });
          
          const { token: newToken, refreshToken: newRefreshToken } = response.data as { token: string; refreshToken?: string };
          await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, newToken);
          if (newRefreshToken) {
            await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);
          }
          
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }
          
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        logger.warn('Token refresh failed:', refreshError);
        // Token refresh failed - clear tokens and redirect to login
        await clearAuthTokens();
        // The auth store will handle redirect
      }
    }
    
    return Promise.reject(formatError(error));
  }
);

// Error formatting
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

function formatError(error: AxiosError): ApiError {
  if (error.response) {
    // Server responded with error
    const data = error.response.data as Record<string, unknown>;
    return {
      message: (data.message as string) || (data.error as string) || 'An error occurred',
      code: data.code as string,
      status: error.response.status,
      details: data.details as Record<string, unknown>,
    };
  } else if (error.request) {
    // Request made but no response
    return {
      message: 'Network error. Please check your connection.',
      code: 'NETWORK_ERROR',
    };
  } else {
    // Request setup error
    return {
      message: error.message || 'An unexpected error occurred',
      code: 'REQUEST_ERROR',
    };
  }
}

// Auth token helpers
export async function setAuthTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
}

export async function clearAuthTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_TYPE);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
}

export async function getAccessToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
}

export default apiClient;
