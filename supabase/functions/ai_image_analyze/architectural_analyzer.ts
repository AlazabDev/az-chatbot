import { GeminiClient } from "./gemini.client.ts";
import {
  ARCHITECTURAL_SYSTEM_PROMPT,
  getArchitecturalImagePrompt,
  getFinishingAssessmentPrompt,
  getStructuralDefectsPrompt,
} from "./architectural_prompts.ts";
import {
  ArchitecturalAnalysis,
  FinishingAssessment,
  StructuralDefectAnalysis,
  RepairRecommendation,
} from "./architectural_types.ts";

export class ArchitecturalAnalyzer {
  private gemini: GeminiClient;

  constructor(apiKey: string) {
    this.gemini = new GeminiClient(apiKey);
  }

  /**
   * تحليل معماري كامل للصورة
   */
  async analyzeMaintenanceImage(
    imageData: string | Uint8Array,
    options: {
      caption?: string;
      buildingType?: "residential" | "commercial" | "industrial";
      previousIssues?: string[];
      includeCostEstimate?: boolean;
    } = {},
  ): Promise<ArchitecturalAnalysis> {
    const prompt = getArchitecturalImagePrompt(options.caption, {
      buildingType: options.buildingType,
      previousIssues: options.previousIssues,
    });

    const analysis = await this.gemini.analyzeWithCustomPrompt(
      imageData,
      ARCHITECTURAL_SYSTEM_PROMPT,
      prompt,
    );

    // معالجة وتحسين النتائج
    return this.enrichAnalysis(analysis, options);
  }

  /**
   * تحليل متخصص لجودة التشطيبات
   */
  async analyzeFinishingQuality(
    imageData: string | Uint8Array,
    finishingType: "paint" | "flooring" | "tiles" | "plaster" | "all",
  ): Promise<FinishingAssessment> {
    const prompt = getFinishingAssessmentPrompt();

    const analysis = await this.gemini.analyzeWithCustomPrompt(
      imageData,
      ARCHITECTURAL_SYSTEM_PROMPT,
      prompt,
    );

    return this.parseFinishingAssessment(analysis, finishingType);
  }

  /**
   * تحليل العيوب الإنشائية
   */
  async detectStructuralDefects(
    imageData: string | Uint8Array,
    location: "wall" | "ceiling" | "floor" | "column" | "beam",
  ): Promise<StructuralDefectAnalysis> {
    const prompt = getStructuralDefectsPrompt();

    const analysis = await this.gemini.analyzeWithCustomPrompt(
      imageData,
      ARCHITECTURAL_SYSTEM_PROMPT,
      prompt,
    );

    return this.parseStructuralDefects(analysis, location);
  }

