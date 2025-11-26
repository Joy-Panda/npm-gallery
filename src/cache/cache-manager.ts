import * as vscode from 'vscode';
import { MemoryCache } from './memory-cache';
import { CACHE_TTL } from '../types/config';

/**
 * Two-tier cache manager with memory and persistent storage
 */
export class CacheManager {
  private memoryCache: MemoryCache;
  private context: vscode.ExtensionContext;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.memoryCache = new MemoryCache(500);
    this.context = context;

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Get a value from cache (checks memory first, then persistent)
   */
  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first
    const memoryResult = this.memoryCache.get<T>(key);
    if (memoryResult !== null) {
      return memoryResult;
    }

    // Check persistent cache
    const persistedEntry = this.context.globalState.get<{
      data: T;
      timestamp: number;
      ttl: number;
    }>(this.getPersistentKey(key));

    if (persistedEntry) {
      // Check if expired
      if (Date.now() - persistedEntry.timestamp <= persistedEntry.ttl) {
        // Promote to memory cache
        this.memoryCache.set(key, persistedEntry.data, persistedEntry.ttl);
        return persistedEntry.data;
      } else {
        // Clean up expired entry
        await this.context.globalState.update(this.getPersistentKey(key), undefined);
      }
    }

    return null;
  }

  /**
   * Set a value in cache (both memory and persistent)
   */
  async set<T>(key: string, data: T, ttl: number, persist: boolean = false): Promise<void> {
    // Always set in memory cache
    this.memoryCache.set(key, data, ttl);

    // Optionally persist
    if (persist) {
      await this.context.globalState.update(this.getPersistentKey(key), {
        data,
        timestamp: Date.now(),
        ttl,
      });
    }
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string): Promise<boolean> {
    if (this.memoryCache.has(key)) {
      return true;
    }

    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Delete a specific key from cache
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await this.context.globalState.update(this.getPersistentKey(key), undefined);
  }

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    const count = this.memoryCache.deletePattern(pattern);
    // Note: VS Code globalState doesn't support pattern deletion
    // We would need to track all keys to implement this for persistent storage
    return count;
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    // Note: We can't easily clear all extension globalState keys
    // as there's no built-in method for that
  }

  /**
   * Get cache key for specific data types
   */
  static keys = {
    search: (query: string, from: number, size: number) =>
      `search:${query}:${from}:${size}`,
    package: (name: string) => `package:${name}`,
    packageVersions: (name: string) => `versions:${name}`,
    bundleSize: (name: string, version: string) => `bundle:${name}@${version}`,
    downloads: (name: string) => `downloads:${name}`,
    security: (name: string, version: string) => `security:${name}@${version}`,
  };

  /**
   * Get default TTL for specific data types
   */
  static ttl = CACHE_TTL;

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    this.memoryCache.cleanup();
  }

  /**
   * Get persistent storage key
   */
  private getPersistentKey(key: string): string {
    return `npmGallery.cache.${key}`;
  }

  /**
   * Dispose of cache manager
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
