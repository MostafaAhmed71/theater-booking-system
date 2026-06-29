/**
 * إعداد Supabase — المفتاح anon عام ومقيَّد بـ RLS في لوحة Supabase.
 */
export const supabaseUrl = "https://mookpmxugpgpofocuddk.supabase.co";
export const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vb2twbXh1Z3BncG9mb2N1ZGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjY4MjEsImV4cCI6MjA5NTkwMjgyMX0.QvWP5fC3PogrIA5nTonN6C5PwcuwPmMroxdzakYGO9w";

export const TABLES = {
  GUEST_ASSIGNMENTS: "threa_guest_assignments",
  EVENT_CONFIG: "threa_event_config",
  STUDENT_ROSTER: "threa_student_roster",
  SEAT_PINS: "threa_seat_pins",
  GUEST_REQUESTS: "threa_guest_requests",
};

export const ROSTER_DOC_ID = "default";
export const EVENT_CONFIG_DOC_ID = "default";
