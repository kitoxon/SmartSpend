import React from 'react';
import { Car, Gift, GraduationCap, House, Laptop, Plane, ShieldPlus, Target } from 'lucide-react';

export const GOAL_ICON_OPTIONS = [
  { id: 'target', label: 'General' },
  { id: 'travel', label: 'Travel' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'home', label: 'Home' },
  { id: 'car', label: 'Car' },
  { id: 'tech', label: 'Tech' },
  { id: 'education', label: 'Education' },
  { id: 'gift', label: 'Gift' },
] as const;

interface GoalIconProps {
  icon?: string;
  size?: number;
  className?: string;
}

export const normalizeGoalIcon = (icon?: string) => GOAL_ICON_OPTIONS.some((option) => option.id === icon) ? icon! : 'target';

export const GoalIcon: React.FC<GoalIconProps> = ({ icon, size = 16, className }) => {
  const props = { size, className, 'aria-hidden': true } as const;
  switch (normalizeGoalIcon(icon)) {
    case 'travel': return <Plane {...props} />;
    case 'emergency': return <ShieldPlus {...props} />;
    case 'home': return <House {...props} />;
    case 'car': return <Car {...props} />;
    case 'tech': return <Laptop {...props} />;
    case 'education': return <GraduationCap {...props} />;
    case 'gift': return <Gift {...props} />;
    default: return <Target {...props} />;
  }
};
