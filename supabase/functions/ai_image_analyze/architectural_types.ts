export interface ArchitecturalAnalysis {
  // أساسيات
  issue_type:
    "plumbing" | "electrical" | "painting" | "carpentry" | "finishing" | "structural" | "other";
  urgency: "emergency" | "urgent" | "normal";
  description: string;
  location_details: string;
  root_cause: string;

  // تقييم الأضرار
  damage_assessment: {
    size: "small" | "medium" | "large";
    affected_area: string;
    requires_replacement: boolean;
    secondary_damage: string[];
    risk_level: "low" | "medium" | "high";
  };

  // التوصيات
  suggested_action: string;
  immediate_action?: string;
  preventive_measures?: string;

  // الموارد المطلوبة
  estimated_time: string;
  required_technicians: number;
  required_tools: string[];
  estimated_cost: string;

  // معلومات إضافية
  confidence: number;
  metadata: {
    analyzed_at: string;
    building_type: string;
    analysis_version: string;
    model_used: string;
  };
  recommendations: RepairRecommendation[];
  parts_needed: string[];
  technician_requirements: {
    count: number;
    specialties: string[];
    estimated_hours: number;
  };
}

export interface RepairRecommendation {
  priority: "critical" | "high" | "medium" | "low";
  action: string;
  description: string;
  timeline: string;
}

export interface FinishingAssessment {
  overall_rating: number; // 1-5
  defects_list: Array<{
    type: string;
    location: string;
    severity: "minor" | "moderate" | "severe";
  }>;
  urgent_fixes: string[];
  recommended_actions: string[];
  estimated_cost: string;
}

export interface StructuralDefectAnalysis {
  defect_type: string;
  severity: "minor" | "moderate" | "severe" | "critical";
  structural_impact: string;
  recommended_action: string;
  estimated_cost_range: string;
  urgency_level: "immediate" | "soon" | "planned";
  requires_structural_engineer: boolean;
}
