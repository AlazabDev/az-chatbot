/**
 * Arabic Normalization & Domain Synonyms for Daftra MCP
 */

// معجم المصطلحات والمترادفات المحاسبية (عربي -> إنجليزي)
export const ARABIC_DAFTRA_SYNONYMS: Record<string, string[]> = {
  // فواتير ومبيعات
  "فاتورة": ["invoice", "invoices", "sales"],
  "فواتير": ["invoice", "invoices", "sales"],
  "بيع": ["sales", "invoice", "pos"],
  "مبيعات": ["sales", "invoice", "pos"],
  "عرض": ["estimate", "estimates", "quote"],
  "عروض": ["estimate", "estimates", "quote"],
  "سعر": ["price", "estimate"],
  "مرتجع": ["refund", "credit_note", "debit_note", "return"],
  "مرتجعات": ["refund", "credit_note", "debit_note", "return"],
  "اشعار": ["credit_note", "debit_note"],
  "دائن": ["credit_note", "credit"],
  "مدين": ["debit_note", "debit"],
  "اشتراك": ["subscription", "subscriptions"],
  "اشتراكات": ["subscription", "subscriptions"],
  "شحن": ["shipping"],

  // عملاء وموردين
  "عميل": ["client", "clients", "customer"],
  "عملاء": ["client", "clients", "customer"],
  "زبون": ["client", "clients"],
  "مورد": ["supplier", "suppliers", "vendor"],
  "موردين": ["supplier", "suppliers", "vendor"],

  // مالية ومحاسبة
  "قيد": ["journal", "journals", "accounting"],
  "قيود": ["journal", "journals", "accounting"],
  "يومية": ["journal", "journals"],
  "حساب": ["account", "journal_accounts"],
  "حسابات": ["account", "journal_accounts"],
  "دليل": ["chart_of_accounts", "journal_accounts"],
  "شجرة": ["chart_of_accounts", "journal_accounts"],
  "مصروف": ["expense", "expenses"],
  "مصاريف": ["expense", "expenses"],
  "ايراد": ["income", "incomes"],
  "ايرادات": ["income", "incomes"],
  "دفعة": ["payment", "payments"],
  "دفعات": ["payment", "payments"],
  "سند": ["receipt", "payment", "expense"],
  "خزينة": ["treasury", "treasuries"],
  "خزائن": ["treasury", "treasuries"],
  "بنك": ["treasury", "bank"],
  "مركز": ["cost_center"],
  "تكلفة": ["cost_center"],
  "ضريبة": ["tax", "taxes"],
  "ضرائب": ["tax", "taxes"],

  // أوامر عمل وحجوزات
  "امر": ["work_order", "work_orders", "order"],
  "اوامر": ["work_order", "work_orders"],
  "شغل": ["work_order"],
  "تشغيل": ["work_order"],
  "صيانة": ["work_order"],
  "موعد": ["appointment", "booking"],
  "مواعيد": ["appointment", "booking"],
  "حجز": ["booking", "appointment"],
  "حجوزات": ["booking", "appointment"],

  // مخزون ومنتجات
  "منتج": ["product", "products", "item"],
  "منتجات": ["product", "products", "item"],
  "صنف": ["product", "item"],
  "اصناف": ["product", "item"],
  "مخزن": ["store", "stores", "warehouse"],
  "مستودع": ["store", "stores", "warehouse"],
  "جرد": ["stock_transaction", "stock"],
  "حركة": ["stock_transaction"],
  "طلب": ["purchase_order", "requisition"],
  "شراء": ["purchase", "purchases"],
  "مشتريات": ["purchase", "purchases"],

  // موارد بشرية
  "موظف": ["staff", "employee"],
  "موظفين": ["staff", "employee"],
  "حضور": ["attendance"],
  "انصراف": ["attendance"],
  "اجازة": ["leave"],
  "اجازات": ["leave"],
  "قسم": ["department"],
  "اقسام": ["department"],
  "عهدة": ["employee_asset", "asset"],
};

/**
 * تطبيع النصوص العربية (إزالة التشكيل، توحيد الهمزات والأحرف)
 */
export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    // إزالة التشكيل والتنوين
    .replace(/[\u064B-\u065F\u0670]/g, "")
    // توحيد الألف
    .replace(/[أإآ]/g, "ا")
    // توحيد الياء والتاء المربوطة
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    // إزالة الـ التعريف في بداية الكلمات إذا وجدت
    .replace(/(^|\s)ال([^\s]{3,})/g, "$1$2");
}

/**
 * توسيع كلمات البحث لتشمل المترادفات الإنجليزية المقابلة
 */
export function expandSearchTerms(query: string): string[] {
  if (!query) return [];
  const normalized = normalizeArabic(query);
  const rawWords = normalized.split(/\s+/).filter(Boolean);
  const expanded = new Set<string>();

  for (const word of rawWords) {
    expanded.add(word);
    // فحص ما إذا كانت الكلمة تطابق مصطلحاً عربياً
    for (const [arKey, enTerms] of Object.entries(ARABIC_DAFTRA_SYNONYMS)) {
      if (word.includes(arKey) || arKey.includes(word)) {
        for (const term of enTerms) expanded.add(term.toLowerCase());
      }
    }
  }

  return Array.from(expanded);
}
