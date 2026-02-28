"use client";

export default function PartsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-6">{children}</div>
  );
}
