/**
 * Auth Store
 * Manages authentication state with Zustand
 */

import { create } from 'zustand';
import { authApi, registerAuthFailureHandler } from '../api';
import { isClientCompanyUser, isJobSeekerUser } from '../types';
import type {
  AuthUser,
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
  user: AuthUser | null;
  error: string | null;
  
  // Actions
  login: (credentials: LoginRequest) => Promise<void>;
  registerJobSeeker: (data: RegisterJobSeekerRequest) => Promise<RegistrationResult | null>;
  registerClient: (data: RegisterClientRequest) => Promise<RegistrationResult | null>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: Partial<AuthUser>) => Promise<void>;
  clearError: () => void;
  setUser: (user: AuthUser) => void;
}

// Helper function to handle registration logic
async function handleRegistration(
  registrationFn: () => Promise<import('../api/auth').RegisterResponse>,
  set: (state: Partial<AuthState>) => void
): Promise<RegistrationResult | null> {
  set({ isLoading: true, error: null });

  try {
    const response = await registrationFn();

    // Check if email verification is required
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

    if (!('token' in response) || !('user' in response) || !('userType' in response)) {
      throw new Error('Unexpected registration response');
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
    return handleRegistration(
      () => authApi.registerJobSeeker(data),
      set
    );
  },

  registerClient: async (data) => {
    return handleRegistration(
      () => authApi.registerClient(data),
      set
    );
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
      console.log('[VERGO] checkAuth: reading tokens...');
      const { isAuthenticated, userType, user } = await authApi.checkAuth();
      console.log('[VERGO] checkAuth: tokens found?', isAuthenticated);

      if (!isAuthenticated || !userType || !user) {
        set({
          isAuthenticated: false,
          isLoading: false,
          userType: null,
          user: null,
        });
        return;
      }
      
      console.log('[VERGO] checkAuth: refreshing user from server...');
      try {
        const freshUser = await authApi.getCurrentUser(userType);
        set({
          isAuthenticated: true,
          isLoading: false,
          userType,
          user: freshUser,
        });
      } catch (error) {
        // Only force logout on genuine auth failures (401/403).
        // For network errors or server outages, keep the cached user so
        // the app remains usable offline.
        const status = (error as { status?: number })?.status;
        const isAuthFailure = status === 401 || status === 403;
        if (isAuthFailure) {
          try {
            await authApi.logout();
          } catch (logoutError) {
            console.log('[VERGO] checkAuth: logout after auth failure failed:', logoutError);
          }
          set({
            isAuthenticated: false,
            isLoading: false,
            userType: null,
            user: null,
            error: error instanceof Error ? error.message : 'Authentication expired',
          });
        } else {
          // Network or server error — stay logged in with cached data
          set({ isAuthenticated: true, isLoading: false, userType, user });
        }
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
      let updatedUser: AuthUser;

      if (userType === 'jobseeker' && isJobSeekerUser(user)) {
        updatedUser = await authApi.updateJobSeekerProfile(data as Partial<JobSeeker>);
      } else if (userType === 'client' && isClientCompanyUser(user)) {
        updatedUser = await authApi.updateClientProfile(data as Partial<ClientCompany>);
      } else {
        throw new Error('Authenticated user type mismatch');
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

registerAuthFailureHandler((info) => {
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    userType: null,
    user: null,
    error: info.code === 'REFRESH_TOKEN_REUSE_DETECTED'
      ? 'For security, you were signed out because your session token was reused. Please sign in again.'
      : info.message || 'Session expired. Please sign in again.',
  });
});

// Selectors for common patterns
export const selectIsJobSeeker = (state: AuthState) => state.userType === 'jobseeker';
export const selectIsClient = (state: AuthState) => state.userType === 'client';
export const selectJobSeeker = (state: AuthState) => 
  state.user && isJobSeekerUser(state.user) ? state.user : null;
export const selectClient = (state: AuthState) => 
  state.user && isClientCompanyUser(state.user) ? state.user : null;

export default useAuthStore;
