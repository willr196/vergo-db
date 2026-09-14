import apiClient from '../client';
import { authApi } from '../auth';

jest.mock('../client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
  },
  setAuthTokens: jest.fn(),
  clearAuthTokens: jest.fn(),
  STORAGE_KEYS: {
    ACCESS_TOKEN: 'vergo_access_token',
    REFRESH_TOKEN: 'vergo_refresh_token',
    USER_TYPE: 'vergo_user_type',
    USER_DATA: 'vergo_user_data',
    LAST_ACTIVE: 'vergo_last_active',
    BIOMETRIC_ENABLED: 'vergo_biometric_enabled',
    BIOMETRIC_ASKED: 'vergo_biometric_asked',
  },
}));

jest.mock('../../utils/biometrics', () => ({
  isBiometricEnabled: jest.fn().mockResolvedValue(false),
  isBiometricAvailable: jest.fn().mockResolvedValue(false),
  authenticateWithBiometrics: jest.fn().mockResolvedValue(true),
}));

describe('authApi client payloads', () => {
  const mockedApiClient = apiClient as unknown as {
    post: jest.Mock;
    put: jest.Mock;
  };

  beforeEach(() => {
    mockedApiClient.post.mockReset();
    mockedApiClient.put.mockReset();
  });

  it('maps registerClient to the mobile client schema', async () => {
    mockedApiClient.post.mockResolvedValue({
      data: {
        ok: true,
        requiresVerification: true,
        message: 'Check your email',
      },
    });

    const result = await authApi.registerClient({
      email: 'client@example.com',
      password: 'Secret123',
      companyName: 'Acme Events',
      contactFirstName: 'Jane',
      contactLastName: 'Smith',
      phone: ' +44 7700 900123 ',
    });

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/v1/client/mobile/register', {
      email: 'client@example.com',
      password: 'Secret123',
      companyName: 'Acme Events',
      contactName: 'Jane Smith',
      phone: '+44 7700 900123',
    });
    expect(result).toEqual({
      requiresVerification: true,
      message: 'Check your email',
    });
  });

  it('maps updateClientProfile to the supported mobile profile fields', async () => {
    mockedApiClient.put.mockResolvedValue({
      data: {
        ok: true,
        user: {
          id: 'client-1',
          email: 'client@example.com',
          companyName: 'Acme Events',
          contactName: 'Jane Smith',
          phone: '+44 7700 900123',
          website: '',
          postcode: 'SW1A 1AA',
          description: 'Full-service event staffing',
          address: '1 Example Street',
          city: 'London',
          status: 'APPROVED',
        },
      },
    });

    await authApi.updateClientProfile({
      companyName: ' Acme Events ',
      contactFirstName: ' Jane ',
      contactLastName: ' Smith ',
      phone: ' +44 7700 900123 ',
      website: ' ',
      postcode: ' SW1A 1AA ',
      description: ' Full-service event staffing ',
      address: ' 1 Example Street ',
      city: ' London ',
    } as any);

    expect(mockedApiClient.put).toHaveBeenCalledWith('/api/v1/client/mobile/profile', {
      companyName: 'Acme Events',
      contactName: 'Jane Smith',
      phone: '+44 7700 900123',
      website: '',
      postcode: 'SW1A 1AA',
      description: 'Full-service event staffing',
      address: '1 Example Street',
      city: 'London',
    });
  });
});
