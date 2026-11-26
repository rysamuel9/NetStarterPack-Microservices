import React from 'react';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Menu,
  Package,
  ShoppingCart,
  BarChart3,
  Activity,
  UserCircle,
  Settings,
  Folder,
  FileText,
  Lock,
  Layers,
  Globe,
  Bell,
  Network,
  Database,
  Server,
  Boxes,
  FilePlus2,
  ClipboardCheck,
  GitBranch,
  Laptop,
  Calendar,
  Briefcase,
  CheckSquare,
  MapPin,
  Navigation,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Menu,
  Package,
  ShoppingCart,
  BarChart3,
  Activity,
  UserCircle,
  Settings,
  Folder,
  FileText,
  Lock,
  Layers,
  Globe,
  Bell,
  Network,
  Database,
  Server,
  Boxes,
  FilePlus2,
  ClipboardCheck,
  GitBranch,
  Laptop,
  Calendar,
  Briefcase,
  CheckSquare,
  MapPin,
  Navigation,
};

export const AVAILABLE_ICON_NAMES = Object.keys(iconMap);

export const DynamicIcon: React.FC<{ name: string; className?: string }> = ({
  name,
  className = 'w-5 h-5',
}) => {
  const IconComponent = iconMap[name] || Folder;
  return <IconComponent className={className} />;
};
