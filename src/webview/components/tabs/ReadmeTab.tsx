import React from 'react';
import { MarkdownPreview } from '../MarkdownPreview';
import type { PackageDetails } from '../../../types/package';

interface ReadmeTabProps {
  details: PackageDetails;
}

const readmeStyles = `
  .readme-wrapper {
    max-width: 850px;
  }
`;

export const ReadmeTab: React.FC<ReadmeTabProps> = ({ details }) => {
  return (
    <>
      <style>{readmeStyles}</style>
      <div className="readme-wrapper">
        <MarkdownPreview source={details.readme || ''} />
      </div>
    </>
  );
};
