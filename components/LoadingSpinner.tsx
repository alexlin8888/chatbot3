
import React from 'react';

const LoadingSpinner: React.FC<{ size?: string }> = ({ size = 'h-5 w-5' }) => {
  return (
    <div className={`animate-spin rounded-full ${size} border-b-2 border-slate-900 dark:border-slate-100`}></div>
  );
};

export default LoadingSpinner;
