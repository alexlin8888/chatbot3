import React from 'react';

interface CardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ title, icon, children, className = '' }) => {
  return (
    <div className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 p-6 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl p-2.5 shadow-lg">
          {icon}
        </div>
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h3>
      </div>
      <div className="text-slate-600 dark:text-slate-300">
        {children}
      </div>
    </div>
  );
};

export default Card;
