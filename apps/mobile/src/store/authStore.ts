/**
 * Auth Store
 * Manages authentication state with Zustand
 */

import { create } from 'zustand';
import { authApi } from '../api';
import type {
  JobSeeker,
  ClientCompany,
  UserType,
  LoginRequest,
  RegisterJobSeekerRequest,
  RegisterClientRequest,
} from '../types';
import type { RegistrationResult } from '../api/auth';

interface AuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  userType: UserType | null;
  user: JobSeeker | ClientCompany | null;
  error: string | null;
  
  // Actions
  login: (credentials: LoginRequest) => Promise<void>;
  registerJobSeeker: (data: RegisterJobSeekerRequest) => Promise<RegistrationResult | null>;
  registerClient: (data: RegisterClientRequest) => Promise<RegistrationResult | null>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: Partial<JobSeeker | ClientCompany>) => Promise<void>;
  clearError: () => void;
  setUser: (user: JobSeeker | ClientCompany) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  isLoading: true,
  userType: null,
  user: null,
  error: null,
  
  // Actions
  login: async (credentials) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await authApi.login(credentials);
      
      set({
        isAuthenticated: true,
        isLoading: false,
        userType: response.userType,
        user: response.user,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  
  registerJobSeeker: async (data) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await authApi.registerJobSeeker(data);
      
      if ('requiresVerification' in response && response.requiresVerification) {
        set({
          isAuthenticated: false,
          isLoading: false,
          userType: null,
          user: null,
          error: null,
        });
        return response;
      }

      set({
        isAuthenticated: true,
        isLoading: false,
        userType: response.userType,
        user: response.user,
        error: null,
      });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  
  registerClient: async (data) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await authApi.registerClient(data);
      
      if ('requiresVerification' in response && response.requiresVerification) {
        set({
          isAuthenticated: false,
          isLoading: false,
          userType: null,
          user: null,
          error: null,
        });
        return response;
      }

      set({
        isAuthenticated: true,
        isLoading: false,
        userType: response.userType,
        user: response.user,
        error: null,
      });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  
  logout: async () => {
    set({ isLoading: true });
    
    try {
      await authApi.logout();
    } finally {
      set({
        isAuthenticated: false,
        isLoading: false,
        userType: null,
        user: null,
        error: null,
      });
    }
  },
  
  checkAuth: async () => {
    set({ isLoading: true });
    
    try {
      const { isAuthenticated, userType, user } = await authApi.checkAuth();
      
      if (isAuthenticated && userType && user) {
        // Optionally refresh user data from server
        try {
          const freshUser = await authApi.getCurrentUser(userType);
          set({
            isAuthenticated: true,
            isLoading: false,
            userType,
            user: freshUser,
          });
        } catch (error) {
          await authApi.logout();
          set({
            isAuthenticated: false,
            isLoading: false,
            userType: null,
            user: null,
            error: error instanceof Error ? error.message : 'Authentication expired',
          });
        }
      } else {
        set({
          isAuthenticated: false,
          isLoading: false,
          userType: null,
          user: null,
        });
      }
    } catch {
      set({
        isAuthenticated: false,
        isLoading: false,
        userType: null,
        user: null,
      });
    }
  },
  
  updateProfile: async (data) => {
    const { userType, user } = get();
    
    if (!userType || !user) {
      throw new Error('Not authenticated');
    }
    
    set({ isLoading: true, error: null });
    
    try {
      let updatedUser: JobSeeker | ClientCompany;
      
      if (userType === 'jobseeker') {
        updatedUser = await authApi.updateJobSeekerProfile(data as Partial<JobSeeker>);
      } else {
        updatedUser = await authApi.updateClientProfile(data as Partial<ClientCompany>);
      }
      
      set({
        user: updatedUser,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  
  clearError: () => {
    set({ error: null });
  },
  
  setUser: (user) => {
    set({ user });
  },
}));

// Selectors for common patterns
export const selectIsJobSeeker = (state: AuthState) => state.userType === 'jobseeker';
export const selectIsClient = (state: AuthState) => state.userType === 'client';
export const selectJobSeeker = (state: AuthState) => 
  state.userType === 'jobseeker' ? state.user as JobSeeker : null;
export const selectClient = (state: AuthState) => 
  state.userType === 'client' ? state.user as ClientCompany : null;

export default useAuthStore;
