import React from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CheckSquare,
  ClipboardList,
  Database,
  FilePlus2,
  FileText,
  GitBranch,
  Grid2x2,
  LayoutDashboard,
  ListChecks,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  Navigation,
  Package,
  Shield,
  ShoppingCart,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react-native';

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FilePlus2,
  FileText,
  CheckSquare,
  ListChecks,
  ClipboardList,
  Database,
  GitBranch,
  Megaphone,
  MapPin,
  Navigation,
  Bell,
  Mail,
  BarChart3,
  Users,
  User,
  Building2,
  Shield,
  Menu,
  Activity,
};

interface DynamicLucideIconProps {
  name?: string | null;
  size?: number;
  color?: string;
}

export const DynamicLucideIcon: React.FC<DynamicLucideIconProps> = ({
  name,
  size = 22,
  color = '#0D9488',
}) => {
  const IconComponent = (name && ICON_MAP[name]) || Grid2x2;
  return <IconComponent size={size} color={color} />;
};
