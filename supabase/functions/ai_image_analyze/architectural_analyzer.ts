import { GeminiClient } from "./gemini.client.ts";
import {
  ARCHITECTURAL_SYSTEM_PROMPT,
  getArchitecturalImagePrompt,
  getFinishingAssessmentPrompt,
  getStructuralDefectsPrompt,
} from "./architectural_prompts.ts";
import {
  ArchitecturalAnalysis,
  DamageAssessment,
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
  private enrichAnalysis(analysis: any, options: any): ArchitecturalAnalysis {
    return {
      ...analysis,
      metadata: {
        analyzed_at: new Date().toISOString(),
        building_type: options.buildingType || "residential",
        analysis_version: "1.0.0",
        model_used: "gemini-1.5-flash",
      },
      recommendations: this.generateRecommendations(analysis),
      parts_needed: this.suggestParts(analysis.issue_type),
      technician_requirements: this.getTechnicianRequirements(
        analysis.issue_type,
        analysis.urgency,
      ),
    };
  }

  /**
   * إنشاء توصيات مفصلة بناءً على التحليل
   */
  private generateRecommendations(analysis: any): RepairRecommendation[] {
    const recommendations: RepairRecommendation[] = [];

    // توصية فورية
    if (analysis.urgency === "emergency") {
      recommendations.push({
        priority: "critical",
        action: "إجراءات فورية",
        description: analysis.immediate_action || "يجب التعامل مع المشكلة فوراً بسبب خطورتها",
        timeline: "خلال ساعة",
      });
    }

    // توصية إصلاح
    recommendations.push({
      priority: "high",
      action: "الإصلاح الرئيسي",
      description: analysis.suggested_action,
      timeline: analysis.estimated_time || "خلال يوم",
    });

    // توصية وقائية
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

  /**
   * اقتراح قطع الغيار المطلوبة
   */
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
