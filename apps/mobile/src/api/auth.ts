/**
 * Authentication API Service
 * Updated to match VERGO backend format
 */

import apiClient, { setAuthTokens, clearAuthTokens, STORAGE_KEYS } from './client';
import * as SecureStore from 'expo-secure-store';
import { normalizeClientCompany, normalizeJobSeeker } from './normalizers';
import type {
  LoginRequest,
  LoginResponse,
  RegisterJobSeekerRequest,
  RegisterClientRequest,
  JobSeeker,
  ClientCompany,
  UserType,
} from '../types';

// Backend response types (matching your API)
interface BackendAuthResponse {
  ok: boolean;
  error?: string;
  code?: string;
  user?: JobSeeker | ClientCompany;
  token?: string;
  refreshToken?: string;
  message?: string;
  requiresVerification?: boolean;
}

export interface RegistrationResult {
  requiresVerification: boolean;
  message?: string;
}

export type RegisterResponse = LoginResponse | RegistrationResult;

export const authApi = {
  /**
   * Login for job seekers or clients
   * NOTE: Uses /api/v1/user/mobile/login endpoints which return JWT tokens
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const endpoint = credentials.userType === 'jobseeker' 
      ? '/api/v1/user/mobile/login'
      : '/api/v1/client/mobile/login';
    
    const response = await apiClient.post<BackendAuthResponse>(endpoint, {
      email: credentials.email,
      password: credentials.password,
    });
    
    if (response.data.ok && response.data.token && response.data.user) {
      const { token, refreshToken, user } = response.data;
      const normalizedUser = credentials.userType === 'jobseeker'
        ? normalizeJobSeeker(user as JobSeeker)
        : normalizeClientCompany(user as ClientCompany);
      
      // Store tokens
      await setAuthTokens(token, refreshToken || token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_TYPE, credentials.userType);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      
      return {
        token,
        refreshToken: refreshToken || token,
        user: normalizedUser,
        userType: credentials.userType,
      };
    }
    
    throw new Error(response.data.error || 'Login failed');
  },

  /**
   * Register a new job seeker
   */
  async registerJobSeeker(data: RegisterJobSeekerRequest): Promise<RegisterResponse> {
    const response = await apiClient.post<BackendAuthResponse>('/api/v1/user/mobile/register', data);
    
    if (response.data.ok && response.data.token && response.data.user) {
      const { token, refreshToken, user } = response.data;
      const normalizedUser = normalizeJobSeeker(user as JobSeeker);
      
      await setAuthTokens(token, refreshToken || token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_TYPE, 'jobseeker');
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      
      return {
        token,
        refreshToken: refreshToken || token,
        user: normalizedUser,
        userType: 'jobseeker',
      };
    }
    
    if (response.data.ok && response.data.requiresVerification) {
      return {
        requiresVerification: true,
        message: response.data.message || 'Please verify your email to continue.'
      };
    }

    throw new Error(response.data.error || 'Registration failed');
  },

  /**
   * Register a new client company
   */
  async registerClient(data: RegisterClientRequest): Promise<RegisterResponse> {
    const response = await apiClient.post<BackendAuthResponse>('/api/v1/client/mobile/register', data);
    
    if (response.data.ok && response.data.token && response.data.user) {
      const { token, refreshToken, user } = response.data;
      const normalizedUser = normalizeClientCompany(user as ClientCompany);
      
      await setAuthTokens(token, refreshToken || token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_TYPE, 'client');
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      
      return {
        token,
        refreshToken: refreshToken || token,
        user: normalizedUser,
        userType: 'client',
      };
    }
    
    if (response.data.ok && response.data.requiresVerification) {
      return {
        requiresVerification: true,
        message: response.data.message || 'Please verify your email to continue.'
      };
    }

    throw new Error(response.data.error || 'Registration failed');
  },

  /**
   * Logout and clear all tokens
   */
  async logout(): Promise<void> {
    try {
      const userType = await SecureStore.getItemAsync(STORAGE_KEYS.USER_TYPE) as UserType | null;
      const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
      const endpoint = userType === 'client' ? '/api/v1/client/mobile/logout' : '/api/v1/user/mobile/logout';
      await apiClient.post(endpoint, { refreshToken });
    } catch (error) {
      console.warn('Logout API call failed:', error);
    }
    
    await clearAuthTokens();
  },

  /**
   * Get current user profile
   */
  async getCurrentUser(userType: UserType): Promise<JobSeeker | ClientCompany> {
    const endpoint = userType === 'jobseeker' ? '/api/v1/user/mobile/me' : '/api/v1/client/mobile/me';
    const response = await apiClient.get<BackendAuthResponse>(endpoint);
    
    if (response.data.ok && response.data.user) {
      return userType === 'jobseeker'
        ? normalizeJobSeeker(response.data.user as JobSeeker)
        : normalizeClientCompany(response.data.user as ClientCompany);
    }
    
    throw new Error(response.data.error || 'Failed to get user');
  },

  /**
   * Request password reset
   */
  async forgotPassword(email: string, userType: UserType): Promise<void> {
    const endpoint = userType === 'jobseeker' 
      ? '/api/v1/user/forgot-password' 
      : '/api/v1/client/forgot-password';
    
    await apiClient.post(endpoint, { email });
  },

  /**
   * Update job seeker profile
   */
  async updateJobSeekerProfile(data: Partial<JobSeeker>): Promise<JobSeeker> {
    const response = await apiClient.put<BackendAuthResponse>('/api/v1/user/mobile/profile', data);
    
    if (response.data.ok && response.data.user) {
      const normalizedUser = normalizeJobSeeker(response.data.user as JobSeeker);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      return normalizedUser;
    }
    
    throw new Error(response.data.error || 'Failed to update profile');
  },

  /**
   * Update client company profile
   */
  async updateClientProfile(data: Partial<ClientCompany>): Promise<ClientCompany> {
    const response = await apiClient.put<BackendAuthResponse>('/api/v1/client/mobile/profile', data);
    
    if (response.data.ok && response.data.user) {
      const normalizedUser = normalizeClientCompany(response.data.user as ClientCompany);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      return normalizedUser;
    }
    
    throw new Error(response.data.error || 'Failed to update profile');
  },

  /**
   * Check if user is authenticated (from stored tokens)
   */
  async checkAuth(): Promise<{ isAuthenticated: boolean; userType: UserType | null; user: JobSeeker | ClientCompany | null }> {
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      const userType = await SecureStore.getItemAsync(STORAGE_KEYS.USER_TYPE) as UserType | null;
      const userData = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
      
      if (token && userType && userData) {
        const parsedUser = JSON.parse(userData) as JobSeeker | ClientCompany;
        const user = userType === 'jobseeker'
          ? normalizeJobSeeker(parsedUser as JobSeeker)
          : normalizeClientCompany(parsedUser as ClientCompany);
        return { isAuthenticated: true, userType, user };
      }
      
      return { isAuthenticated: false, userType: null, user: null };
    } catch (error) {
      console.warn('Auth check failed:', error);
      return { isAuthenticated: false, userType: null, user: null };
    }
  },

  /**
   * Register push notification token
   */
  async registerPushToken(token: string): Promise<void> {
    await apiClient.post('/api/v1/notifications/register', { pushToken: token });
  },
};

export default authApi;
