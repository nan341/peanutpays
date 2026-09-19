import React from "react";

interface BadgeProps {
  label: string;
  variant?: "teal" | "coral" | "navy" | "gray";
}

const variantClasses: Record<string, string> = {
  teal: "bg-teal-100 text-teal-800",
  coral: "bg-red-100 text-red-700",
  navy: "bg-blue-100 text-blue-900",
  gray: "bg-gray-100 text-gray-700",
};

const categoryColors: Record<string, string> = {
  Food: "bg-amber-100 text-amber-800",
  Transport: "bg-sky-100 text-sky-800",
  Shopping: "bg-purple-100 text-purple-800",
  Subscriptions: "bg-pink-100 text-pink-800",
  Rent: "bg-orange-100 text-orange-800",
  Other: "bg-gray-100 text-gray-700",
};

export function CategoryBadge({ category }: { category: string }) {
  const cls = categoryColors[category] ?? categoryColors["Other"];
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {category}
    </span>
  );
}

export function Badge({ label, variant = "gray" }: BadgeProps) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${variantClasses[variant]}`}
    >
      {label}
    </span>
  );
}
