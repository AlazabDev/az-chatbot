// modules/work-orders.ts
// تغطية شاملة لكافة عمليات أوامر العمل والمواعيد وربط الفواتير في دفترة
import { callDaftraApi } from "../daftra-client.ts";

export const workOrderTools = [
  // ==========================================
  // 1. استعراض أوامر العمل (GET All Work Orders)
  // ==========================================
  {
    name: "daftra_list_work_orders",
    description: "استعراض والبحث في قائمة أوامر العمل (Work Orders) في دفترة مع الفلترة حسب الحالة أو الصفحة.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة (الافتراضي: 1)" },
        limit: { type: "number", description: "عدد العناصر في الصفحة (الافتراضي: 20)" },
        status: {
          type: "string",
          description: "فلترة حسب الحالة. عند تركه فارغاً يُرجع فقط المفتوحة (Open)، أو مرر '-1' لإرجاع كل الحالات."
        }
      }
    },
    handler: async (args: any) => {
      const queryParams: Record<string, string | number> = {
        page: args.page || 1,
        limit: args.limit || 20,
      };
      if (args.status !== undefined) {
        queryParams["status"] = args.status;
      }
      return await callDaftraApi("GET", "work_orders.json", undefined, queryParams);
    }
  },

  // ==========================================
  // 2. تفاصيل أمر عمل محدد (GET Single Work Order)
  // ==========================================
  {
    name: "daftra_get_work_order",
    description: "جلب التفاصيل الكاملة لأمر عمل محدد بواسطة معرف أمر العمل (Work Order ID).",
    inputSchema: {
      type: "object",
      properties: {
        work_order_id: { type: "number", description: "معرف أمر العمل في دفترة (ID)" }
      },
      required: ["work_order_id"]
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", `work_orders/${args.work_order_id}.json`);
    }
  },

  // ==========================================
  // 3. إضافة أمر عمل جديد (Add New Work Order)
  // ==========================================
  {
    name: "daftra_create_work_order",
    description: "إنشاء أمر عمل جديد في دفترة وربطه بعميل وموظف وميزانية وتاريخ بدء وتسليم (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "عنوان أمر العمل (مثال: صيانة موقع، تركيب معدات)" },
        client_id: { type: "number", description: "معرف العميل (Client ID) التابع له أمر العمل" },
        number: { type: "string", description: "رقم أمر العمل (اختياري - يتم إنشاؤه تلقائياً إذا تُرك فارغاً)" },
        start_date: { type: "string", description: "تاريخ البدء بصيغة YYYY-MM-DD (الافتراضي: تاريخ اليوم)" },
        delivery_date: { type: "string", description: "تاريخ التسليم المتوقع YYYY-MM-DD" },
        description: { type: "string", description: "وصف تفصيلي لأمر العمل والمهمة" },
        budget: { type: "number", description: "الميزانية المحددة لأمر العمل" },
        budget_currency: { type: "string", description: "رمز العملة للميزانية (مثال: EGP, SAR, USD)" },
        staff_id: { type: "number", description: "معرف الموظف المسؤول المكلف بتنفيذ أمر العمل" },
        follow_up_status_id: { type: "number", description: "معرف حالة المتابعة (Follow-up status ID)" },
        delivery_appointment_id: { type: "number", description: "معرف الموعد المرتبط بالتسليم (إن وجد)" },
        is_draft: { type: "number", description: "مرر 1 لحفظ أمر العمل كمسودة Draft" },
        confirm: { type: "boolean", description: "تأكيد إنشاء أمر العمل لتجنب الإنشاء غير المقصود" }
      },
      required: ["title", "client_id", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("إنشاء أمر العمل يتطلب تأكيداً صريحاً بتمرير confirm=true.");
      }
      const payload = {
        WorkOrder: {
          title: args.title,
          client_id: args.client_id,
          number: args.number,
          start_date: args.start_date || new Date().toISOString().split("T")[0],
          delivery_date: args.delivery_date,
          description: args.description,
          budget: args.budget,
          budget_currency: args.budget_currency,
          staff_id: args.staff_id,
          follow_up_status_id: args.follow_up_status_id,
          delivery_appointment_id: args.delivery_appointment_id,
          is_draft: args.is_draft || 0,
        }
      };
      return await callDaftraApi("POST", "work_orders.json", payload);
    }
  },

  // ==========================================
  // 4. تعديل أمر عمل (Edit Work Order)
  // ==========================================
  {
    name: "daftra_update_work_order",
    description: "تعديل بيانات أمر عمل قائم في دفترة (العنوان، التواريخ، الميزانية، الموظف المسؤول، الحالة).",
    inputSchema: {
      type: "object",
      properties: {
        work_order_id: { type: "number", description: "معرف أمر العمل المراد تعديله" },
        title: { type: "string", description: "العنوان الجديد" },
        client_id: { type: "number", description: "تحديث العميل التابع له" },
        start_date: { type: "string", description: "تاريخ البدء YYYY-MM-DD" },
        delivery_date: { type: "string", description: "تاريخ التسليم YYYY-MM-DD" },
        description: { type: "string", description: "الوصف المحدث" },
        budget: { type: "number", description: "الميزانية المحدثة" },
        budget_currency: { type: "string", description: "عملة الميزانية" },
        staff_id: { type: "number", description: "الموظف المكلف الجديد" },
        follow_up_status_id: { type: "number", description: "معرف حالة المتابعة" },
        confirm: { type: "boolean", description: "تأكيد تعديل أمر العمل" }
      },
      required: ["work_order_id", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("تعديل أمر العمل يتطلب تأكيداً صريحاً بتمرير confirm=true.");
      }
      const workOrderData: Record<string, unknown> = {};
      const fields = [
        "title", "client_id", "start_date", "delivery_date",
        "description", "budget", "budget_currency", "staff_id", "follow_up_status_id"
      ];
      for (const field of fields) {
        if (args[field] !== undefined) {
          workOrderData[field] = args[field];
        }
      }
      return await callDaftraApi("PUT", `work_orders/${args.work_order_id}.json`, { WorkOrder: workOrderData });
    }
  },

  // ==========================================
  // 5. حذف أمر عمل (Delete Work Order)
  // ==========================================
  {
    name: "daftra_delete_work_order",
    description: "حذف أمر عمل نهائياً من دفترة (عملية حساسة تتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        work_order_id: { type: "number", description: "معرف أمر العمل المراد حذفه" },
        confirm: { type: "boolean", description: "تأكيد الحذف النهائي" }
      },
      required: ["work_order_id", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("حذف أمر العمل يتطلب تأكيداً صريحاً بتمرير confirm=true لتفادي فقد البيانات.");
      }
      return await callDaftraApi("DELETE", `work_orders/${args.work_order_id}.json`);
    }
  },

  // ==========================================
  // 6. ربط أمر العمل بفاتورة (Assign Work Order to Invoice)
  // ==========================================
  {
    name: "daftra_assign_work_order_to_invoice",
    description: "ربط أمر عمل بفاتورة محددة، أو فك الارتباط بتمرير work_order_id=0.",
    inputSchema: {
      type: "object",
      properties: {
        invoice_id: { type: "number", description: "معرف الفاتورة في دفترة" },
        work_order_id: {
          type: "number",
          description: "معرف أمر العمل المراد ربطه، أو مرر 0 لفك الارتباط"
        },
        confirm: { type: "boolean", description: "تأكيد عملية الربط" }
      },
      required: ["invoice_id", "work_order_id", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("ربط أمر العمل بالفاتورة يتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload = {
        Invoice: {
          work_order_id: args.work_order_id
        }
      };
      return await callDaftraApi("POST", `invoices/assign_work_order/${args.invoice_id}.json`, payload);
    }
  },

  // ==========================================
  // 7. قائمة مواعيد أوامر العمل (Work Order Appointments)
  // ==========================================
  {
    name: "daftra_list_work_order_appointments",
    description: "استعراض مواعيد وزيارات أمر العمل مع الفلترة بأمر العمل أو العميل أو الحالة.",
    inputSchema: {
      type: "object",
      properties: {
        work_order_id: { type: "number", description: "فلترة المواعيد الخاصة بأمر عمل محدد" },
        partner_id: { type: "number", description: "فلترة حسب العميل (Partner ID)" },
        status_id: {
          type: "number",
          description: "حالة الموعد: 0 مجدول (Scheduled)، 1 مكتمل (Done)، 2 ملغي/مرفوض (Dismissed)"
        },
        page: { type: "number", description: "رقم الصفحة" },
        limit: { type: "number", description: "عدد العناصر" }
      }
    },
    handler: async (args: any) => {
      const queryParams: Record<string, string | number> = {
        page: args.page || 1,
        limit: args.limit || 20
      };
      if (args.work_order_id !== undefined) queryParams["work_order_id"] = args.work_order_id;
      if (args.partner_id !== undefined) queryParams["partner_id"] = args.partner_id;
      if (args.status_id !== undefined) queryParams["status_id"] = args.status_id;

      return await callDaftraApi("GET", "work_order_appointments.json", undefined, queryParams);
    }
  },

  // ==========================================
  // 8. جلب تفاصيل موعد محدد (Single Appointment)
  // ==========================================
  {
    name: "daftra_get_work_order_appointment",
    description: "جلب تفاصيل موعد محدد خاص بأمر عمل بواسطة Appointment ID.",
    inputSchema: {
      type: "object",
      properties: {
        appointment_id: { type: "number", description: "معرف الموعد" }
      },
      required: ["appointment_id"]
    },
    handler: async (args: any) => {
      return await callDaftraApi("GET", `work_order_appointments/${args.appointment_id}.json`);
    }
  },

  // ==========================================
  // 9. إضافة موعد لأمر العمل (Add Appointment)
  // ==========================================
  {
    name: "daftra_create_work_order_appointment",
    description: "إضافة موعد أو زيارة جديدة لأمر عمل مع تحديد الوقت والمدة والموظف وملاحظات الموعد.",
    inputSchema: {
      type: "object",
      properties: {
        work_order_id: { type: "number", description: "معرف أمر العمل التابع له الموعد (item_id)" },
        date: { type: "string", description: "تاريخ ووقت بدء الموعد (مثال: 2026-10-15 14:00:00)" },
        end_date: { type: "string", description: "تاريخ ووقت انتهاء الموعد (اختياري، يتم حسابه من المدة)" },
        duration: { type: "string", description: "مدة الموعد بالساعات أو بصيغة HH:MM (مثال: 02:00)" },
        staff_id: { type: "number", description: "معرف الموظف المكلف بالموعد" },
        body: { type: "string", description: "ملاحظات وتفاصيل الموعد (بحد أقصى 1500 حرف)" },
        action_id: { type: "number", description: "معرف إجراء المتابعة (Action ID)" },
        share_with_partner: { type: "boolean", description: "مشاركة الموعد مع العميل" },
        confirm: { type: "boolean", description: "تأكيد إضافة الموعد" }
      },
      required: ["work_order_id", "date", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("إضافة موعد لأمر العمل تتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload = {
        WorkOrderAppointment: {
          item_id: args.work_order_id,
          date: args.date,
          end_date: args.end_date,
          duration: args.duration || "01:00",
          staff_id: args.staff_id,
          body: args.body,
          action_id: args.action_id,
          share_with_partner: args.share_with_partner ? 1 : 0
        }
      };
      return await callDaftraApi("POST", "work_order_appointments.json", payload);
    }
  },

  // ==========================================
  // 10. تعديل موعد أمر عمل (Edit Appointment)
  // ==========================================
  {
    name: "daftra_update_work_order_appointment",
    description: "تعديل موعد أو زيارة قائمة (التوقيت، الحالة، الملاحظات، الموظف المكلف).",
    inputSchema: {
      type: "object",
      properties: {
        appointment_id: { type: "number", description: "معرف الموعد المراد تعديله" },
        date: { type: "string", description: "تاريخ ووقت البدء الجديد" },
        end_date: { type: "string", description: "تاريخ ووقت الانتهاء الجديد" },
        status: { type: "number", description: "تحديث الحالة (0 مجدول، 1 مكتمل، 2 ملغي)" },
        duration: { type: "string", description: "المدة" },
        staff_id: { type: "number", description: "الموظف المكلف" },
        body: { type: "string", description: "الملاحظات المحدثة" },
        confirm: { type: "boolean", description: "تأكيد تعديل الموعد" }
      },
      required: ["appointment_id", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("تعديل موعد أمر العمل يتطلب تأكيداً بتمرير confirm=true.");
      }
      const apptData: Record<string, unknown> = {};
      const fields = ["date", "end_date", "status", "duration", "staff_id", "body"];
      for (const f of fields) {
        if (args[f] !== undefined) apptData[f] = args[f];
      }
      return await callDaftraApi("PUT", `work_order_appointments/${args.appointment_id}.json`, {
        WorkOrderAppointment: apptData
      });
    }
  },

  // ==========================================
  // 11. حذف موعد أمر عمل (Delete Appointment)
  // ==========================================
  {
    name: "daftra_delete_work_order_appointment",
    description: "حذف موعد أمر عمل نهائياً من دفترة.",
    inputSchema: {
      type: "object",
      properties: {
        appointment_id: { type: "number", description: "معرف الموعد المراد حذفه" },
        confirm: { type: "boolean", description: "تأكيد الحذف" }
      },
      required: ["appointment_id", "confirm"]
    },
    handler: async (args: any) => {
      if (!args.confirm) {
        throw new Error("حذف الموعد يتطلب تأكيداً بتمرير confirm=true.");
      }
      return await callDaftraApi("DELETE", `work_order_appointments/${args.appointment_id}.json`);
    }
  }
];
