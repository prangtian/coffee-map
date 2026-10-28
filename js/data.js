// ชั้นข้อมูล: ใช้ Supabase เมื่อตั้งค่าใน config.js แล้ว ไม่งั้นใช้โหมดสาธิต (เก็บในเบราว์เซอร์)
(function () {
  const cfg = window.APP_CONFIG;
  const LIVE = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const BUCKET = 'media';

  const PLOT_FIELDS = ['id', 'code', 'name', 'owner_name', 'owner_id', 'village', 'subdistrict', 'district', 'province',
    'variety', 'planted_year', 'tree_count', 'elevation_m', 'shade_trees', 'yield_kg', 'description', 'boundary',
    'center_lon', 'center_lat', 'ortho_url', 'ortho_type', 'ortho_bounds', 'ortho_date', 'is_published', 'updated_at'];
  const MEDIA_FIELDS = ['id', 'plot_id', 'type', 'title', 'description', 'taken_at', 'lon', 'lat', 'alt_m', 'heading',
    'file_path', 'thumb_path', 'lite_path', 'youtube_id', 'link_url', 'created_at', 'updated_at'];

  function pick(o, fields) {
    const r = {};
    fields.forEach(f => { if (o[f] !== undefined) r[f] = o[f] === '' ? null : o[f]; });
    return r;
  }
  function uuid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  }

  // ---------------- Supabase ----------------
  function liveStore() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    let profile = null;
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

    return {
      mode: 'live',
      async listPlots() {
        return ok(await sb.from('plots').select(PLOT_FIELDS.join(',') + ',area_sqm').order('name'));
      },
      async listMedia() {
        return ok(await sb.from('media').select(MEDIA_FIELDS.join(',')).order('taken_at', { ascending: true, nullsFirst: false }));
      },
      async savePlot(p) {
        const row = pick(p, PLOT_FIELDS); delete row.updated_at;
        if (!row.id) delete row.id;
        if (!row.owner_id && profile && profile.role !== 'admin') row.owner_id = profile.id;
        return ok(await sb.from('plots').upsert(row).select().single());
      },
      async deletePlot(id) { ok(await sb.from('plots').delete().eq('id', id)); },
      async saveMedia(m) {
        const row = pick(m, MEDIA_FIELDS); delete row.updated_at; delete row.created_at;
        if (!row.id) delete row.id;
        return ok(await sb.from('media').upsert(row).select().single());
      },
      async deleteMedia(m) {
        const paths = [m.file_path, m.thumb_path, m.lite_path].filter(Boolean);
        if (paths.length) await sb.storage.from(BUCKET).remove(paths);
        ok(await sb.from('media').delete().eq('id', m.id));
      },
      async upload(blob, path) {
        ok(await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || undefined, cacheControl: '31536000' }));
        return path;
      },
      url(path) {
        if (!path) return null;
        if (/^(https?:|blob:|data:)/.test(path) || path.startsWith('demo/')) return path;
        return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      },
      async session() {
        const { data } = await sb.auth.getSession();
        const user = data.session && data.session.user;
        if (!user) { profile = null; return null; }
        const { data: prof } = await sb.from('profiles').select('id,display_name,role').eq('id', user.id).maybeSingle();
        profile = prof ? prof : { id: user.id, display_name: user.email, role: null };
        profile.email = user.email;
        return profile;
      },
      async signIn(email, password) {
        ok(await sb.auth.signInWithPassword({ email, password }));
        return this.session();
      },
      async signOut() { await sb.auth.signOut(); profile = null; },
      newId: uuid
    };
  }

  // ---------------- โหมดสาธิต ----------------
  function demoStore() {
    const KEY = 'coffee-map-demo-v1';
    let db;
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
    if (!db) db = JSON.parse(JSON.stringify(window.DEMO_DATA));
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage เต็มหรือถูกบล็อก */ } };
    const blobs = {};
    let signedIn = false;

    return {
      mode: 'demo',
      async listPlots() { return JSON.parse(JSON.stringify(db.plots)); },
      async listMedia() { return JSON.parse(JSON.stringify(db.media)); },
      async savePlot(p) {
        const row = pick(p, PLOT_FIELDS);
        if (!row.id) row.id = uuid();
        row.updated_at = new Date().toISOString();
        const i = db.plots.findIndex(x => x.id === row.id);
        if (i >= 0) db.plots[i] = Object.assign(db.plots[i], row); else db.plots.push(row);
        save(); return JSON.parse(JSON.stringify(i >= 0 ? db.plots[i] : row));
      },
      async deletePlot(id) {
        db.plots = db.plots.filter(p => p.id !== id);
        db.media = db.media.filter(m => m.plot_id !== id); save();
      },
      async saveMedia(m) {
        const row = pick(m, MEDIA_FIELDS);
        if (!row.id) { row.id = uuid(); row.created_at = new Date().toISOString(); }
        const i = db.media.findIndex(x => x.id === row.id);
        if (i >= 0) db.media[i] = Object.assign(db.media[i], row); else db.media.push(row);
        save(); return JSON.parse(JSON.stringify(i >= 0 ? db.media[i] : row));
      },
      async deleteMedia(m) { db.media = db.media.filter(x => x.id !== m.id); save(); },
      async upload(blob, path) { blobs[path] = URL.createObjectURL(blob); return path; },
      url(path) {
        if (!path) return null;
        if (blobs[path]) return blobs[path];
        return path; // demo/... หรือ URL เต็ม
      },
      async session() { return signedIn ? { id: 'demo', display_name: 'โหมดสาธิต', role: 'admin', email: 'demo' } : null; },
      async signIn() { signedIn = true; return this.session(); },
      async signOut() { signedIn = false; },
      reset() { try { localStorage.removeItem(KEY); } catch (e) {} },
      newId: uuid
    };
  }

  window.Store = LIVE ? liveStore() : demoStore();
})();
