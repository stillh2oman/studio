
export type InvoiceStatus = 'Invoice Sent' | 'Not Sent' | 'Paid' | 'Past Due';

export type DiscountType = 'First Responder' | 'Contractor' | 'Repeat Client' | 'Home & Garden Show' | 'Military' | 'None';
export type ClientDiscountEligibility = 'First Responder' | 'Military' | 'Home & Garden Show' | 'Repeat Client' | 'Other';

export type PaperSize = '36"X24"' | '48"X36"';

export type Designer = 'Jeff Dillon' | 'Kevin Walthall';

export type EmployeeName = 'Chris Fleming' | 'Jeff Dillon' | 'Jorrie Holly' | 'Kevin Walthall' | 'Sarah VandeBurgh' | 'Tammi Dillon';

export type Priority = 'High' | 'Low' | 'Medium';

export type TaskStatus = 'Assigned' | 'Completed' | 'In Progress' | 'Need Review' | 'Unassigned';

export type TaskCategory = 'Personal' | 'Project Related' | 'Return Communication';

export type QuickTaskStatus = 'Active' | 'Completed';

export interface QuickTask {
  id: string;
  name: string;
  notes?: string;
  priority: Priority;
  deadline: string; // yyyy-mm-dd
  category: Exclude<TaskCategory, 'Project Related'>;
  status: QuickTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type TemplateRequestStatus = 'Completed' | 'Not Completed';

export type AccessLevel = 'none' | 'read' | 'write';

export type ProjectType = 'Commercial' | 'Residential' | 'Tutoring';

export type ProjectNature = 'New Construction' | 'Remodel' | 'Addition';

export type EmployeeWorkStatus = 'In Office' | 'Working From Home' | 'At Job Site' | 'Vacation' | 'Out Sick' | 'Out of Office';

export type ProjectStatus = 
  | 'Initial Meeting' 
  | 'Initial Layout And Modeling' 
  | 'Revisions By Client' 
  | '3d Modeling' 
  | 'Bid Plan Set' 
  | 'Waiting On Client / Bids' 
  | 'Additional Revisions' 
  | 'Full Construction Documents' 
  | 'Completed' 
  | 'Archived';

export const PROJECT_STATUS_STEPS: ProjectStatus[] = [
  'Initial Meeting',
  'Initial Layout And Modeling',
  'Revisions By Client',
  '3d Modeling',
  'Bid Plan Set',
  'Waiting On Client / Bids',
  'Additional Revisions',
  'Full Construction Documents',
  'Completed',
  'Archived'
];

export interface ProjectChecklist {
  titlePage: boolean;
  titlePageSubTasks?: Record<string, boolean>;
  plotPlan: boolean;
  plotPlanSubTasks?: Record<string, boolean>;
  foundationPlan: boolean;
  foundationPlanSubTasks?: Record<string, boolean>;
  floorPlans: boolean;
  floorPlansSubTasks?: Record<string, boolean>;
  schedules: boolean;
  schedulesSubTasks?: Record<string, boolean>;
  exteriorElevations: boolean;
  exteriorElevationsSubTasks?: Record<string, boolean>;
  interiorElevations: boolean;
  roofPlan: boolean;
  roofPlanSubTasks?: Record<string, boolean>;
  electricalPlan: boolean;
  electricalPlanSubTasks?: Record<string, boolean>;
  asBuiltPlans: boolean;
}

export const CHECKLIST_MAIN_KEYS: (keyof ProjectChecklist)[] = [
  'titlePage',
  'plotPlan',
  'foundationPlan',
  'floorPlans',
  'schedules',
  'exteriorElevations',
  'interiorElevations',
  'roofPlan',
  'electricalPlan',
  'asBuiltPlans'
];

export interface IntegrationConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  googleRefreshToken?: string;
  googleAccountEmail?: string;
  meetFolderId?: string;
  dropboxAccessToken?: string;
  dropboxRootPath?: string;
  lastUpdated?: string;
}

export interface CollaboratorPermissions {
  billable: AccessLevel;
  printing: AccessLevel;
  tasks: AccessLevel;
  plans: AccessLevel;
  templates: AccessLevel;
  ai_prompts: AccessLevel;
  profitability: AccessLevel;
  status: AccessLevel;
  notes: AccessLevel;
  projects_db: AccessLevel;
  clients: AccessLevel;
  archive: AccessLevel;
  reports: AccessLevel;
  calculator: AccessLevel;
  timesheets: AccessLevel;
  supplies: AccessLevel;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username?: string;
  password?: string;
  homeAddress?: string;
  startDate?: string;
  birthDate?: string;
  ssn?: string;
  phoneNumber?: string;
  role: 'Administrator' | 'Standard User';
  permissions: CollaboratorPermissions;
  workStatus?: EmployeeWorkStatus;
  lastStatusUpdate?: string;
  lastSeenAt?: string; 
  isOnline?: boolean; 
  updatedAt?: string;
  bossId?: string; 
  firebaseUid?: string; 
}

