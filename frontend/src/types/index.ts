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

export interface DirectorateItem {
  id: string;
  code: string;
  name: string;
  description: string;
  headUserId?: string | null;
  headUsername?: string | null;
  headFullName?: string | null;
  headPositionName?: string | null;
  isActive: boolean;
  divisionCount: number;
  userCount: number;
}

export interface DivisionItem {
  id: string;
  directorateId: string;
  directorateName: string;
  code: string;
  name: string;
  description: string;
  headUserId?: string | null;
  headUsername?: string | null;
  headFullName?: string | null;
  isActive: boolean;
  departmentCount: number;
  userCount: number;
}

export interface DepartmentItem {
  id: string;
  divisionId: string;
  divisionName: string;
  directorateId: string;
  directorateName: string;
  code: string;
  name: string;
  description: string;
  headUserId?: string | null;
  headUsername?: string | null;
  headFullName?: string | null;
  isActive: boolean;
  userCount: number;
}

export interface PositionItem {
  id: string;
  code: string;
  name: string;
  level: number;
  description: string;
  isActive: boolean;
  userCount: number;
}

export interface OrgMemberSummary {
  id: string;
  employeeCode?: string | null;
  username: string;
  fullName: string;
  positionName?: string | null;
  positionLevel?: number | null;
  roles: string[];
}

export interface DepartmentTreeNode {
  id: string;
  code: string;
  name: string;
  description: string;
  headUserId?: string | null;
  headFullName?: string | null;
  userCount: number;
  members: OrgMemberSummary[];
}

export interface DivisionTreeNode {
  id: string;
  code: string;
  name: string;
  description: string;
  headUserId?: string | null;
  headFullName?: string | null;
  userCount: number;
  departments: DepartmentTreeNode[];
}

export interface DirectorateTreeNode {
  id: string;
  code: string;
  name: string;
  description: string;
  headUserId?: string | null;
  headUsername?: string | null;
  headFullName?: string | null;
  headPositionName?: string | null;
  userCount: number;
  divisions: DivisionTreeNode[];
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

export interface AnnouncementStats {
  totalAnnouncements: number;
  publishedAnnouncements: number;
  totalLikes: number;
  totalComments: number;
}

export interface LookupItem {
  id: string;
  groupCode: string;
  code: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  metadataJson?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

export interface LookupGroupSummary {
  groupCode: string;
  totalCount: number;
  activeCount: number;
  systemCount: number;
}

export interface MasterDataStats {
  totalGroups: number;
  totalItems: number;
  activeItems: number;
  inactiveItems: number;
}

export interface LivePositionEvent {
  assignmentId: string;
  assignmentCode: string;
  assigneeUsername: string;
  assigneeFullName: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedKmh: number;
  distanceToDestinationMeters: number;
  isInsideGeofence: boolean;
  isSuspicious: boolean;
  suspiciousReason?: string | null;
  recordedAtUtc: string;
}

export interface TrackingBreadcrumbItem {
  id: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedKmh: number;
  distanceToDestinationMeters: number;
  isMocked: boolean;
  isSuspicious: boolean;
  eventTag: string;
  recordedAt: string;
}

export interface TrackingStatusLogItem {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorUsername: string;
  actorFullName: string;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timestamp: string;
}

export interface TrackingSummaryItem {
  id: string;
  assignmentCode: string;
  title: string;
  taskType: 'Delivery' | 'FieldVisit' | 'Maintenance' | string;
  referenceCode?: string | null;
  notes?: string | null;
  dispatcherUserId: string;
  dispatcherUsername: string;
  dispatcherFullName: string;
  assigneeUserId: string;
  assigneeUsername: string;
  assigneeFullName: string;
  originLabel: string;
  originLatitude: number;
  originLongitude: number;
  destinationLabel: string;
  destinationAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  geofenceRadiusMeters: number;
  status:
    | 'Assigned'
    | 'InTransit'
    | 'IssueReported'
    | 'Arrived'
    | 'PendingVerification'
    | 'Completed'
    | 'Rejected'
    | 'Cancelled'
    | string;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastAccuracyMeters?: number | null;
  lastSpeedKmh?: number | null;
  lastDistanceToDestinationMeters?: number | null;
  lastPingAt?: string | null;
  totalDistanceMeters: number;
  isInsideGeofence: boolean;
  isSuspicious: boolean;
  suspiciousReason?: string | null;
  issueNote?: string | null;
  podPhotoUrl?: string | null;
  createdAt: string;
  startedAt?: string | null;
  arrivedAt?: string | null;
  completedAt?: string | null;
  breadcrumbCount: number;
}

export interface TrackingDetailItem {
  summary: TrackingSummaryItem;
  podRecipientName?: string | null;
  podNotes?: string | null;
  verificationNotes?: string | null;
  verifiedByUsername?: string | null;
  verifiedAt?: string | null;
  breadcrumbs: TrackingBreadcrumbItem[];
  statusLogs: TrackingStatusLogItem[];
}

export interface TrackingStats {
  totalAssignments: number;
  activeInTransit: number;
  pendingVerification: number;
  completedAssignments: number;
  suspiciousFlags: number;
}
