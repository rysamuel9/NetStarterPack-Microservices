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
  employeeCode?: string | null;
  directorateId?: string | null;
  directorateName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  positionId?: string | null;
  positionName?: string | null;
  positionLevel?: number | null;
  managerUserId?: string | null;
  managerFullName?: string | null;
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

export interface FormFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'select' | string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface ApprovalFlowStepDefinition {
  stepOrder: number;
  stepName: string;
  approverRole: string;
  description: string;
}

export interface FormTemplateItem {
  id: string;
  code: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  fields: FormFieldDefinition[];
  approvalFlow: ApprovalFlowStepDefinition[];
  isActive: boolean;
}

export interface WorkflowApprovalStepItem {
  id: string;
  stepOrder: number;
  stepName: string;
  approverRole: string;
  description: string;
  status: 'Waiting' | 'Pending' | 'Approved' | 'Rejected' | 'RevisionRequested' | string;
  actionByUsername?: string | null;
  actionByFullName?: string | null;
  comment?: string | null;
  actionAt?: string | null;
}

export interface WorkflowHistoryLogItem {
  id: string;
  action: string;
  actorUsername: string;
  actorFullName: string;
  actorRole: string;
  fromStatus: string;
  toStatus: string;
  notes: string;
  timestamp: string;
}

export interface WorkflowRequestItem {
  id: string;
  requestNumber: string;
  formTemplateId: string;
  templateCode: string;
  templateName: string;
  templateCategory: string;
  title: string;
  formData: Record<string, string>;
  templateFields: FormFieldDefinition[];
  requesterUserId: string;
  requesterUsername: string;
  requesterFullName: string;
  status: 'Draft' | 'InReview' | 'RevisionRequested' | 'Approved' | 'Rejected' | string;
  currentStepOrder: number;
  totalSteps: number;
  currentApproverRole?: string | null;
  createdAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
  approvalSteps: WorkflowApprovalStepItem[];
  historyLogs: WorkflowHistoryLogItem[];
}

export interface WorkflowStats {
  totalRequests: number;
  inReviewRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  revisionRequests: number;
  activeTemplates: number;
}

export interface AnnouncementAttachmentItem {
  id?: string;
  fileName: string;
  storedFileName: string;
  contentType: string;
  fileSizeBytes: number;
  kind: 'Banner' | 'Image' | 'File' | string;
  url: string;
}

export interface AnnouncementCommentItem {
  id: string;
  parentCommentId?: string | null;
  userId: string;
  username: string;
  fullName: string;
  userRole: string;
  content: string;
  createdAt: string;
}

export interface AnnouncementSummaryItem {
  id: string;
  title: string;
  summary: string;
  type: 'General' | 'HRPolicy' | 'Event' | 'Urgent' | 'Maintenance' | 'Celebration' | string;
  bannerUrl?: string | null;
  allowComments: boolean;
  isPinned: boolean;
  publishedAt: string;
  authorUserId: string;
  authorUsername: string;
  authorFullName: string;
  authorRole: string;
  likeCount: number;
  commentCount: number;
  imageCount: number;
  fileCount: number;
  isLikedByMe: boolean;
  isReadByMe: boolean;
}

export interface AnnouncementDetailItem {
  id: string;
  title: string;
  summary: string;
  type: string;
  contentHtml: string;
  bannerUrl?: string | null;
  allowComments: boolean;
  isPinned: boolean;
  publishedAt: string;
  authorUserId: string;
  authorUsername: string;
  authorFullName: string;
  authorRole: string;
  likeCount: number;
  commentCount: number;
  isLikedByMe: boolean;
  isReadByMe: boolean;
  attachments: AnnouncementAttachmentItem[];
  comments: AnnouncementCommentItem[];
}

export interface PagedAnnouncementsResponse {
  items: AnnouncementSummaryItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  unreadCount: number;
}

export interface AnnouncementBellResponse {
  unreadCount: number;
  items: AnnouncementSummaryItem[];
}
