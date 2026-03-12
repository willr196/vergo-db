/**
 * VERGO API Client
 * Axios instance with auth interceptors and error handling
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';

// VERGO Backend API
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://vergo-app.fly.dev';

export interface AuthFailureInfo {
  message: string;
  code?: string;
  status?: number;
  reauthRequired?: boolean;
  forceLogout?: boolean;
}

type AuthFailureHandler = (info: AuthFailureInfo) => void;

let authFailureHandler: AuthFailureHandler | null = null;

export function registerAuthFailureHandler(handler: AuthFailureHandler | null): void {
  authFailureHandler = handler;
}

function notifyAuthFailure(info: AuthFailureInfo): void {
  try {
    authFailureHandler?.(info);
  } catch (error) {
    logger.warn('Auth failure handler threw an error:', error);
  }
}

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'vergo_access_token',
  REFRESH_TOKEN: 'vergo_refresh_token',
  USER_TYPE: 'vergo_user_type',
  USER_DATA: 'vergo_user_data',
  LAST_ACTIVE: 'vergo_last_active',
  BIOMETRIC_ENABLED: 'vergo_biometric_enabled',
  BIOMETRIC_ASKED: 'vergo_biometric_asked',
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
    console.log(`[VERGO API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => {
    console.log(`[VERGO API] ${response.status} ${response.config.url}`);
    return response;
  },
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
          }, { timeout: 10000 });
          
          const { token: newToken, refreshToken: newRefreshToken } = response.data as { token?: string; refreshToken?: string };
          if (!newToken) {
            throw new Error('Token refresh response missing access token');
          }
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
        const formattedRefreshError = axios.isAxiosError(refreshError)
          ? formatError(refreshError)
          : {
              message: refreshError instanceof Error ? refreshError.message : 'Token refresh failed',
              code: 'TOKEN_REFRESH_FAILED',
            };
        const isRefreshTokenReplay = formattedRefreshError.code === 'REFRESH_TOKEN_REUSE_DETECTED';
        const forceLogout = Boolean(
          formattedRefreshError.forceLogout ||
          formattedRefreshError.reauthRequired ||
          isRefreshTokenReplay
        );

        await clearAuthTokens();

        if (forceLogout) {
          notifyAuthFailure({
            message: isRefreshTokenReplay
              ? 'Session security issue detected. Please sign in again.'
              : formattedRefreshError.message,
            code: formattedRefreshError.code,
            status: formattedRefreshError.status,
            forceLogout: true,
            reauthRequired: true,
          });
        }

        return Promise.reject({
          ...formattedRefreshError,
          forceLogout,
          reauthRequired: forceLogout || formattedRefreshError.reauthRequired,
        } as ApiError);
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
  reauthRequired?: boolean;
  forceLogout?: boolean;
}

function formatError(error: AxiosError): ApiError {
  if (error.response) {
    // Server responded with error
    const data = error.response.data as Record<string, unknown>;
    const code = data.code as string | undefined;
    const isRefreshTokenReplay = code === 'REFRESH_TOKEN_REUSE_DETECTED';
    return {
      message: (data.message as string) || (data.error as string) || 'An error occurred',
      code,
      status: error.response.status,
      details: data.details as Record<string, unknown>,
      reauthRequired: Boolean(data.reauthRequired) || isRefreshTokenReplay,
      forceLogout: Boolean(data.forceLogout) || isRefreshTokenReplay,
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
  await SecureStore.deleteItemAsync(STORAGE_KEYS.LAST_ACTIVE);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED);
  await SecureStore.deleteItemAsync(STORAGE_KEYS.BIOMETRIC_ASKED);
}

export async function getAccessToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
}

export default apiClient;
