import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { AnalysisResult } from "./types.ts";

export class ImageAnalysisCache {
  private supabase: SupabaseClient;
  private cacheTTL = 30 * 24 * 60 * 60; // 30 يوم

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async get(imageHash: string): Promise<AnalysisResult | null> {
    const { data, error } = await this.supabase
      .from("ai_analysis_cache")
      .select("analysis_result, created_at")
      .eq("image_hash", imageHash)
      .single();

    if (error || !data) {
      return null;
    }

    // التحقق من صلاحية cache
    const createdAt = new Date(data.created_at);
    const now = new Date();
    const ageInSeconds = (now.getTime() - createdAt.getTime()) / 1000;

    if (ageInSeconds > this.cacheTTL) {
      // حذف cache منتهي الصلاحية
      await this.supabase.from("ai_analysis_cache").delete().eq("image_hash", imageHash);
      return null;
    }

    return data.analysis_result as AnalysisResult;
  }

  async set(imageHash: string, analysis: AnalysisResult): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 يوم من الآن

    const { error } = await this.supabase.from("ai_analysis_cache").upsert(
      {
        image_hash: imageHash,
        analysis_result: analysis,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        onConflict: "image_hash",
      },
    );

    if (error) {
      console.error("Error caching analysis:", error);
    }
  }

  async clearExpired(): Promise<void> {
    const { error } = await this.supabase
      .from("ai_analysis_cache")
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (error) {
      console.error("Error clearing expired cache:", error);
    }
  }
}
