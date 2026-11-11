// modules/hr.ts
// موديول الموارد البشرية وشؤون الموظفين: الموظفين، الحضور والانصراف، الإجازات، الأقسام، وعهد الموظفين
import { callDaftraApi } from "../daftra-client.ts";
import { McpTool } from "../types.ts";

export const hrTools: McpTool[] = [
  // ==========================================
  // 1. الموظفين - استعراض (List Staff)
  // ==========================================
  {
    name: "daftra_list_staff",
    description: "استعراض والبحث في قائمة الموظفين وفريق العمل المسجلين في دفترة ومناصبهم ومعلومات الاتصال.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة (الافتراضي: 1)" },
        limit: { type: "number", description: "عدد الموظفين لكل صفحة (الافتراضي: 20)" },
        role_id: { type: "number", description: "فلترة حسب الدور الوظيفي / الصلاحية" }
      }
    },
    handler: async (args) => {
      const queryParams: Record<string, string | number> = {
        page: args.page || 1,
        limit: args.limit || 20,
      };
      if (args.role_id) queryParams["filter[role_id]"] = args.role_id;
      return await callDaftraApi("GET", "staff.json", undefined, queryParams);
    }
  },

  // ==========================================
  // 2. الموظفين - تفاصيل موظف (Get Staff Details)
  // ==========================================
  {
    name: "daftra_get_staff",
    description: "جلب الملف الكامل لموظف محدد (البيانات الشخصية، الراتب/الأجر بالساعة، الفرع، الخزينة والمخزن الافتراضي).",
    inputSchema: {
      type: "object",
      properties: {
        staff_id: { type: "number", description: "معرّف الموظف في دفترة (ID)" }
      },
      required: ["staff_id"]
    },
    handler: async (args) => {
      return await callDaftraApi("GET", `staff/${args.staff_id}.json`);
    }
  },

  // ==========================================
  // 3. الموظفين - إضافة موظف جديد (Add Staff)
  // ==========================================
  {
    name: "daftra_create_staff",
    description: "إضافة موظف جديد في دفترة وتحديد البريد والدور الوظيفي والخزينة والمخزن التابع لهما (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم الموظف الكامل (إجباري)" },
        email_address: { type: "string", description: "البريد الإلكتروني لتسجيل الدخول (إجباري وفريد)" },
        role_id: { type: "number", description: "معرّف الدور الوظيفي / الصلاحية (إجباري)" },
        mobile: { type: "string", description: "رقم الجوال" },
        hourly_rate: { type: "number", description: "معدل الأجر بالساعة" },
        hourly_rate_currency_code: { type: "string", description: "رمز العملة للأجر (مثال: EGP, SAR)" },
        default_treasury_id: { type: "number", description: "الخزينة الافتراضية المرتبطة بالموظف" },
        default_store_id: { type: "number", description: "المخزن الافتراضي للموظف" },
        official_id: { type: "string", description: "الرقم القومي / رقم الهوية الوطنية" },
        confirm: { type: "boolean", description: "تأكيد إضافة الموظف" }
      },
      required: ["name", "email_address", "role_id", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) {
        throw new Error("إضافة موظف جديد تتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload = {
        Staff: {
          name: args.name,
          email_address: args.email_address,
          role_id: args.role_id,
          mobile: args.mobile,
          hourly_rate: args.hourly_rate,
          hourly_rate_currency_code: args.hourly_rate_currency_code,
          default_treasury_id: args.default_treasury_id,
          default_store_id: args.default_store_id,
          official_id: args.official_id,
          type: "user"
        }
      };
      return await callDaftraApi("POST", "staff.json", payload);
    }
  },

  // ==========================================
  // 4. الموظفين - إرسال بيانات الدخول (Send Login Details)
  // ==========================================
  {
    name: "daftra_send_staff_login_details",
    description: "إرسال بريد إلكتروني للموظف يحتوي على بيانات تسجيل الدخول الخاصة به على دفترة.",
    inputSchema: {
      type: "object",
      properties: {
        staff_id: { type: "number", description: "معرّف الموظف" },
        confirm: { type: "boolean", description: "تأكيد الإرسال" }
      },
      required: ["staff_id", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) {
        throw new Error("إرسال بيانات الدخول يتطلب تأكيداً بتمرير confirm=true.");
      }
      return await callDaftraApi("GET", `staff/send_login_details/${args.staff_id}.json`);
    }
  },

  // ==========================================
  // 5. الحضور والانصراف - استعراض السجلات (List Attendance)
  // ==========================================
  {
    name: "daftra_list_attendance_logs",
    description: "استعراض سجلات وبصمات حضور وانصراف الموظفين في دفترة مع إمكانية الفلترة بالموظف والتاريخ.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        staff_id: { type: "number", description: "فلترة حسب معرّف الموظف" }
      }
    },
    handler: async (args) => {
      return await callDaftraApi("GET", "attendance_log/list/1", undefined, {
        page: args.page || 1,
        "filter[staff_id]": args.staff_id
      });
    }
  },

  // ==========================================
  // 6. الحضور والانصراف - تسجيل بصمة (Add Attendance Log)
  // ==========================================
  {
    name: "daftra_record_attendance",
    description: "تسجيل حركة حضور أو انصراف لموظف بتاريخ ووقت محدد (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        staff_id: { type: "number", description: "معرّف الموظف (إجباري)" },
        time: { type: "string", description: "توقيت الحركة بصيغة YYYY-MM-DD HH:MM:SS (إجباري)" },
        status: { type: "string", description: "الحالة (present, draft, etc.)" },
        source_name: { type: "string", description: "مصدر البصمة (مثال: جهاز البصمة، تطبيق الهاتف، إدخال يدوي)" },
        confirm: { type: "boolean", description: "تأكيد تسجيل البصمة" }
      },
      required: ["staff_id", "time", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) {
        throw new Error("تسجيل حركة حضور/انصراف يتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload = {
        staff_id: args.staff_id,
        time: args.time,
        status: args.status || "present",
        source_name: args.source_name || "API Agent"
      };
      return await callDaftraApi("POST", "attendance_log", payload);
    }
  },

  // ==========================================
  // 7. الإجازات - استعراض الطلبات (List Leave Applications)
  // ==========================================
  {
    name: "daftra_list_leave_applications",
    description: "استعراض طلبات الإجازات والأذونات المقدمة من الموظفين وحالة كل طلب.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" },
        staff_id: { type: "number", description: "فلترة حسب الموظف" }
      }
    },
    handler: async (args) => {
      return await callDaftraApi("GET", "leave_application/list/1", undefined, {
        page: args.page || 1,
        "filter[staff_id]": args.staff_id
      });
    }
  },

  // ==========================================
  // 8. الإجازات - تقديم طلب إجازة (Submit Leave Application)
  // ==========================================
  {
    name: "daftra_submit_leave_application",
    description: "تقديم طلب إجازة اعتيادية أو عارضة أو إذن تأخير/انصراف مبكر لموظف في دفترة (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        staff_id: { type: "number", description: "معرّف الموظف طالب الإجازة" },
        date_from: { type: "string", description: "تاريخ بداية الإجازة YYYY-MM-DD" },
        date_to: { type: "string", description: "تاريخ نهاية الإجازة YYYY-MM-DD" },
        days: { type: "number", description: "عدد أيام الإجازة المطلوبة" },
        type: {
          type: "string",
          description: "نوع الطلب: leave (إجازة كاملة)، half_leave (نصف يوم)، delay (تأخير)، early (انصراف مبكر)"
        },
        leave_type_id: { type: "number", description: "معرّف نوع الإجازة في إعدادات دفترة (سنوية، مرضية...)" },
        late_time: { type: "number", description: "عدد دقائق التأخير (مطلوب إذا كان النوع delay)" },
        early_time: { type: "number", description: "عدد دقائق الانصراف المبكر (مطلوب إذا كان النوع early)" },
        description: { type: "string", description: "سبب الإجازة والملاحظات" },
        confirm: { type: "boolean", description: "تأكيد تقديم طلب الإجازة" }
      },
      required: ["staff_id", "date_from", "date_to", "days", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) {
        throw new Error("تقديم طلب الإجازة يتطلب تأكيداً بتمرير confirm=true.");
      }
      const payload: Record<string, unknown> = {
        staff_id: args.staff_id,
        date_from: args.date_from,
        date_to: args.date_to,
        days: args.days,
        type: args.type || "leave",
        description: args.description
      };
      if (args.leave_type_id) payload.leave_type_id = args.leave_type_id;
      if (args.late_time) payload.late_time = args.late_time;
      if (args.early_time) payload.early_time = args.early_time;

      return await callDaftraApi("POST", "leave_application", payload);
    }
  },

  // ==========================================
  // 9. الأقسام الإدارية - استعراض (List Departments)
  // ==========================================
  {
    name: "daftra_list_departments",
    description: "استعراض الأقسام الإدارية (Departments) في الشركة والفروع والمديرين المسؤولين.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "رقم الصفحة" }
      }
    },
    handler: async (args) => {
      return await callDaftraApi("GET", "department/list/1", undefined, { page: args.page || 1 });
    }
  },

  // ==========================================
  // 10. الأقسام الإدارية - إضافة قسم جديد (Add Department)
  // ==========================================
  {
    name: "daftra_create_department",
    description: "إضافة قسم إداري جديد في هيكل الشركة (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم القسم (مثال: المبيعات، تقنية المعلومات، الحسابات)" },
        branch_id: { type: "number", description: "معرّف الفرع التابع له القسم" },
        description: { type: "string", description: "وصف مهام القسم" },
        confirm: { type: "boolean", description: "تأكيد إضافة القسم" }
      },
      required: ["name", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) {
        throw new Error("إضافة قسم إداري تتطلب تأكيداً بتمرير confirm=true.");
      }
      return await callDaftraApi("POST", "department", {
        name: args.name,
        branch_id: args.branch_id,
        description: args.description,
        active: 1
      });
    }
  },

  // ==========================================
  // 11. عهد وأصول الموظفين - استعراض العهد (List Employee Assets)
  // ==========================================
  {
    name: "daftra_list_employee_assets",
    description: "استعراض الأصول والعهد المسلمة للموظفين (لابتوب، سيارة، هاتف، عهدة مالية أو عينية).",
    inputSchema: {
      type: "object",
      properties: {
        employee_id: { type: "number", description: "فلترة العهد الخاصة بموظف محدد" }
      }
    },
    handler: async (args) => {
      return await callDaftraApi("GET", "employee_asset/list/2", undefined, {
        "filter[employee_id]": args.employee_id
      });
    }
  },

  // ==========================================
  // 12. عهد وأصول الموظفين - تسليم عهدة لموظف (Assign Asset)
  // ==========================================
  {
    name: "daftra_assign_employee_asset",
    description: "تسجيل تسليم عهدة أو أصل لموظف مع السيريال وتاريخ التسليم وتاريخ الإرجاع المتوقع (يتطلب confirm=true).",
    inputSchema: {
      type: "object",
      properties: {
        employee_id: { type: "number", description: "معرّف الموظف المستلم للعهدة" },
        name: { type: "string", description: "اسم الأصل أو العهدة (مثال: كمبيوتر محمول Dell XPS)" },
        serial_number: { type: "string", description: "الرقم التسلسلي (Serial Number)" },
        code: { type: "string", description: "كود الأصل أو الباركود" },
        assigned_date: { type: "string", description: "تاريخ التسليم YYYY-MM-DD" },
        expected_return_date: { type: "string", description: "تاريخ الإرجاع المتوقع YYYY-MM-DD" },
        description: { type: "string", description: "حالة الأصل والملاحظات" },
        confirm: { type: "boolean", description: "تأكيد تسليم العهدة" }
      },
      required: ["employee_id", "name", "confirm"]
    },
    handler: async (args) => {
      if (!args.confirm) {
        throw new Error("تسجيل عهدة لموظف يتطلب تأكيداً بتمرير confirm=true.");
      }
      return await callDaftraApi("POST", "employee_asset", {
        name: args.name,
        used_by: "employee",
        employee_id: args.employee_id,
        serial_number: args.serial_number,
        code: args.code,
        assigned_date: args.assigned_date || new Date().toISOString().split("T")[0],
        expected_return_date: args.expected_return_date,
        description: args.description
      });
    }
  }
];
