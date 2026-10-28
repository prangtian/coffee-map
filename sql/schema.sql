-- =====================================================================
-- แผนที่แปลงกาแฟ : โครงสร้างฐานข้อมูล Supabase (PostgreSQL + PostGIS)
-- วิธีใช้: Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run
-- รันซ้ำได้ (ใช้ IF NOT EXISTS / OR REPLACE)
-- =====================================================================

create extension if not exists postgis;

-- ---------- ผู้ใช้ที่แก้ไขข้อมูลได้ ----------
-- role: admin = แก้ได้ทุกแปลง, owner = แก้ได้เฉพาะแปลงของตัวเอง
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role         text not null default 'owner' check (role in ('admin','owner')),
  created_at   timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- ---------- แปลงกาแฟ ----------
create table if not exists public.plots (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,                 -- รหัสแปลง เช่น CF-001
  name          text not null,
  owner_name    text,                        -- ชื่อเกษตรกรที่แสดงต่อสาธารณะ
  owner_id      uuid references auth.users(id) on delete set null, -- บัญชีที่แก้ไขแปลงนี้ได้
  village       text,
  subdistrict   text,
  district      text,
  province      text,
  variety       text,                        -- พันธุ์ เช่น อาราบิก้า คาติมอร์
  planted_year  int,                         -- ปี พ.ศ. ที่ปลูก
  tree_count    int,
  elevation_m   numeric,
  shade_trees   text,                        -- ไม้ร่มเงา
  yield_kg      numeric,                     -- ผลผลิตเชอร์รี่ (กก./ปี)
  description   text,
  boundary      jsonb,                       -- GeoJSON geometry (Polygon/MultiPolygon) จากหน้าเว็บ
  center_lon    double precision,
  center_lat    double precision,
  ortho_url     text,                        -- XYZ tiles {z}/{x}/{y} หรือไฟล์ภาพเดี่ยว
  ortho_type    text check (ortho_type in ('xyz','image')),
  ortho_bounds  jsonb,                       -- [west,south,east,north] สำหรับ ortho_type = image
  ortho_date    date,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- คอลัมน์ geometry สำหรับเปิดใน QGIS / ArcGIS Pro และคำนวณพื้นที่
alter table public.plots
  add column if not exists geom geometry(Geometry, 4326)
  generated always as (
    case when boundary is null then null
         else ST_SetSRID(ST_GeomFromGeoJSON(boundary::text), 4326) end
  ) stored;
alter table public.plots
  add column if not exists area_sqm numeric
  generated always as (
    case when boundary is null then null
         else ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(boundary::text), 4326)::geography) end
  ) stored;
create index if not exists plots_geom_idx on public.plots using gist (geom);

-- ---------- สื่อและหมุด ----------
create table if not exists public.media (
  id           uuid primary key default gen_random_uuid(),
  plot_id      uuid references public.plots(id) on delete cascade,
  type         text not null check (type in ('pano','photo','aerial','video','info')),
  title        text not null,
  description  text,
  taken_at     timestamptz,
  lon          double precision not null,
  lat          double precision not null,
  alt_m        double precision,
  heading      double precision,             -- ทิศที่หันกล้อง (องศาจากทิศเหนือ)
  file_path    text,                         -- path ใน Storage bucket "media"
  thumb_path   text,
  lite_path    text,                         -- ภาพพาโนรามาขนาดเล็กสำหรับมือถือ (กว้าง 4096)
  youtube_id   text,
  link_url     text,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.media
  add column if not exists geom geometry(Point, 4326)
  generated always as (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) stored;
create index if not exists media_geom_idx on public.media using gist (geom);
create index if not exists media_plot_idx on public.media (plot_id);

-- updated_at อัตโนมัติ
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists plots_touch on public.plots;
create trigger plots_touch before update on public.plots for each row execute function public.touch_updated_at();
drop trigger if exists media_touch on public.media;
create trigger media_touch before update on public.media for each row execute function public.touch_updated_at();

-- ---------- สิทธิ์ (Row Level Security) ----------
alter table public.profiles enable row level security;
alter table public.plots    enable row level security;
alter table public.media    enable row level security;

create or replace function public.can_edit_plot(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.plots where id = p and owner_id = auth.uid());
$$;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write" on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- ทุกคนดูแปลงที่เผยแพร่ได้ ผู้แก้ไขเห็นแปลงของตัวเองแม้ยังไม่เผยแพร่
drop policy if exists "plots public read" on public.plots;
create policy "plots public read" on public.plots for select
  using (is_published or public.is_admin() or owner_id = auth.uid());
drop policy if exists "plots insert" on public.plots;
create policy "plots insert" on public.plots for insert
  with check (public.is_admin() or (public.is_editor() and owner_id = auth.uid()));
drop policy if exists "plots update" on public.plots;
create policy "plots update" on public.plots for update
  using (public.is_admin() or owner_id = auth.uid())
  with check (public.is_admin() or owner_id = auth.uid());
drop policy if exists "plots delete" on public.plots;
create policy "plots delete" on public.plots for delete
  using (public.is_admin() or owner_id = auth.uid());

drop policy if exists "media public read" on public.media;
create policy "media public read" on public.media for select
  using (plot_id is null
         or exists (select 1 from public.plots p where p.id = plot_id
                    and (p.is_published or public.is_admin() or p.owner_id = auth.uid())));
drop policy if exists "media insert" on public.media;
create policy "media insert" on public.media for insert
  with check (public.is_admin() or (plot_id is not null and public.can_edit_plot(plot_id)));
drop policy if exists "media update" on public.media;
create policy "media update" on public.media for update
  using (public.is_admin() or (plot_id is not null and public.can_edit_plot(plot_id)))
  with check (public.is_admin() or (plot_id is not null and public.can_edit_plot(plot_id)));
drop policy if exists "media delete" on public.media;
create policy "media delete" on public.media for delete
  using (public.is_admin() or (plot_id is not null and public.can_edit_plot(plot_id)));

-- ---------- Storage: bucket "media" อ่านได้สาธารณะ เขียนได้เฉพาะผู้แก้ไข ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists "media bucket read" on storage.objects;
create policy "media bucket read" on storage.objects for select
  using (bucket_id = 'media');
drop policy if exists "media bucket insert" on storage.objects;
create policy "media bucket insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_editor());
drop policy if exists "media bucket modify" on storage.objects;
create policy "media bucket modify" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (owner = auth.uid() or public.is_admin()));
drop policy if exists "media bucket delete" on storage.objects;
create policy "media bucket delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (owner = auth.uid() or public.is_admin()));

-- =====================================================================
-- หลังรันไฟล์นี้:
-- 1) Authentication > Users > Add user (ใส่อีเมล + รหัสผ่าน) ให้ตัวเอง
-- 2) รันคำสั่งนี้เพื่อตั้งตัวเองเป็น admin (เปลี่ยนอีเมล):
--    insert into public.profiles (id, display_name, role)
--    select id, 'ผู้ดูแลระบบ', 'admin' from auth.users where email = 'you@example.com'
--    on conflict (id) do update set role = 'admin';
-- 3) เจ้าของแปลงคนอื่น: สร้าง user แล้ว insert profiles role = 'owner'
--    และตั้ง plots.owner_id ให้ตรงกับบัญชีนั้น
-- =====================================================================
