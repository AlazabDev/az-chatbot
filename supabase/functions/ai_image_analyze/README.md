# AI Image Analysis Function

تحليل الصور باستخدام Google Gemini Vision API.

## الاستخدام

### الطلب

```bash
curl -X POST https://your-project.supabase.co/functions/v1/ai_image_analyze \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/image.jpg",
    "caption": "حوض المطبخ مسدود",
    "conversation_id": "abc-123",
    "request_id": "mr-123"
  }'
  {
  "success": true,
  "data": {
    "from_cache": false,
    "image_hash": "a3f5e7c...",
    "analysis": {
      "issue_type": "plumbing",
      "urgency": "urgent",
      "description": "تسرب مياه من أسفل حوض المطبخ...",
      "confidence": 0.95,
      "possible_causes": ["تمزق خرطوم التوصيل", "تآكل الوصلات"],
      "suggested_action": "يجب إغلاق صمام المياه الرئيسي واستدعاء فني سباكة فوراً",
      "detected_objects": ["حوض مطبخ", "خرطوم مياه", "تسرب مياه"],
      "severity_score": 0.85
    }
  }
}
```
