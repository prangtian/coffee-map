// ===================================================================
// ตั้งค่าเว็บไซต์ — แก้ไฟล์นี้ไฟล์เดียวหลังสร้างโปรเจกต์ Supabase
// ถ้าเว้น SUPABASE_URL ว่างไว้ เว็บจะทำงานใน "โหมดสาธิต"
// (ข้อมูลตัวอย่าง แก้ไขได้แต่เก็บไว้ในเบราว์เซอร์เครื่องนั้นเท่านั้น)
// ===================================================================
window.APP_CONFIG = {
  // Supabase Dashboard > Project Settings > API
  SUPABASE_URL: 'https://pyvtdqjxidolvkcombpw.supabase.co',        // เช่น 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: 'sb_publishable_BbtL_i24fJGbvEVG_7xd8Q_PTAUMf7f',   // คีย์ "anon public" (เปิดเผยได้ ปลอดภัยเพราะมี RLS คุม)

  SITE_TITLE: 'แผนที่แปลงกาแฟ',
  SITE_SUBTITLE: 'พาโนรามา ภาพถ่าย และข้อมูลแปลงกาแฟ',

  // มุมมองเริ่มต้น [ลองจิจูด, ละติจูด]
  START_CENTER: [98.95, 19.30],
  START_ZOOM: 12,

  // ซูมระดับไหนขึ้นไปจึงแสดงหมุดสื่อทีละจุด (ต่ำกว่านี้แสดงเฉพาะหมุดแปลง)
  MEDIA_MIN_ZOOM: 14
};
