export type MaintenanceIssueType =
  "plumbing" | "electrical" | "painting" | "carpentry" | "finishing" | "other";
export type UrgencyLevel = "normal" | "urgent" | "emergency";

export interface AnalysisResult {
  issue_type: MaintenanceIssueType;
  urgency: UrgencyLevel;
  description: string;
  confidence: number; // 0-1
  possible_causes: string[];
  suggested_action: string;
  detected_objects: string[];
  severity_score: number; // 0-1
  raw_response: any;
}

export interface ImageAnalysisRequest {
  image_url?: string;
  image_base64?: string;
  image_buffer?: number[];
  caption?: string;
  conversation_id?: string;
  request_id?: string;
}

export interface ImageAnalysisResponse {
  from_cache: boolean;
  analysis: AnalysisResult;
  image_hash: string;
}
