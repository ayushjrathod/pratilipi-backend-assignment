import Axios, { AxiosError, AxiosInstance } from 'axios';
import { axios } from '../infrastructure/http';

interface User {
  _id: string;
  [key: string]: any;
}

interface SigninInput {
  email: string;
  password: string;
}

interface SigninResult {
  access_token: string;
  user: User;
}

interface ServiceResponse<T> {
  result: T;
  error?: string;
}

class UserServiceError extends Error {
  constructor(
    message: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

const client: AxiosInstance = Axios.create({
  ...axios.defaults,
  baseURL: process.env['USERS_SERVICE_URL'],
});

const UserService = {
  async getAll(): Promise<User[]> {
    try {
      const { data } = await client.get<ServiceResponse<User[]>>('/');
      return data.result;
    } catch (error) {
      throw new UserServiceError('Unable to fetch users', error);
    }
  },

  async getById({ _id }: { _id: string }): Promise<User> {
    if (!_id) {
      throw new UserServiceError('User ID is required');
    }

    try {
      const { data } = await client.get<ServiceResponse<User>>(`/${_id}`);
      return data.result;
    } catch (error) {
      throw new UserServiceError(`Unable to fetch user with ID: ${_id}`, error);
    }
  },

  async signup({ input }: { input: Partial<User> }): Promise<User> {
    try {
      const { data } = await client.post<ServiceResponse<User>>('/', input);

      if (!data?.result) {
        throw new UserServiceError('Invalid server response');
      }

      return data.result;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data?.message) {
        throw new UserServiceError(error.response.data.message, error);
      }
      throw new UserServiceError('Failed to create user', error);
    }
  },

  async signin({ input }: { input: SigninInput }): Promise<SigninResult> {
    try {
      const { data } = await client.post<ServiceResponse<SigninResult>>('/login', input);

      if (!data?.result?.access_token || !data?.result?.user) {
        throw new UserServiceError('Invalid login response');
      }

      return data.result;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data?.error) {
        throw new UserServiceError(error.response.data.error, error);
      }
      throw new UserServiceError('Login failed', error);
    }
  },

  async updatePreferences({
    id,
    preferences,
  }: {
    id: string;
    preferences: Record<string, any>;
  }): Promise<User> {
    try {
      const { data } = await client.put<ServiceResponse<User>>(`/${id}/preferences`, preferences);
      return data.result;
    } catch (error) {
      throw new UserServiceError(`Unable to update preferences for user ID ${id}`, error);
    }
  },
} as const;

export { UserService, UserServiceError };
export type { SigninInput, SigninResult, User };
