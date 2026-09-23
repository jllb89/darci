import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });

export async function refreshMemberAllowanceWindow(billingAccountId: string) {
  const { error } = await db.rpc("refresh_member_billing_window", { p_billing_account_id: billingAccountId });
  if (error) throw new Error(`Monthly membership allowance refresh failed: ${error.message}`);
}

export async function refreshDueMemberAllowanceWindows() {
  const { error } = await db.rpc("refresh_due_member_billing_windows", { p_limit: 100 });
  if (error) throw new Error(`Monthly membership allowance sweep failed: ${error.message}`);
}