export interface ReferenceDocument {
  id: string;
  title: string;
  category: string;
  description: string;
  dropboxUrl: string;
  updatedAt: string;
}

export interface FirmShortLink {
  id: string;
  code: string;
  ownerId: string;
  firmName?: string;
}

export interface LeaveBank {
  id: string;
  employeeId: string;
  ptoHours: number;
  holidayHours: number;
  updatedAt: string;
}

export interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Employee';
  permissions: CollaboratorPermissions;
  joinedAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string; 
  content: string;
  sentAt: string;
  /** Set when the sole recipient (non-broadcast) opens the message. */
  readAt?: string;
  /** For recipientId === 'all': maps employeeId -> ISO timestamp when that person opened the thread. */
  readBy?: Record<string, string>;
  attachments?: Attachment[];
}

export interface PayrollEntry {
  id: string;
  employeeId: string;
  date: string;
  amount: number;
}

export interface MonthlyCost {
  id: string;
  employeeId: string;
  month: string; 
  insurance: number;
  taxes: number;
  rent?: number;
  other: number;
}

export interface MonthlyIncome {
  id: string;
  employeeId: string;
  month: string; 
  billedHours: number;
  totalIncome: number;
}

export interface PayPeriod {
  id: string;
  startDate: string;
  endDate: string;
  isClosed?: boolean;
}

export type TimesheetBillingType = 'Billable' | 'Non-Billable' | 'PTO' | 'Holiday';

export interface TimesheetEntry {
  id: string;
  employeeId: string;
  projectId: string;
  customProjectName?: string;
  payPeriodId: string;
  date: string;
  startTime: string;
  endTime: string;
  hoursWorked: number;
  descriptionOfWork: string;
  billingType: TimesheetBillingType;
}

export interface PayPeriodSubmission {
  id: string;
  employeeId: string;
  payPeriodId: string;
  submittedAt: string;
  employeeName: string;
}

/** Archived timesheet PDF (Firebase Storage + metadata). */
export interface TimesheetPdfArchive {
  id: string;
  employeeId: string;
  payPeriodId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  submittedAt: string;
  createdAt: string;
  storagePath: string;
  downloadUrl?: string;
  uploadError?: string;
}

export type SpecialFeature = 
  | "Basement" 
  | "Bonus Room" 
  | "Storm Shelter" 
  | "Open Concept" 
  | "Closed Concepts" 
  | "Swimming Pool" 
  | "Butler's Pantry" 
  | "Detached Garage or Shop" 
  | "Screened Porch" 
  | "In-Law Suite" 
  | "Theater Room"
  | "Barndominium";

export const SPECIAL_FEATURES_OPTIONS: SpecialFeature[] = [
  "Basement", "Bonus Room", "Storm Shelter", "Open Concept", "Closed Concepts", 
  "Swimming Pool", "Butler's Pantry", "Detached Garage or Shop", "Screened Porch", 
  "In-Law Suite", "Theater Room", "Barndominium"
];

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export interface Client {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  secondaryClientName?: string;
  email?: string;
  phoneNumber?: string;
  accessCode?: string;
  isContractor?: boolean;
  logoUrl?: string;
  billingEmail?: string;
  contacts?: ContractorContact[];
  additionalStakeholders?: ContractorContact[];
  permitPdfDownloads?: boolean;
  initialProjectName?: string;
  associatedProjectIds?: string[];
  projectAddress?: string;
  projectRenderingUrl?: string;
  assignedContractorId?: string;
  discountEligibility?: ClientDiscountEligibility | '';
  hiddenFromDatabase?: boolean;
}

export interface ContractorContact {
  name: string;
  title: string;
  email: string;
  phone: string;
}

export interface Contractor {
  id: string;
  companyName: string;
  logoUrl?: string;
  billingEmail?: string;
  contacts: ContractorContact[];
  accessCode?: string;
  permitPdfDownloads?: boolean;
  qualifiesForDiscount?: boolean;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  hiddenFromCards?: boolean;
  contractorId?: string;
  status?: ProjectStatus;
  lastStatusUpdate?: string;
  isArchived?: boolean;
  constructionCompany?: string;
  address?: string;
  lat?: number; 
  lng?: number; 
  type?: ProjectType;
  nature?: ProjectNature[];
  checklist?: ProjectChecklist;
  hourlyRate?: number;
  hasHourlyDiscount?: boolean;
  currentHeatedSqFt?: number;
  createdAt?: string;
  designer?: Designer;
  renderingUrl?: string;
}

export interface ProjectNote {
  id: string;
  projectId: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  attachments: Attachment[];
}

export interface PasswordEntry {
  id: string;
  website: string;
  username: string;
  password: string;
  notes?: string;
  updatedAt: string;
}

