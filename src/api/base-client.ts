import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

/**
 * API error types
 */
export enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Custom API error class
 */
export class ApiError extends Error {
  constructor(
    public type: ApiErrorType,
    public statusCode?: number,
    public retryAfter?: number,
    public originalError?: unknown
  ) {
    super(`API Error: ${type}${statusCode ? ` (${statusCode})` : ''}`);
    this.name = 'ApiError';
  }
}

/**
 * Base API client with Axios
 */
export abstract class BaseApiClient {
  protected client: AxiosInstance;
  protected serviceName: string;

  constructor(baseURL: string, serviceName: string, timeout: number = 10000) {
    this.serviceName = serviceName;
    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'npm-gallery-vscode/1.0.0',
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        throw this.handleAxiosError(error);
      }
    );
  }

  /**
   * Make a GET request
   */
  protected async get<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(endpoint, config);
    return response.data;
  }

  /**
   * Make a POST request
   */
  protected async post<T>(endpoint: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(endpoint, data, config);
    return response.data;
  }

  /**
   * Handle Axios errors and convert to ApiError
   */
  private handleAxiosError(error: AxiosError): ApiError {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiError(ApiErrorType.TIMEOUT, undefined, undefined, error);
    }

    if (!error.response) {
      return new ApiError(ApiErrorType.NETWORK_ERROR, undefined, undefined, error);
    }

    const status = error.response.status;

    switch (status) {
      case 404:
        return new ApiError(ApiErrorType.NOT_FOUND, status, undefined, error);
      case 429: {
        const retryAfter = parseInt(
          (error.response.headers['retry-after'] as string) || '60',
          10
        );
        return new ApiError(ApiErrorType.RATE_LIMITED, status, retryAfter, error);
      }
      case 500:
      case 502:
      case 503:
      case 504:
        return new ApiError(ApiErrorType.SERVER_ERROR, status, undefined, error);
      default:
        return new ApiError(ApiErrorType.SERVER_ERROR, status, undefined, error);
    }
  }

  /**
   * Encode package name for URL (handle scoped packages)
   */
  protected encodePackageName(name: string): string {
    if (name.startsWith('@')) {
      return '@' + encodeURIComponent(name.slice(1));
    }
    return encodeURIComponent(name);
  }
}
