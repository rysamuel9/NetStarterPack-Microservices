export interface ApiResult<T = unknown> {
  succeeded: boolean;
  message: string;
  errors: string[];
  statusCode: number;
  data?: T;
}

export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  department?: string;
  avatarUrl?: string;
  status: string;
  roles: string[];
  permissions: string[];
  lastLoginAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: CurrentUser;
}

export interface MenuItem {
  id: string;
  code: string;
  title: string;
  path: string;
  icon: string;
  groupName: string;
  sortOrder: number;
  parentId?: string | null;
  requiredPermission?: string | null;
  isVisible: boolean;
  description?: string;
  assignedRoles: string[];
  assignedRoleIds: string[];
}

export interface UserItem {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  department?: string;
  status: string;
  roles: string[];
  createdAt: string;
  lastLoginAt?: string;
}

export interface RoleItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  badgeColor: string;
  isSystemRole: boolean;
  userCount: number;
  permissions: string[];
  menuIds: string[];
}

export interface PermissionItem {
  code: string;
  name: string;
  module: string;
  description: string;
}

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  status: string;
  createdAt: string;
  createdBy?: string;
}

export interface OrderItem {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  productSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: string;
  notes: string;
  createdAt: string;
  createdBy?: string;
}

export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  completedOrders: number;
}

export interface RoleDistribution {
  roleName: string;
  displayName: string;
  badgeColor: string;
  userCount: number;
}

export interface AuditLogItem {
  id: string;
  userName: string;
  action: string;
  module: string;
  entityId?: string;
  details: string;
  ipAddress?: string;
  timestamp: string;
}

export interface DashboardSummary {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  totalMenus: number;
  totalProducts: number;
  totalInventoryValue: number;
  roleDistribution: RoleDistribution[];
  recentActivities: AuditLogItem[];
}

export interface ServiceNodeHealth {
  service: string;
  port: number;
  url: string;
  status: string;
  database: string;
  latencyMs: number;
}

export interface GatewayHealthResponse {
  gateway: string;
  status: string;
  framework: string;
  architecture: string;
  services: ServiceNodeHealth[];
  timestamp: string;
}