export interface BillableEntry {
  id: string;
  projectId: string;
  clientId: string;
  lineItems?: Array<{
    id: string;
    date: string;
    hours: number;
    description: string;
  }>;
  hours: number;
  description: string;
  rate: number;
  lateFee: number;
  total: number;
  status: InvoiceStatus;
  discount: DiscountType;
  designer: Designer;
  date: string;
  sentDate?: string;
}

export type PrintEntryType = 'Job' | 'Expense';

export interface PrintEntry {
  id: string;
  projectId?: string;
  clientId?: string;
  paperSize?: PaperSize;
  description: string;
  rate: number;
  sheets: number;
  lateFee: number;
  total: number;
  status: InvoiceStatus;
  designer: Designer;
  date: string;
  sentDate?: string;
  type: PrintEntryType;
  inkCost?: number;
  paperCost?: number;
  maintenanceCost?: number;
}

export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
  attachments?: Attachment[];
}

export interface Comment {
  userName: string;
  text: string;
  timestamp: string;
}

export interface Task {
  id: string;
  projectId: string;
  clientId: string;
  name: string;
  description: string;
  assignedTo: EmployeeName;
  priority: Priority;
  deadline: string;
  isHardDeadline?: boolean;
  status: TaskStatus;
  category: TaskCategory;
  shared?: boolean;
  estimatedHours: number;
  subTasks: SubTask[];
  attachments: Attachment[];
  comments: Comment[];
  updatedAt: string;
  createdAt: string;
}

export type CalendarEventType = 'TaskBlock' | 'ClientMeeting' | 'CompanyEvent' | 'CommandBlock';
export type CalendarVisibility = 'Global' | 'Private';
export type EventLocationType = 'Online' | 'In-Person' | 'On-Site';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  type: CalendarEventType;
  startTime: string; 
  endTime: string;   
  taskId?: string;   
  clientIds?: string[]; 
  projectIds?: string[];
  ownerId: string;
  visibility: CalendarVisibility;
  locationType?: EventLocationType;
  /** Physical address or room when known (e.g. from Google Calendar). */
  location?: string;
  /** Present when this row was created from Google Calendar API (not stored in Firestore). */
  externalSource?: 'google';
  googleCalendarEventId?: string;
  /** Google `calendarId` used for API list/update/delete (email or calendar list id). */
  googleCalendarListId?: string;
  googleCalendarHtmlLink?: string;
  googleMeetLink?: string;
  /** Set when the block was created by AI command scheduling (private to owner). */
  aiGenerated?: boolean;
}

export interface TextTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateChangeRequest {
  id: string;
  title: string;
  assignedTo: EmployeeName;
  status: TemplateRequestStatus;
  priority: Priority;
  dateRequested: string;
  templateName: string;
  notes: string;
  updatedAt: string;
  createdAt: string;
}

/** Firm-curated template files (Dropbox share links) for team download from the Templates tab. */
export interface FirmTemplateDownload {
  id: string;
  title: string;
  dropboxUrl: string;
  description?: string;
  sortOrder?: number;
  updatedAt: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  projectName: string;
  heatedSqFt: number;
  bedrooms: number;
  bathrooms: number;
  stories: number;
  garageCapacity: number;
  hasBonusRoom: boolean;
  maxWidth: number;
  maxDepth: number;
  designerName: string;
  houseStyle: string;
  specialFeatures: string[];
  pdfUrl: string;
  thumbnailUrl?: string;
  updatedAt: string;
  createdAt: string;
}

export type SupplyCategory = 'Grocery' | 'Office Supply';

export interface SupplyItem {
  id: string;
  name: string;
  requestedBy: string;
  category: SupplyCategory;
  createdAt: string;
}

export interface EmergencyAlert {
  id: string;
  event: string;
  severity: string;
  headline: string;
  description: string;
  instruction?: string;
  effective: string;
  expires: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  /** First 10 lines of plain body (or stripped HTML), for inbox preview */
  bodyPreview?: string;
  from: string;
  /** Present when loaded from Gmail API headers */
  to?: string;
  date: string;
}

export interface CloudFile {
  id: string;
  name: string;
  mimeType?: string;
  thumbnailLink?: string;
  webViewLink: string;
  source: 'google' | 'dropbox';
  size?: number;
  createdTime?: string;
}

export interface MemoryBankFile {
  id: string;
  projectId?: string;
  projectName?: string;

  source: 'dropbox';
  dropboxPath: string;
  webViewLink: string;
  name: string;
  size?: number;
  createdTime?: string;

  status: 'queued' | 'indexed' | 'error';
  lastError?: string;
  attempts?: number;
  lastAttemptAt?: string;

  description?: string;
  keywords?: string[];
  spaces?: string[];
  features?: string[];

  embedding?: number[];
  indexedAt: string;
  indexedBy?: string;
}
