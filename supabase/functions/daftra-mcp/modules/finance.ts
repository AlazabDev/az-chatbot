// modules/finance.ts
// موديول الحسابات العامة والمالية: القيود اليومية، دليل الحسابات، المصروفات، الإيرادات، والخزائن
import { callDaftraApi } from "../daftra-client.ts";

export const financeTools = [
  // ==========================================
  // 1. قيود اليومية - استعراض (List Journals)
  // ==========================================
  {
    name: "daftra_list_journals",
    description: "استعراض قيود اليومية المحاسبية من دفترة مع خيارات الفلترة برقم الصفحة أو التاريخ أو المسودة.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة (الافتراضي: 1)" },
        limit: { type: "number", description: "عدد القيود في الصفحة (الافتراضي: 20)" },
        draft: { type: "number", description: "حالة القيد: 0 للقيود المعتمدة (Issued)، 1 للمسودات (Draft)" }
      }
    },
    handler: async (args: any) => {
      const queryParams: Record<string, string | number> = {
        page: args.page || 1,
        limit: args.limit || 20,
      };
      if (args.draft !== undefined) queryParams["draft"] = args.draft;
      return await callDaftraApi("GET", "journals.json", undefined, queryParams);
    }
  },

  // ==========================================
  // 2. قيود اليومية - تفاصيل قيد (Get Single Journal)
  // ==========================================
  {
    name: "daftra_get_journal",
    description: "جلب تفاصيل قيد يومية محدد بجميع بنوده وأطرافه المدين والدائن بواسطة معرّف القيد.",
    inputSchema: {
      type: "object",
      properties: {
        journal_id: { type: "number", description: "معرّف قيد اليومية في دفترة (ID)" }
      },
      required: ["journal_id"]
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", `journals/${args.journal_id}.json`);
    }
  },

  // ==========================================
  // 3. قيود اليومية - إنشاء قيد (Create Journal Entry)
  // ==========================================
  {
    name: "daftra_create_journal",
    description: "إنشاء قيد يومية جديد متزن (Debit = Credit) في دفترة مع بنود المعاملات (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "تاريخ القيد YYYY-MM-DD (الافتراضي: اليوم)" },
        description: { type: "string", description: "شرح / بيان القيد العام" },
        currency_code: { type: "string", description: "رمز العملة (مثال: EGP, SAR, USD)" },
        draft: { type: "number", description: "0 معتمد ومرحل، 1 مسودة (الافتراضي: 0)" },
        transactions: {
          type: "array",
          description: "أطراف وبنود القيد المحاسبي (يجب أن يتساوى إجمالي المدين مع إجمالي الدائن)",
          items: {
            type: "object",
            properties: {
              journal_account_id: { type: "number", description: "معرّف الحساب في شجرة الحسابات" },
              currency_debit: { type: "number", description: "المبلغ المدين (أو 0 إذا كان الطرف دائناً)" },
              currency_credit: { type: "number", description: "المبلغ الدائن (أو 0 إذا كان الطرف مديناً)" },
              description: { type: "string", description: "شرح خاص بالبند" }
            },
            required: ["journal_account_id"]
          }
        },
        confirm: { type: "boolean", description: "تأكيد إضافة القيد لمنع الخطأ المحاسبي" }
      },
      required: ["transactions", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("إنشاء قيد يومية يتطلب تأكيداً صريحاً بتمرير confirm=true.");
      }

      // التحقق السريع من توازن القيد
      const totalDebit = args.transactions.reduce((acc: number, t: any) => acc + (t.currency_debit || 0), 0);
      const totalCredit = args.transactions.reduce((acc: number, t: any) => acc + (t.currency_credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`القيد غير متزن! إجمالي المدين (${totalDebit}) لا يساوي إجمالي الدائن (${totalCredit}).`);
      }

      const payload = {
        Journal: {
          date: args.date || new Date().toISOString().split("T")[0],
          description: args.description,
          currency_code: args.currency_code,
          draft: args.draft || 0
        },
        JournalTransaction: args.transactions.map((t: any) => ({
          journal_account_id: t.journal_account_id,
          currency_debit: t.currency_debit || 0,
          currency_credit: t.currency_credit || 0,
          description: t.description
        }))
      };

      return await callDaftraApi("POST", "journals.json", payload);
    }
  },

  // ==========================================
  // 4. دليل الحسابات - استعراض الحسابات (List Accounts)
  // ==========================================
  {
    name: "daftra_list_journal_accounts",
    description: "استعراض شجرة ودليل الحسابات في دفترة للتعرف على أرقام ومعرفات الحسابات المحاسبية.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "الحد الأقصى (الافتراضي: 50)" },
        journal_cat_id: { type: "number", description: "فلترة حسب المجلد/الفئة الرئيسية للحساب" }
      }
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", "journal_accounts.json", undefined, {
        page: args.page || 1,
        limit: args.limit || 50,
        "filter[journal_cat_id]": args.journal_cat_id
      });
    }
  },

  // ==========================================
  // 5. دليل الحسابات - إضافة حساب جديد (Add Account)
  // ==========================================
  {
    name: "daftra_create_journal_account",
    description: "إضافة حساب فرعي جديد في دليل وشجرة الحسابات (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم الحساب (مثال: مصروفات تسويق رقمي)" },
        code: { type: "string", description: "كود الحساب الفريد (أرقام فقط، مثال: 5104)" },
        journal_cat_id: { type: "number", description: "معرّف المجلد / التصنيف الأب للحساب" },
        type: { type: "number", description: "طبيعة الحساب: 0 دائن (Credit)، 1 مدين (Debit)" },
        confirm: { type: "boolean", description: "تأكيد إضافة الحساب" }
      },
      required: ["name", "code", "journal_cat_id", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("إضافة حساب في الدليل تتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload = {
        JournalAccount: {
          name: args.name,
          code: args.code,
          journal_cat_id: args.journal_cat_id,
          type: args.type !== undefined ? args.type : 1
        }
      };
      return await callDaftraApi("POST", "journal_accounts.json", payload);
    }
  },

  // ==========================================
  // 6. المصروفات - استعراض (List Expenses)
  // ==========================================
  {
    name: "daftra_list_expenses",
    description: "استعراض والبحث في المصروفات المسجلة في دفترة مع فلترة بالتواريخ أو العميل أو المورد أو الخزينة.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "الحد الأقصى للنتائج" },
        treasury_id: { type: "number", description: "فلترة بالخزينة المسحوب منها" },
        client_id: { type: "number", description: "فلترة حسب العميل المرتبط" },
        supplier_id: { type: "number", description: "فلترة حسب المورد" }
      }
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", "expenses.json", undefined, {
        page: args.page || 1,
        limit: args.limit || 20,
        "filter[treasury_id]": args.treasury_id,
        "filter[client_id]": args.client_id,
        "filter[supplier_id]": args.supplier_id
      });
    }
  },

  // ==========================================
  // 7. المصروفات - إضافة سند صرف ومصروف (Create Expense)
  // ==========================================
  {
    name: "daftra_create_expense",
    description: "تسجيل سند صرف / مصروف جديد في دفترة وخصمه من الخزينة أو البنك وربطه بحساب الأستاذ (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "قيمة المصروف (إجباري)" },
        date: { type: "string", description: "تاريخ المصروف YYYY-MM-DD" },
        category: { type: "string", description: "اسم بند/تصنيف المصروف (يتم إنشاؤه تلقائياً إن لم يوجد)" },
        treasury_id: { type: "number", description: "معرّف الخزينة أو البنك المسحوب منه (افتراضياً الخزينة الرئيسية)" },
        journal_account_id: { type: "number", description: "معرّف حساب المصروف في شجرة الحسابات" },
        note: { type: "string", description: "ملاحظات وتفاصيل المصروف" },
        vendor: { type: "string", description: "اسم البائع أو الجهة المصروف لها" },
        work_order_id: { type: "number", description: "معرّف أمر العمل المرتبط بهذا المصروف (إن وجد)" },
        client_id: { type: "number", description: "معرّف العميل المرتبط" },
        supplier_id: { type: "number", description: "معرّف المورد المرتبط" },
        confirm: { type: "boolean", description: "تأكيد تسجيل المصروف" }
      },
      required: ["amount", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("تسجيل سند صرف يتطلب تأكيداً صريحاً بتمرير confirm=true.");
      }
      const payload = {
        Expense: {
          amount: args.amount,
          date: args.date || new Date().toISOString().split("T")[0],
          category: args.category,
          treasury_id: args.treasury_id,
          journal_account_id: args.journal_account_id,
          note: args.note,
          vendor: args.vendor,
          work_order_id: args.work_order_id,
          client_id: args.client_id,
          supplier_id: args.supplier_id
        }
      };
      return await callDaftraApi("POST", "expenses.json", payload);
    }
  },

  // ==========================================
  // 8. الإيرادات - استعراض (List Incomes)
  // ==========================================
  {
    name: "daftra_list_incomes",
    description: "استعراض الإيرادات الأخرى وسندات القبض الواردة في دفترة.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "عدد النتائج" },
        treasury_id: { type: "number", description: "فلترة بحسب الخزينة أو الحساب البنكي المودع به" }
      }
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", "incomes.json", undefined, {
        page: args.page || 1,
        limit: args.limit || 20,
        "filter[treasury_id]": args.treasury_id
      });
    }
  },

  // ==========================================
  // 9. الإيرادات - إضافة إيراد (Create Income)
  // ==========================================
  {
    name: "daftra_create_income",
    description: "تسجيل إيراد مالي وارد في دفترة وإيداعه في خزينة أو بنك (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "المبلغ المحصل (إجباري)" },
        date: { type: "string", description: "تاريخ التحصيل YYYY-MM-DD" },
        category: { type: "string", description: "تصنيف الإيراد (مثال: خدمات استشارية، إيرادات صيانة)" },
        treasury_id: { type: "number", description: "معرّف الخزينة المودع بها" },
        journal_account_id: { type: "number", description: "حساب الإيراد في دليل الحسابات" },
        client_id: { type: "number", description: "معرّف العميل (إن وجد)" },
        work_order_id: { type: "number", description: "معرّف أمر العمل المرتبط" },
        note: { type: "string", description: "ملاحظات الإيراد" },
        confirm: { type: "boolean", description: "تأكيد تسجيل الإيراد" }
      },
      required: ["amount", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("تسجيل إيراد يتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload = {
        Income: {
          amount: args.amount,
          date: args.date || new Date().toISOString().split("T")[0],
          category: args.category,
          treasury_id: args.treasury_id,
          journal_account_id: args.journal_account_id,
          client_id: args.client_id,
          work_order_id: args.work_order_id,
          note: args.note
        }
      };
      return await callDaftraApi("POST", "incomes.json", payload);
    }
  },

  // ==========================================
  // 10. الخزائن والبنوك - استعراض (List Treasuries)
  // ==========================================
  {
    name: "daftra_list_treasuries",
    description: "استعراض كافة الخزائن النقدية والحسابات البنكية المسجلة في دفترة وأرصدتها.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "الحد الأقصى" }
      }
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", "treasuries.json", undefined, {
        page: args.page || 1,
        limit: args.limit || 20
      });
    }
  },

  // ==========================================
  // 11. الخزائن والبنوك - إضافة خزينة/بنك (Add Treasury)
  // ==========================================
  {
    name: "daftra_create_treasury",
    description: "إضافة خزينة نقدية جديدة أو حساب بنكي في دفترة (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم الخزينة أو البنك (مثال: الخزينة الفرعية، البنك الأهلي)" },
        type: { type: "number", description: "النوع: 3 خزينة كاش (Treasury)، 1 حساب بنكي (Bank Account)" },
        type_name: { type: "string", description: "اسم البنك (في حال كان حساباً بنكياً)" },
        type_account_number: { type: "string", description: "رقم الحساب البنكي / IBAN" },
        currency_code: { type: "string", description: "عملة الحساب (مثال: EGP)" },
        description: { type: "string", description: "وصف الحساب" },
        confirm: { type: "boolean", description: "تأكيد الإضافة" }
      },
      required: ["name", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("إضافة خزينة أو حساب بنكي تتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload = {
        Treasury: {
          name: args.name,
          type: args.type || 3,
          type_name: args.type_name,
          type_account_number: args.type_account_number,
          currency_code: args.currency_code,
          description: args.description,
          active: 1
        }
      };
      return await callDaftraApi("POST", "treasuries.json", payload);
    }
  }
];
