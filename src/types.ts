// ─── Cloudflare environment bindings ─────────────────────────────────────────

export interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  IMPORT_QUEUE: Queue<QueueMessage>;
  EXPORT_QUEUE: Queue<QueueMessage>;
  /** "research_only" | "outreach" */
  APP_USAGE_MODE: string;
  /** Days to retain uploaded source files in R2 (default: 30) */
  RETENTION_DAYS_SOURCE_FILES: string;
  /** Days to retain generated export CSVs in R2 (default: 7) */
  RETENTION_DAYS_GENERATED_CSV: string;
  /** Cloudflare Access audience tag (set via wrangler secret) */
  CF_ACCESS_AUDIENCE?: string;
  /** Cloudflare Access team domain, e.g. "myteam.cloudflareaccess.com" */
  CF_ACCESS_TEAM_DOMAIN?: string;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export type QueueJobType = "bcad_import" | "opr_import" | "csv_export";

export interface QueueMessage {
  jobId: string;
  type: QueueJobType;
  /** Byte offset into source file for batch processing (0 = first batch) */
  batchOffset: number;
  batchSize: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

// ─── Match confidence ─────────────────────────────────────────────────────────

export type MatchConfidence =
  | "exact_id"
  | "exact_geographic"
  | "exact_legal"
  | "fuzzy_address"
  | "needs_review"
  | "unmatched";

// ─── Call status ──────────────────────────────────────────────────────────────

export type CallStatusValue =
  | "New"
  | "Contacted"
  | "Follow Up"
  | "Interested"
  | "Not Interested"
  | "Wrong Number"
  | "Do Not Contact";

export const CALL_STATUS_VALUES: CallStatusValue[] = [
  "New",
  "Contacted",
  "Follow Up",
  "Interested",
  "Not Interested",
  "Wrong Number",
  "Do Not Contact",
];

// ─── D1 row shapes ────────────────────────────────────────────────────────────

export interface PropertyRow {
  id: string;
  geographic_id: string | null;
  property_address: string | null;
  property_address_normalized: string | null;
  city: string | null;
  state: string;
  zip_code: string | null;
  legal_description: string | null;
  legal_description_normalized: string | null;
  property_use_code: string | null;
  property_use_description: string | null;
  /** SQLite boolean: 0 or 1 */
  commercial: number;
  improvement_value: number | null;
  land_value: number | null;
  total_appraised_value: number | null;
  land_area_sq_ft: number | null;
  land_area_acres: number | null;
  /** Derived: sum of property_improvements.building_area_sq_ft */
  building_area_sq_ft: number | null;
  /** Derived: building_area_sq_ft × 0.092903 */
  building_area_sq_m: number | null;
  exemption_status: string | null;
  data_source: string | null;
  source_file_hash: string | null;
  import_date: string | null;
  last_updated: string | null;
}

export interface OwnerRow {
  id: number;
  property_id: string;
  owner_name: string | null;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  /** Outreach mode only: 0 or 1 */
  do_not_contact: number | null;
  do_not_contact_source: string | null;
  /** Legal basis for contact (outreach mode) */
  consent_or_basis_note: string | null;
  data_source: string | null;
  import_date: string | null;
  last_updated: string | null;
}

export interface ImprovementRow {
  id: number;
  property_id: string;
  building_type: string | null;
  building_area_sq_ft: number | null;
  building_area_sq_m: number | null;
  improvement_value: number | null;
  data_source: string | null;
  import_date: string | null;
}

export interface OprDocumentRow {
  id: number;
  document_number: string;
  recording_date: string | null;
  document_type: string | null;
  grantor: string | null;
  grantee: string | null;
  legal_description: string | null;
  legal_description_normalized: string | null;
  property_address: string | null;
  property_address_normalized: string | null;
  data_source: string | null;
  source_file_hash: string | null;
  import_date: string | null;
}

export interface OprPropertyLinkRow {
  id: number;
  opr_document_id: number;
  property_id: string | null;
  match_confidence: MatchConfidence;
  created_at: string;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type JobType = "bcad_import" | "opr_import" | "csv_export";

export interface ImportJobRow {
  id: string;
  job_type: JobType;
  status: JobStatus;
  source_file_name: string | null;
  source_file_r2_key: string | null;
  source_file_hash: string | null;
  total_records: number;
  processed_records: number;
  failed_records: number;
  /** JSON-encoded string[] */
  errors: string | null;
  result_r2_key: string | null;
  result_download_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyNoteRow {
  id: number;
  property_id: string;
  note: string;
  created_by_user_id: string;
  created_at: string;
}

export interface CallStatusRow {
  id: number;
  property_id: string;
  status: CallStatusValue;
  note: string | null;
  changed_by_user_id: string;
  changed_at: string;
}

export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  last_login: string | null;
}

export interface DeletedFileLogRow {
  id: number;
  file_hash: string | null;
  original_name: string | null;
  r2_key: string | null;
  deleted_at: string;
}

// ─── Import row shapes (parsed from uploaded CSV) ─────────────────────────────

export interface BcadCsvRow {
  propertyId: string;
  geographicId?: string;
  ownerName?: string;
  ownerMailingAddress?: string;
  ownerMailingCity?: string;
  ownerMailingState?: string;
  ownerMailingZip?: string;
  propertyAddress?: string;
  city?: string;
  zipCode?: string;
  legalDescription?: string;
  propertyUseCode?: string;
  propertyUseDescription?: string;
  buildingType?: string;
  buildingAreaSqFt?: number;
  landAreaSqFt?: number;
  landAreaAcres?: number;
  improvementValue?: number;
  landValue?: number;
  totalAppraisedValue?: number;
  exemptionStatus?: string;
}

export interface OprCsvRow {
  documentNumber: string;
  recordingDate?: string;
  documentType?: string;
  grantor?: string;
  grantee?: string;
  legalDescription?: string;
  propertyAddress?: string;
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  jobType: JobType;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errors: string[];
  downloadUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PropertySearchParams {
  city?: string;
  commercial?: boolean;
  propertyUse?: string;
  minBuildingSqFt?: number;
  maxBuildingSqFt?: number;
  minBuildingSqM?: number;
  maxBuildingSqM?: number;
  minLandAcres?: number;
  maxLandAcres?: number;
  minMarketValue?: number;
  maxMarketValue?: number;
  ownerName?: string;
  documentType?: string;
  recordedAfter?: string;
  recordedBefore?: string;
  matchConfidence?: MatchConfidence;
  limit?: number;
  offset?: number;
}
