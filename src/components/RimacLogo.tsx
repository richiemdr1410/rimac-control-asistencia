import React from "react";

interface RimacLogoProps {
  className?: string;
  height?: number | string;
  showSlogan?: boolean;
}

export const RimacLogo: React.FC<RimacLogoProps> = ({
  className = "",
  height = 56,
}) => {
  const numericHeight = typeof height === "number" ? `${height}px` : height;

  return (
    <div className={`inline-flex items-center justify-center select-none bg-white p-1 rounded-lg ${className}`}>
      <img
        src="/rimac-logo.jpg"
        alt="Agroquímica Industrial RIMAC S.A."
        style={{
          height: numericHeight,
          maxHeight: numericHeight,
          width: "auto",
          objectFit: "contain",
        }}
        className="block"
      />
    </div>
  );
};
