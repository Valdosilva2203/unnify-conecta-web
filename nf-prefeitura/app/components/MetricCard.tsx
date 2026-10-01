"use client";

import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  accentColor?: "orange" | "purple" | "blue" | "green" | "red" | "amber" | "indigo";
  onClick?: () => void;
  trend?: string;
  children?: ReactNode;
}

const colorClasses = {
  orange: "bg-orange-50 text-orange-600",
  purple: "bg-purple-50 text-purple-600",
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

const valuColorClasses = {
  orange: "text-orange-600",
  purple: "text-purple-600",
  blue: "text-blue-600",
  green: "text-green-600",
  red: "text-red-600",
  amber: "text-amber-600",
  indigo: "text-indigo-600",
};

export default function MetricCard({
  title,
  value,
  subtitle,
  icon,
  accentColor = "blue",
  onClick,
  trend,
  children,
}: MetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-all ${
        onClick ? "cursor-pointer hover:translate-y-[-2px]" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-3xl font-bold mt-3 ${valuColorClasses[accentColor]}`}>
            {value}
          </p>
          {subtitle && <p className="text-xs text-gray-500 mt-2">{subtitle}</p>}
          {trend && <p className="text-xs text-green-600 mt-1">{trend}</p>}
        </div>

        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
            colorClasses[accentColor]
          }`}
        >
          {icon}
        </div>
      </div>

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
