/**
 * Source capability enumeration
 * Defines all possible capability types that sources can support
 */
export enum SourceCapability {
  // Core capabilities (all sources must support)
  SEARCH = 'search',
  PACKAGE_INFO = 'packageInfo',
  PACKAGE_DETAILS = 'packageDetails',
  VERSIONS = 'versions',
  
  // Optional capabilities
  INSTALLATION = 'installation', // For package managers that support direct install (npm, go, etc.)
  COPY = 'copy', // For package managers that require copying snippets (Maven, Gradle, etc.)
  SUGGESTIONS = 'suggestions',
  DEPENDENCIES = 'dependencies',
  DOCUMENTATION = 'documentation', // README
  SECURITY = 'security',
  BUNDLE_SIZE = 'bundleSize',
  DOWNLOAD_STATS = 'downloadStats',
  QUALITY_SCORE = 'qualityScore',
  DEPENDENTS = 'dependents',
  REQUIREMENTS = 'requirements',
}

/**
 * Capability support information
 */
export interface CapabilitySupport {
  capability: SourceCapability;
  supported: boolean;
  reason?: string; // Reason if not supported
}

/**
 * Capability not supported error
 */
export class CapabilityNotSupportedError extends Error {
  constructor(
    public readonly capability: SourceCapability,
    public readonly sourceType: string,
    reason?: string
  ) {
    super(
      `Capability '${capability}' is not supported by source '${sourceType}'${reason ? `: ${reason}` : ''}`
    );
    this.name = 'CapabilityNotSupportedError';
  }
}
