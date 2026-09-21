interface CardProps {
  title: string;
  value: string | number;
  icon: string;
  color: "teal" | "purple" | "orange" | "blue";
  onClick?: () => void;
}

const colorClasses = {
  teal: "bg-teal-50 border-teal-200",
  purple: "bg-purple-50 border-purple-200",
  orange: "bg-orange-50 border-orange-200",
  blue: "bg-blue-50 border-blue-200",
};

const iconBgClasses = {
  teal: "bg-teal-100",
  purple: "bg-purple-100",
  orange: "bg-orange-100",
  blue: "bg-blue-100",
};

const textClasses = {
  teal: "text-teal-600",
  purple: "text-purple-600",
  orange: "text-orange-600",
  blue: "text-blue-600",
};

export default function Card({
  title,
  value,
  icon,
  color,
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`${colorClasses[color]} border rounded-xl p-6 cursor-pointer hover:shadow-lg transition ${
        onClick ? "hover:scale-105" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-600 text-sm mb-2">{title}</p>
          <p className={`text-3xl font-bold ${textClasses[color]}`}>{value}</p>
        </div>
        <div className={`${iconBgClasses[color]} p-3 rounded-lg text-2xl`}>
          {icon}
        </div>
      </div>
      <p className={`${textClasses[color]} text-xs mt-4 font-medium`}>
        Ver Detalhes →
      </p>
    </div>
  );
}
