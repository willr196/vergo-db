/**
 * Authentication API Service
 * Updated to match VERGO backend format
 */

import apiClient, { setAuthTokens, clearAuthTokens, STORAGE_KEYS } from './client';
import * as SecureStore from 'expo-secure-store';
import { normalizeClientCompany, normalizeJobSeeker } from './normalizers';
import { logger } from '../utils/logger';
import {
  isBiometricEnabled,
  isBiometricAvailable,
  authenticateWithBiometrics,
} from '../utils/biometrics';
import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RegisterJobSeekerRequest,
  RegisterClientRequest,
  JobSeeker,
  ClientCompany,
  UserType,
} from '../types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Backend response types (matching your API)
interface BackendAuthResponse {
  ok: boolean;
  error?: string;
  code?: string;
  user?: Partial<JobSeeker> | Partial<ClientCompany>;
  token?: string;
  refreshToken?: string;
  message?: string;
  requiresVerification?: boolean;
}

function parseUserType(value: string | null): UserType | null {
  if (value === 'jobseeker' || value === 'client') {
    return value;
  }
  return null;
}

function normalizeAuthUser(
  userType: 'jobseeker',
  user: Partial<JobSeeker> | Partial<ClientCompany>
): JobSeeker;
function normalizeAuthUser(
  userType: 'client',
  user: Partial<JobSeeker> | Partial<ClientCompany>
): ClientCompany;
function normalizeAuthUser(
  userType: UserType,
  user: Partial<JobSeeker> | Partial<ClientCompany>
): AuthUser;
function normalizeAuthUser(
  userType: UserType,
  user: Partial<JobSeeker> | Partial<ClientCompany>
): AuthUser {
  if (userType === 'jobseeker') {
    return normalizeJobSeeker(user as Partial<JobSeeker>);
  }
  return normalizeClientCompany(user as Partial<ClientCompany>);
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
      const normalizedUser = normalizeAuthUser(credentials.userType, user);
      
      // Store tokens
      await setAuthTokens(token, refreshToken || token);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_TYPE, credentials.userType);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      await SecureStore.setItemAsync(STORAGE_KEYS.LAST_ACTIVE, Date.now().toString());

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
      const normalizedUser = normalizeAuthUser('jobseeker', user);
      
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
      const normalizedUser = normalizeAuthUser('client', user);
      
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
      const storedUserType = await SecureStore.getItemAsync(STORAGE_KEYS.USER_TYPE);
      const userType = parseUserType(storedUserType);
      const refreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
      const endpoint = userType === 'client' ? '/api/v1/client/mobile/logout' : '/api/v1/user/mobile/logout';
      await apiClient.post(endpoint, { refreshToken });
    } catch (error) {
      logger.warn('Logout API call failed:', error);
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
      return normalizeAuthUser(userType, response.data.user);
    }
    
    throw new Error(response.data.error || 'Failed to get user');
  },

  /**
   * Request password reset
   */
  async forgotPassword(email: string, userType: UserType): Promise<void> {
    const endpoint = userType === 'jobseeker' 
      ? '/api/v1/user/mobile/forgot-password'
      : '/api/v1/client/mobile/forgot-password';
    
    await apiClient.post(endpoint, { email });
  },

  /**
   * Update job seeker profile
   */
  async updateJobSeekerProfile(data: Partial<JobSeeker>): Promise<JobSeeker> {
    const response = await apiClient.put<BackendAuthResponse>('/api/v1/user/mobile/profile', data);
    
    if (response.data.ok && response.data.user) {
      const normalizedUser = normalizeAuthUser('jobseeker', response.data.user);
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
      const normalizedUser = normalizeAuthUser('client', response.data.user);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      return normalizedUser;
    }
    
    throw new Error(response.data.error || 'Failed to update profile');
  },

  /**
   * Check if user is authenticated (from stored tokens)
   */
  async checkAuth(): Promise<{ isAuthenticated: boolean; userType: UserType | null; user: AuthUser | null }> {
    try {
      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      const storedUserType = await SecureStore.getItemAsync(STORAGE_KEYS.USER_TYPE);
      const userType = parseUserType(storedUserType);
      const userData = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);

      if (token && userType && userData) {
        // Inactivity check: auto-logout after 30 days of no app usage
        const lastActive = await SecureStore.getItemAsync(STORAGE_KEYS.LAST_ACTIVE);
        if (lastActive) {
          const elapsed = Date.now() - parseInt(lastActive, 10);
          if (elapsed > THIRTY_DAYS_MS) {
            logger.info('Session expired due to inactivity (30 days)');
            await clearAuthTokens();
            return { isAuthenticated: false, userType: null, user: null };
          }
        }

        try {
          const parsedUser = JSON.parse(userData) as Partial<JobSeeker> | Partial<ClientCompany>;
          const user = normalizeAuthUser(userType, parsedUser);

          // Biometric gate: if the user has enabled biometric unlock, require it
          const biometricEnabled = await isBiometricEnabled();
          if (biometricEnabled) {
            const available = await isBiometricAvailable();
            if (available) {
              const passed = await authenticateWithBiometrics('Sign in to VERGO');
              if (!passed) {
                await clearAuthTokens();
                return { isAuthenticated: false, userType: null, user: null };
              }
            }
          }

          // Update last active timestamp on each successful session restore
          await SecureStore.setItemAsync(STORAGE_KEYS.LAST_ACTIVE, Date.now().toString());
          return { isAuthenticated: true, userType, user };
        } catch {
          // JSON parsing failed — clear corrupted tokens
          await clearAuthTokens();
          return { isAuthenticated: false, userType: null, user: null };
        }
      }

      return { isAuthenticated: false, userType: null, user: null };
    } catch (error) {
      logger.warn('Auth check failed:', error);
      await clearAuthTokens();
      return { isAuthenticated: false, userType: null, user: null };
    }
  },

  /**
   * Upload a job seeker profile photo.
   * Sends the image as multipart/form-data; backend returns the updated user.
   */
  async uploadJobSeekerAvatar(imageUri: string): Promise<JobSeeker> {
    const filename = imageUri.split('/').pop() ?? 'avatar.jpg';
    const ext = (filename.split('.').pop() ?? 'jpg').toLowerCase();
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

    const formData = new FormData();
    formData.append('avatar', { uri: imageUri, name: filename, type: mimeType } as unknown as Blob);

    const response = await apiClient.post<BackendAuthResponse>(
      '/api/v1/user/mobile/profile/avatar',
      formData,
    );

    if (response.data.ok && response.data.user) {
      const normalizedUser = normalizeAuthUser('jobseeker', response.data.user);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      return normalizedUser;
    }

    throw new Error(response.data.error || 'Failed to upload avatar');
  },

  /**
   * Upload a client company logo.
   * Sends the image as multipart/form-data; backend returns the updated company.
   */
  async uploadClientLogo(imageUri: string): Promise<ClientCompany> {
    const filename = imageUri.split('/').pop() ?? 'logo.jpg';
    const ext = (filename.split('.').pop() ?? 'jpg').toLowerCase();
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;

    const formData = new FormData();
    formData.append('logo', { uri: imageUri, name: filename, type: mimeType } as unknown as Blob);

    const response = await apiClient.post<BackendAuthResponse>(
      '/api/v1/client/mobile/profile/logo',
      formData,
    );

    if (response.data.ok && response.data.user) {
      const normalizedUser = normalizeAuthUser('client', response.data.user);
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(normalizedUser));
      return normalizedUser;
    }

    throw new Error(response.data.error || 'Failed to upload logo');
  },

  /**
   * Register push notification token
   */
  async registerPushToken(token: string): Promise<void> {
    await apiClient.post('/api/v1/mobile/notifications/register', { pushToken: token });
  },
};

export default authApi;
