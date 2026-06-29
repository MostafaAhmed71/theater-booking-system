/**
 * تهيئة Supabase — يُحمَّل قبل guest-assignments و panorama-storage.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import {
  supabaseUrl,
  supabaseAnonKey,
  TABLES,
  ROSTER_DOC_ID,
  EVENT_CONFIG_DOC_ID,
} from "./supabase-config.js";

const client = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ready = Promise.resolve({ client });

globalThis.ThreaSupabase = {
  client,
  TABLES,
  ready,
};

/** توافق مع الاسم القديم — db = عميل Supabase */
globalThis.ThreaFirebase = {
  ready,
  get db() {
    return client;
  },
  get client() {
    return client;
  },
  PINS_COLLECTION: TABLES.SEAT_PINS,
  GUESTS_COLLECTION: TABLES.GUEST_ASSIGNMENTS,
  ROSTER_COLLECTION: TABLES.STUDENT_ROSTER,
  ROSTER_DOC_ID,
  EVENT_CONFIG_TABLE: TABLES.EVENT_CONFIG,
  EVENT_CONFIG_DOC_ID,
};