  /**
   * إثراء التحليل بمعلومات إضافية
   */
  private text(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  private strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string =>
      typeof item === "string") : [];
  }

  /** Complete required analysis fields from the provider's partially structured JSON. */
  private enrichAnalysis(
    analysis: Record<string, unknown>,
    options: { buildingType?: "residential" | "commercial" | "industrial" },
  ): ArchitecturalAnalysis {
    const allowedTypes: ArchitecturalAnalysis["issue_type"][] = [
      "plumbing", "electrical", "painting", "carpentry", "finishing", "structural", "other",
    ];
    const issueType = allowedTypes.includes(analysis.issue_type as ArchitecturalAnalysis["issue_type"])
      ? analysis.issue_type as ArchitecturalAnalysis["issue_type"] : "other";
    const allowedUrgency: ArchitecturalAnalysis["urgency"][] = ["normal", "urgent", "emergency"];
    const urgency = allowedUrgency.includes(analysis.urgency as ArchitecturalAnalysis["urgency"])
      ? analysis.urgency as ArchitecturalAnalysis["urgency"] : "normal";
    const rawDamage = analysis.damage_assessment && typeof analysis.damage_assessment === "object"
      ? analysis.damage_assessment as Record<string, unknown> : {};
    const size = ["small", "medium", "large"].includes(String(rawDamage.size))
      ? rawDamage.size as "small" | "medium" | "large" : "small";
    const riskLevel = ["low", "medium", "high"].includes(String(rawDamage.risk_level))
      ? rawDamage.risk_level as "low" | "medium" | "high" : "low";
    const normalized = {
      issue_type: issueType,
      urgency,
      description: this.text(analysis.description, "يتطلب مراجعة فني متخصص"),
      location_details: this.text(analysis.location_details, "غير محدد"),
      root_cause: this.text(analysis.root_cause, "غير محدد"),
      damage_assessment: {
        size,
        affected_area: this.text(rawDamage.affected_area, "غير محدد"),
        requires_replacement: rawDamage.requires_replacement === true,
        secondary_damage: this.strings(rawDamage.secondary_damage),
        risk_level: riskLevel,
      },
      suggested_action: this.text(analysis.suggested_action, "الفحص الفني الموقعي"),
      immediate_action: this.text(analysis.immediate_action, ""),
      preventive_measures: this.text(analysis.preventive_measures, ""),
      estimated_time: this.text(analysis.estimated_time, "غير محدد"),
      required_technicians: typeof analysis.required_technicians === "number"
        ? Math.max(0, analysis.required_technicians) : 1,
      required_tools: this.strings(analysis.required_tools),
      estimated_cost: this.text(analysis.estimated_cost, "يحدد بعد المعاينة"),
      confidence: typeof analysis.confidence === "number"
        ? Math.min(1, Math.max(0, analysis.confidence)) : 0,
    };
    return {
      ...normalized,
      metadata: {
        analyzed_at: new Date().toISOString(),
        building_type: options.buildingType || "residential",
        analysis_version: "1.0.0",
        model_used: "gemini-1.5-flash",
      },
      recommendations: this.generateRecommendations(normalized),
      parts_needed: this.suggestParts(issueType),
      technician_requirements: this.getTechnicianRequirements(issueType, urgency),
    };
  }

  private parseFinishingAssessment(
    analysis: Record<string, unknown>,
    _finishingType: "paint" | "flooring" | "tiles" | "plaster" | "all",
  ): FinishingAssessment {
    const defects = Array.isArray(analysis.defects_list) ? analysis.defects_list : [];
    return {
      overall_rating: typeof analysis.overall_rating === "number"
        ? Math.min(5, Math.max(1, analysis.overall_rating)) : 1,
      defects_list: defects.filter((v): v is Record<string, unknown> =>
        Boolean(v) && typeof v === "object" && !Array.isArray(v))
        .map((item) => ({
          type: this.text(item.type, "غير محدد"),
          location: this.text(item.location, "غير محدد"),
          severity: ["minor", "moderate", "severe"].includes(String(item.severity))
            ? item.severity as "minor" | "moderate" | "severe" : "moderate",
        })),
      urgent_fixes: this.strings(analysis.urgent_fixes),
      recommended_actions: this.strings(analysis.recommended_actions),
      estimated_cost: this.text(analysis.estimated_cost, "يحدد بعد المعاينة"),
    };
  }

  private parseStructuralDefects(
    analysis: Record<string, unknown>,
    _location: "wall" | "ceiling" | "floor" | "column" | "beam",
  ): StructuralDefectAnalysis {
    return {
      defect_type: this.text(analysis.defect_type, "غير محدد"),
      severity: ["minor", "moderate", "severe", "critical"].includes(String(analysis.severity))
        ? analysis.severity as StructuralDefectAnalysis["severity"] : "moderate",
      structural_impact: this.text(analysis.structural_impact, "يتطلب تقييمًا هندسيًا"),
      recommended_action: this.text(analysis.recommended_action, "استشارة مهندس إنشائي"),
      estimated_cost_range: this.text(analysis.estimated_cost_range, "غير محدد"),
      urgency_level: ["immediate", "soon", "planned"].includes(String(analysis.urgency_level))
        ? analysis.urgency_level as StructuralDefectAnalysis["urgency_level"] : "soon",
      requires_structural_engineer: analysis.requires_structural_engineer !== false,
    };
  }

  private generateRecommendations(
    analysis: {
      urgency: ArchitecturalAnalysis["urgency"];
      suggested_action: string;
      immediate_action?: string;
      estimated_time?: string;
      preventive_measures?: string;
    },
  ): RepairRecommendation[] {
    const recommendations: RepairRecommendation[] = [];
    if (analysis.urgency === "emergency") {
      recommendations.push({
        priority: "critical",
        action: "إجراءات فورية",
        description: analysis.immediate_action || "يجب التعامل مع المشكلة فوراً بسبب خطورتها",
        timeline: "خلال ساعة",
      });
    }
    recommendations.push({
      priority: "high",
      action: "الإصلاح الرئيسي",
      description: analysis.suggested_action,
      timeline: analysis.estimated_time || "خلال يوم",
    });
    if (analysis.preventive_measures) {
      recommendations.push({
        priority: "medium",
        action: "إجراءات وقائية",
        description: analysis.preventive_measures,
        timeline: "بعد الإصلاح",
      });
    }
    return recommendations;
  }

  private suggestParts(issueType: string): string[] {
    const partsMap: Record<string, string[]> = {
      plumbing: ["طوق مطاط", "وصلات PVC", "سيليكون عازل", "صمامات"],
      electrical: ["أسلاك", "مفاتيح", "مآخذ", "قواطع كهربائية"],
      painting: ["دهان", "معجون", "صنفرة", "فرشاة"],
      carpentry: ["مسامير", "غراء خشب", "مفصلات", "ألواح خشب"],
      finishing: ["بلاط", "سيراميك", "جص", "مونة"],
      structural: ["اسمنت", "حديد تسليح", "مواد عازلة", "شبك تسليح"],
    };
    return partsMap[issueType] || ["فحص فني لتحديد القطع المطلوبة"];
  }

  /**
   * تحديد متطلبات الفنيين
   */
  private getTechnicianRequirements(
    issueType: string,
    urgency: string,
  ): {
    count: number;
    specialties: string[];
    estimated_hours: number;
  } {
    const requirements = {
      plumbing: { count: 1, specialties: ["سباك"], hours: 2 },
      electrical: { count: 1, specialties: ["كهربائي"], hours: 2 },
      painting: { count: 1, specialties: ["دهان"], hours: 3 },
      carpentry: { count: 1, specialties: ["نجار"], hours: 2 },
      finishing: { count: 2, specialties: ["فني تشطيبات", "عامل"], hours: 4 },
      structural: { count: 2, specialties: ["مهندس إنشائي", "عمال"], hours: 8 },
    };

    const base = requirements[issueType as keyof typeof requirements] || {
      count: 1,
      specialties: ["فني عام"],
      hours: 2,
    };

    // زيادة الموارد للطوارئ
    if (urgency === "emergency") {
      base.count += 1;
      base.hours = Math.min(base.hours + 2, 12);
    }

    return {
      count: base.count,
      specialties: base.specialties,
      estimated_hours: base.hours,
    };
  }
}
