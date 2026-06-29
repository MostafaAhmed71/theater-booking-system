/**
 * مسح كل حجوزات threa_guest_assignments (تجارب قبل فتح الحجز الرسمي).
 *
 * معاينة:  node scripts/clear-all-bookings.mjs
 * تنفيذ:    node scripts/clear-all-bookings.mjs --yes
 */
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey, TABLES } from "../supabase-config.js";

const TABLE = TABLES.GUEST_ASSIGNMENTS;
const confirmed = process.argv.includes("--yes");

const client = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

const { count, error: countErr } = await client
  .from(TABLE)
  .select("id", { count: "exact", head: true });

if (countErr) {
  console.error("تعذّر الاتصال بـ Supabase:", countErr.message);
  process.exit(1);
}

console.log(`عدد الحجوزات الحالية: ${count ?? 0}`);

if (!count) {
  console.log("لا شيء للمسح — القاعدة نظيفة.");
  process.exit(0);
}

if (!confirmed) {
  console.log("\nللتأكيد والمسح نفّذ:");
  console.log("  node scripts/clear-all-bookings.mjs --yes\n");
  process.exit(0);
}

const { error: delErr } = await client.from(TABLE).delete().neq("id", "");

if (delErr) {
  console.error("فشل المسح:", delErr.message);
  process.exit(1);
}

const { count: after } = await client
  .from(TABLE)
  .select("id", { count: "exact", head: true });

console.log(`تم المسح. المتبقي: ${after ?? 0}`);
