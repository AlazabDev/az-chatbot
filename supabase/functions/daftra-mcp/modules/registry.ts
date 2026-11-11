import * as m0 from "./accounting/cost-centers.ts";
import * as m1 from "./accounting/journal-accounts.ts";
import * as m2 from "./accounting/journal-cats.ts";
import * as m3 from "./accounting/journals.ts";
import * as m4 from "./advanced-filtering/using-api-v2.ts";
import * as m5 from "./authorization/authorization.ts";
import * as m6 from "./bookings/booking-beta-version.ts";
import * as m7 from "./bookings/booking-classic-version.ts";
import * as m8 from "./branches/branches.ts";
import * as m9 from "./clients/client-appointments.ts";
import * as m10 from "./clients/client-attendance-log.ts";
import * as m11 from "./clients/client-payments.ts";
import * as m12 from "./clients/clients.ts";
import * as m13 from "./clients/follow-up-action.ts";
import * as m14 from "./clients/notes.ts";
import * as m15 from "./developers-portal/developers-portal-endpoints.ts";
import * as m16 from "./entities/entities.ts";
import * as m17 from "./finance/expenses.ts";
import * as m18 from "./finance/incomes.ts";
import * as m19 from "./finance/treasuries.ts";
import * as m20 from "./follow-up-statuses/follow-up-statuses.ts";
import * as m21 from "./general-listing/general-listing.ts";
import * as m22 from "./hr/attendance-logs.ts";
import * as m23 from "./hr/employee-asset/asset-location.ts";
import * as m24 from "./hr/employee-asset/asset-storage.ts";
import * as m25 from "./hr/employee-asset/asset-type.ts";
import * as m26 from "./hr/employee-asset/asset.ts";
import * as m27 from "./hr/leave-application.ts";
import * as m28 from "./hr/organizational-structure/department.ts";
import * as m29 from "./hr/organizational-structure/designation.ts";
import * as m30 from "./hr/organizational-structure/employment-type.ts";
import * as m31 from "./inventory/brands.ts";
import * as m32 from "./inventory/product-bundles.ts";
import * as m33 from "./inventory/product-categories.ts";
import * as m34 from "./inventory/products.ts";
import * as m35 from "./inventory/requisitions.ts";
import * as m36 from "./inventory/stock-transactions.ts";
import * as m37 from "./inventory/stores.ts";
import * as m38 from "./inventory/unit-templates.ts";
import * as m39 from "./multi-entity-request/multi-entity-request.ts";
import * as m40 from "./payment-gateways/payment-gateways.ts";
import * as m41 from "./points-credits/credit-charges.ts";
import * as m42 from "./points-credits/credit-types.ts";
import * as m43 from "./points-credits/credit-usage.ts";
import * as m44 from "./points-credits/packages-credit-types.ts";
import * as m45 from "./points-credits/packages.ts";
import * as m46 from "./purchases/purchase-debit-note.ts";
import * as m47 from "./purchases/purchase-invoices.ts";
import * as m48 from "./purchases/purchase-orders.ts";
import * as m49 from "./purchases/purchase-refunds.ts";
import * as m50 from "./sales/advance-payment-invoices.ts";
import * as m51 from "./sales/credit-notes.ts";
import * as m52 from "./sales/estimate-appointments.ts";
import * as m53 from "./sales/estimates.ts";
import * as m54 from "./sales/follow-up-status.ts";
import * as m55 from "./sales/invoice-appointments.ts";
import * as m56 from "./sales/invoice-payments.ts";
import * as m57 from "./sales/invoices.ts";
import * as m58 from "./sales/pos.ts";
import * as m59 from "./sales/refund-receipts.ts";
import * as m60 from "./sales/shipping-options.ts";
import * as m61 from "./sales/subscriptions.ts";
import * as m62 from "./site/site.ts";
import * as m63 from "./staff/staff.ts";
import * as m64 from "./suppliers/suppliers.ts";
import * as m65 from "./taxes/taxes.ts";
import * as m66 from "./time-tracking/time-tracking.ts";
import * as m67 from "./work-orders/work-order-appointments.ts";
import * as m68 from "./work-orders/work-orders.ts";
import * as m69 from "./workflow/workflow.ts";
import type { Operation, Dict, ToolResult } from "../types.ts";
const modules = [
 {file:"accounting/cost-centers.ts", operationIds:m0.operationIds, execute:m0.execute},
 {file:"accounting/journal-accounts.ts", operationIds:m1.operationIds, execute:m1.execute},
 {file:"accounting/journal-cats.ts", operationIds:m2.operationIds, execute:m2.execute},
 {file:"accounting/journals.ts", operationIds:m3.operationIds, execute:m3.execute},
 {file:"advanced-filtering/using-api-v2.ts", operationIds:m4.operationIds, execute:m4.execute},
 {file:"authorization/authorization.ts", operationIds:m5.operationIds, execute:m5.execute},
 {file:"bookings/booking-beta-version.ts", operationIds:m6.operationIds, execute:m6.execute},
 {file:"bookings/booking-classic-version.ts", operationIds:m7.operationIds, execute:m7.execute},
 {file:"branches/branches.ts", operationIds:m8.operationIds, execute:m8.execute},
 {file:"clients/client-appointments.ts", operationIds:m9.operationIds, execute:m9.execute},
 {file:"clients/client-attendance-log.ts", operationIds:m10.operationIds, execute:m10.execute},
 {file:"clients/client-payments.ts", operationIds:m11.operationIds, execute:m11.execute},
 {file:"clients/clients.ts", operationIds:m12.operationIds, execute:m12.execute},
 {file:"clients/follow-up-action.ts", operationIds:m13.operationIds, execute:m13.execute},
 {file:"clients/notes.ts", operationIds:m14.operationIds, execute:m14.execute},
 {file:"developers-portal/developers-portal-endpoints.ts", operationIds:m15.operationIds, execute:m15.execute},
 {file:"entities/entities.ts", operationIds:m16.operationIds, execute:m16.execute},
 {file:"finance/expenses.ts", operationIds:m17.operationIds, execute:m17.execute},
 {file:"finance/incomes.ts", operationIds:m18.operationIds, execute:m18.execute},
 {file:"finance/treasuries.ts", operationIds:m19.operationIds, execute:m19.execute},
 {file:"follow-up-statuses/follow-up-statuses.ts", operationIds:m20.operationIds, execute:m20.execute},
 {file:"general-listing/general-listing.ts", operationIds:m21.operationIds, execute:m21.execute},
 {file:"hr/attendance-logs.ts", operationIds:m22.operationIds, execute:m22.execute},
 {file:"hr/employee-asset/asset-location.ts", operationIds:m23.operationIds, execute:m23.execute},
 {file:"hr/employee-asset/asset-storage.ts", operationIds:m24.operationIds, execute:m24.execute},
 {file:"hr/employee-asset/asset-type.ts", operationIds:m25.operationIds, execute:m25.execute},
 {file:"hr/employee-asset/asset.ts", operationIds:m26.operationIds, execute:m26.execute},
 {file:"hr/leave-application.ts", operationIds:m27.operationIds, execute:m27.execute},
 {file:"hr/organizational-structure/department.ts", operationIds:m28.operationIds, execute:m28.execute},
 {file:"hr/organizational-structure/designation.ts", operationIds:m29.operationIds, execute:m29.execute},
 {file:"hr/organizational-structure/employment-type.ts", operationIds:m30.operationIds, execute:m30.execute},
 {file:"inventory/brands.ts", operationIds:m31.operationIds, execute:m31.execute},
 {file:"inventory/product-bundles.ts", operationIds:m32.operationIds, execute:m32.execute},
 {file:"inventory/product-categories.ts", operationIds:m33.operationIds, execute:m33.execute},
 {file:"inventory/products.ts", operationIds:m34.operationIds, execute:m34.execute},
 {file:"inventory/requisitions.ts", operationIds:m35.operationIds, execute:m35.execute},
 {file:"inventory/stock-transactions.ts", operationIds:m36.operationIds, execute:m36.execute},
 {file:"inventory/stores.ts", operationIds:m37.operationIds, execute:m37.execute},
 {file:"inventory/unit-templates.ts", operationIds:m38.operationIds, execute:m38.execute},
 {file:"multi-entity-request/multi-entity-request.ts", operationIds:m39.operationIds, execute:m39.execute},
 {file:"payment-gateways/payment-gateways.ts", operationIds:m40.operationIds, execute:m40.execute},
 {file:"points-credits/credit-charges.ts", operationIds:m41.operationIds, execute:m41.execute},
 {file:"points-credits/credit-types.ts", operationIds:m42.operationIds, execute:m42.execute},
 {file:"points-credits/credit-usage.ts", operationIds:m43.operationIds, execute:m43.execute},
 {file:"points-credits/packages-credit-types.ts", operationIds:m44.operationIds, execute:m44.execute},
 {file:"points-credits/packages.ts", operationIds:m45.operationIds, execute:m45.execute},
 {file:"purchases/purchase-debit-note.ts", operationIds:m46.operationIds, execute:m46.execute},
 {file:"purchases/purchase-invoices.ts", operationIds:m47.operationIds, execute:m47.execute},
 {file:"purchases/purchase-orders.ts", operationIds:m48.operationIds, execute:m48.execute},
 {file:"purchases/purchase-refunds.ts", operationIds:m49.operationIds, execute:m49.execute},
 {file:"sales/advance-payment-invoices.ts", operationIds:m50.operationIds, execute:m50.execute},
 {file:"sales/credit-notes.ts", operationIds:m51.operationIds, execute:m51.execute},
 {file:"sales/estimate-appointments.ts", operationIds:m52.operationIds, execute:m52.execute},
 {file:"sales/estimates.ts", operationIds:m53.operationIds, execute:m53.execute},
 {file:"sales/follow-up-status.ts", operationIds:m54.operationIds, execute:m54.execute},
 {file:"sales/invoice-appointments.ts", operationIds:m55.operationIds, execute:m55.execute},
 {file:"sales/invoice-payments.ts", operationIds:m56.operationIds, execute:m56.execute},
 {file:"sales/invoices.ts", operationIds:m57.operationIds, execute:m57.execute},
 {file:"sales/pos.ts", operationIds:m58.operationIds, execute:m58.execute},
 {file:"sales/refund-receipts.ts", operationIds:m59.operationIds, execute:m59.execute},
 {file:"sales/shipping-options.ts", operationIds:m60.operationIds, execute:m60.execute},
 {file:"sales/subscriptions.ts", operationIds:m61.operationIds, execute:m61.execute},
 {file:"site/site.ts", operationIds:m62.operationIds, execute:m62.execute},
 {file:"staff/staff.ts", operationIds:m63.operationIds, execute:m63.execute},
 {file:"suppliers/suppliers.ts", operationIds:m64.operationIds, execute:m64.execute},
 {file:"taxes/taxes.ts", operationIds:m65.operationIds, execute:m65.execute},
 {file:"time-tracking/time-tracking.ts", operationIds:m66.operationIds, execute:m66.execute},
 {file:"work-orders/work-order-appointments.ts", operationIds:m67.operationIds, execute:m67.execute},
 {file:"work-orders/work-orders.ts", operationIds:m68.operationIds, execute:m68.execute},
 {file:"workflow/workflow.ts", operationIds:m69.operationIds, execute:m69.execute},
];
const actions = new Map<string,(op:Operation,args:Dict)=>Promise<ToolResult>>();
for (const mod of modules) for(const id of mod.operationIds){if(actions.has(id))throw new Error("Duplicate module operation: "+id);actions.set(id,mod.execute)}
export function validateRegistry(ops:Operation[]){const catalog=new Set(ops.map(o=>o.id));for(const id of actions.keys())if(!catalog.has(id))throw new Error("Unknown module operation: "+id);for(const op of ops)if(!actions.has(op.id))throw new Error("Missing module operation: "+op.id);return {modules:modules.length,operations:actions.size}}
export function executeRegistered(op:Operation,args:Dict){const fn=actions.get(op.id);if(!fn)throw new Error("Unregistered operation: "+op.id);return fn(op,args)}
