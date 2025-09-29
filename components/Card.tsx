
import React from 'react';

interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ title, icon, children, className = '' }) => {
  return (
    <div className={`bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg ${className}`}>
      <div className="flex items-center mb-4">
        <div className="bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-300 rounded-full p-2 mr-3">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      </div>
      <div className="text-slate-600 dark:text-slate-300 space-y-2">
        {children}
      </div>
    </div>
  );
};

export default Card;
