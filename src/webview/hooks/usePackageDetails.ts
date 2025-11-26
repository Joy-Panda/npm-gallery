import { useEffect } from 'react';
import { useVSCode } from '../context/VSCodeContext';

/**
 * Hook for fetching package details
 */
export function usePackageDetails(packageName: string) {
  const { getPackageDetails, packageDetails, isLoading, error } = useVSCode();

  useEffect(() => {
    if (packageName) {
      getPackageDetails(packageName);
    }
  }, [packageName, getPackageDetails]);

  return {
    packageDetails,
    isLoading,
    error,
  };
}
