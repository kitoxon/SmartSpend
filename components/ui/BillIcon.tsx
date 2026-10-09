import React from 'react';
import { Droplets, Home, Landmark, Medal, Zap } from 'lucide-react';

interface BillIconProps {
  name: string;
  size?: number;
  className?: string;
}

/** An icon guessed from a transfer bill's name; a bank for anything else. */
export const BillIcon: React.FC<BillIconProps> = ({ name, size = 15, className }) => {
  const Icon = /water|水道/i.test(name) ? Droplets
    : /rent|家賃/i.test(name) ? Home
      : /electric|gas|電気|ガス/i.test(name) ? Zap
        : /karate|空手|gym|ジム|sport|道場/i.test(name) ? Medal
          : Landmark;
  return <Icon size={size} className={className} aria-hidden="true" />;
};
