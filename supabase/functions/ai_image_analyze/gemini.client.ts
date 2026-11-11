import { AnalysisResult, MaintenanceIssueType, UrgencyLevel } from "./types.ts";
import { getSystemPrompt, getImageAnalysisPrompt } from "./prompts.ts";

export class GeminiClient {
  private apiKey: string;
  private apiUrl =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeImage(imageData: string | Uint8Array, caption?: string): Promise<AnalysisResult> {
    try {
      // تحويل الصورة إلى base64 إذا كانت Uint8Array
      let base64Image: string;
      if (typeof imageData === "string") {
        base64Image = imageData;
      } else {
        base64Image = this.arrayBufferToBase64(imageData);
      }

      // بناء الـ request body
      const requestBody = {
        contents: [
          {
            parts: [
              { text: getSystemPrompt() },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image,
                },
              },
              { text: getImageAnalysisPrompt(caption) },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 1,
          topP: 0.8,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      };

      // استدعاء Gemini API
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${error}`);
      }

      const data = await response.json();
      const analysisText = data.candidates[0].content.parts[0].text;

      // استخراج JSON من النص
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in response");
      }

      const analysis = JSON.parse(jsonMatch[0]) as AnalysisResult;

      // التحقق من صحة النتيجة
      return this.validateAnalysis(analysis);
    } catch (error) {
      console.error("Error in Gemini analysis:", error);
      // إرجاع تحليل افتراضي في حالة الفشل
      return this.getFallbackAnalysis();
    }
  }

  /**
   * Structured architectural prompt endpoint used by ArchitecturalAnalyzer.
   * Rejects missing/non-JSON responses rather than returning fabricated analysis.
   */
  async analyzeWithCustomPrompt(
    imageData: string | Uint8Array,
    systemPrompt: string,
    prompt: string,
  ): Promise<Record<string, unknown>> {
    const encoded = typeof imageData === "string"
      ? imageData : this.arrayBufferToBase64(imageData);
    const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: encoded } },
        ] }],
        generationConfig: {
          temperature: 0.2, maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Gemini architectural response: ${response.status}`);
    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "")
      .join("\n").trim();
    if (!text) throw new Error("Empty Gemini architectural response");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid Gemini architectural JSON");
    return parsed as Record<string, unknown>;
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private validateAnalysis(analysis: Partial<AnalysisResult>): AnalysisResult {
    const validIssueTypes: MaintenanceIssueType[] = [
      "plumbing",
      "electrical",
      "painting",
      "carpentry",
      "finishing",
      "other",
    ];
    const validUrgency: UrgencyLevel[] = ["normal", "urgent", "emergency"];

    const issueType = analysis.issue_type;
    const urgency = analysis.urgency;
    return {
      issue_type: issueType && validIssueTypes.includes(issueType) ? issueType : "other",
      urgency: urgency && validUrgency.includes(urgency) ? urgency : "normal",
      description: analysis.description || "لم يتم تحديد وصف للعطل",
      confidence: Math.min(Math.max(analysis.confidence || 0.7, 0), 1),
      possible_causes: analysis.possible_causes || [],
      suggested_action: analysis.suggested_action || "يرجى مراجعة فني متخصص",
      detected_objects: analysis.detected_objects || [],
      severity_score: Math.min(Math.max(analysis.severity_score || 0.5, 0), 1),
      raw_response: analysis,
    };
  }

  private getFallbackAnalysis(): AnalysisResult {
    return {
      issue_type: "other",
      urgency: "normal",
      description: "تعذر تحليل الصورة تلقائياً. يرجى مراجعة الصورة يدوياً.",
      confidence: 0,
      possible_causes: [],
      suggested_action: "يرجى مراجعة فني متخصص لتقييم الحالة",
      detected_objects: [],
      severity_score: 0.5,
      raw_response: {},
    };
  }
}
