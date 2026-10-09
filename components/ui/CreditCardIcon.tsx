import React from 'react';

interface CreditCardIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'color'> {
  size?: number;
  color?: string;
}

/**
 * Lucide's current credit card drawing, which adds a card-number line. The
 * installed lucide-react still ships the older one; props mirror its icons.
 */
export const CreditCardIcon: React.FC<CreditCardIconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 2, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
    <path d="M6 14h2" />
  </svg>
);
