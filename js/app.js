(function () {
  'use strict';
  const cfg = window.APP_CONFIG;
  const S = window.Store;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- ชนิดข้อมูล ----------------
  const ICON = {
    pano: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><path d="M12 3c2.6 2.4 2.6 15.6 0 18"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    aerial: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5.5" cy="5.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/><path d="M7.5 7.5l2.5 2.5M16.5 7.5L14 10M7.5 16.5l2.5-2.5M16.5 16.5L14 14"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5l11 6.5-11 6.5z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.2v.6"/></svg>',
    bean: '<svg width="14" height="14" viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="6" ry="9" transform="rotate(30 12 12)" fill="#2a1a10"/><path d="M9.6 6.5c2.8 2.2 2.1 8.2 4.9 10.8" fill="none" stroke="#ffcf5c" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };
  const TYPES = [
    { key: 'pano', label: 'พาโนรามา 360°' },
    { key: 'photo', label: 'ภาพถ่าย' },
    { key: 'aerial', label: 'ภาพถ่ายทางอากาศ' },
    { key: 'video', label: 'วีดีโอ' },
    { key: 'info', label: 'ข้อมูลอื่นๆ' }
  ];
  const typeLabel = k => (TYPES.find(t => t.key === k) || {}).label || k;

  // ---------------- สถานะ ----------------
  const st = {
    plots: [], media: [], user: null,
    is3d: false, sat: false, showOrtho: true,
    hidden: new Set(),
    plotMarkers: new Map(), mediaMarkers: new Map(),
    view: null, history: [],
    pano: null,
    mode: null, draw: null, pick: null,
    markerClickAt: 0
  };

  // ---------------- ยูทิลิตี ----------------
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }
  function ringArea(ring) {
    const R = 6378137, rad = d => d * Math.PI / 180; let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const p1 = ring[i], p2 = ring[(i + 1) % ring.length], p3 = ring[(i + 2) % ring.length];
      a += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
    }
    return Math.abs(a * R * R / 2);
  }
  function geomArea(g) {
    if (!g) return null;
    const poly = c => c.length ? ringArea(c[0]) - c.slice(1).reduce((s, r) => s + ringArea(r), 0) : 0;
    if (g.type === 'Polygon') return poly(g.coordinates);
    if (g.type === 'MultiPolygon') return g.coordinates.reduce((s, c) => s + poly(c), 0);
    return null;
  }
  function thaiArea(m2) {
    if (m2 == null) return null;
    const rai = Math.floor(m2 / 1600), ngan = Math.floor((m2 % 1600) / 400), wa = (m2 % 400) / 4;
    const parts = [];
    if (rai) parts.push(rai.toLocaleString('th-TH') + ' ไร่');
    if (ngan) parts.push(ngan + ' งาน');
    parts.push(wa.toFixed(1) + ' ตร.วา');
    return parts.join(' ');
  }
  function rings(g) {
    if (!g) return [];
    if (g.type === 'Polygon') return [g.coordinates];
    if (g.type === 'MultiPolygon') return g.coordinates;
    return [];
  }
  function inRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function inGeom(pt, g) {
    return rings(g).some(poly => inRing(pt, poly[0]) && !poly.slice(1).some(h => inRing(pt, h)));
  }
  function centroid(g) {
    const r = rings(g)[0]; if (!r) return null;
    const pts = r[0].slice(0, -1); let x = 0, y = 0;
    pts.forEach(p => { x += p[0]; y += p[1]; });
    return [x / pts.length, y / pts.length];
  }
  function bboxOf(coords) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    coords.forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); });
    return b;
  }
  function plotCoords(p) {
    const c = [];
    rings(p.boundary).forEach(poly => poly.forEach(r => r.forEach(pt => c.push(pt))));
    if (!c.length && p.center_lon != null) c.push([p.center_lon, p.center_lat]);
    st.media.filter(m => m.plot_id === p.id).forEach(m => c.push([m.lon, m.lat]));
    return c;
  }
  function plotCenter(p) {
    if (p.center_lon != null && p.center_lat != null) return [p.center_lon, p.center_lat];
    const c = centroid(p.boundary); if (c) return c;
    const m = st.media.find(x => x.plot_id === p.id); return m ? [m.lon, m.lat] : null;
  }
  const fmtDate = d => d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
  const fmtNum = (n, u) => n == null || n === '' ? null : Number(n).toLocaleString('th-TH') + (u ? ' ' + u : '');
  function ytId(s) {
    if (!s) return null; s = s.trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  const canEdit = p => !!(st.user && st.user.role && (st.user.role === 'admin' || (p && p.owner_id === st.user.id)));
  const canEditMedia = m => {
    if (!st.user || !st.user.role) return false;
    if (st.user.role === 'admin') return true;
    const p = st.plots.find(x => x.id === m.plot_id); return !!(p && p.owner_id === st.user.id);
  };
  // ไลบรารีที่ใช้เฉพาะตอนแก้ไข โหลดเมื่อต้องใช้ ผู้ชมทั่วไปจึงไม่ต้องดาวน์โหลด
  const LIBS = { exifr: 'vendor/exifr.umd.js', toGeoJSON: 'vendor/togeojson.umd.js', shp: 'vendor/shp.min.js' };
  function need(name) {
    if (window[name]) return Promise.resolve();
    return new Promise((res, rej) => {
      const sc = document.createElement('script'); sc.src = LIBS[name];
      sc.onload = res; sc.onerror = () => rej(new Error('โหลด ' + LIBS[name] + ' ไม่สำเร็จ'));
      document.head.appendChild(sc);
    });
  }
  function maxTexture() {
    if (maxTexture.v) return maxTexture.v;
    try { const gl = document.createElement('canvas').getContext('webgl'); maxTexture.v = gl.getParameter(gl.MAX_TEXTURE_SIZE); }
    catch (e) { maxTexture.v = 4096; }
    return maxTexture.v;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('คัดลอกแล้ว'); }
    catch (e) { window.prompt('คัดลอกข้อความนี้', text); }
  }

  // ---------------- แผนที่ ----------------
  $('#siteTitle').textContent = cfg.SITE_TITLE;
  $('#siteSub').textContent = cfg.SITE_SUBTITLE;
  document.title = cfg.SITE_TITLE;
  if (S.mode === 'demo') $('#demoFlag').hidden = false;

  const map = new maplibregl.Map({
    container: 'map', style: window.buildMapStyle(), center: cfg.START_CENTER, zoom: cfg.START_ZOOM,
    maxPitch: 78, attributionControl: false
  });
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>'
  }), 'bottom-right');
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  map.once('style.load', async () => {
    map.addSource('plots', { type: 'geojson', data: fc([]) });
    map.addSource('draw', { type: 'geojson', data: fc([]) });
    map.addLayer({ id: 'plots-fill', type: 'fill', source: 'plots',
      paint: { 'fill-color': '#ffcf5c', 'fill-opacity': 0 } }); // ไม่เติมสี แต่ยังคลิกในแปลงได้
    map.addLayer({ id: 'plots-casing', type: 'line', source: 'plots',
      paint: { 'line-color': 'rgba(20,12,4,0.55)', 'line-width': ['case', ['boolean', ['get', 'sel'], false], 7, 5] } });
    map.addLayer({ id: 'plots-line', type: 'line', source: 'plots',
      paint: { 'line-color': '#ffcf5c', 'line-width': ['case', ['boolean', ['get', 'sel'], false], 3.5, 2.2] } });
    map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'draw-line', type: 'line', source: 'draw', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
      paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [2, 1] } });
    map.addLayer({ id: 'draw-vertex', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 7, 'circle-color': '#ffcf5c', 'circle-stroke-color': '#2a1a10', 'circle-stroke-width': 2 } });

    map.on('click', 'plots-fill', e => {
      if (st.mode || Date.now() - st.markerClickAt < 400) return;
      const id = e.features[0].properties.id; openPlot(id, { fly: false });
    });
    map.on('mouseenter', 'plots-fill', () => { if (!st.mode) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'plots-fill', () => { if (!st.mode) map.getCanvas().style.cursor = ''; });
    map.on('zoomend', updateMarkerVisibility);
    setupDrawEvents();

    await reload();
    st.user = await S.session().catch(() => null);
    renderAuth();
    routeFromUrl();
  });
  map.on('error', e => { if (e && e.error) console.warn('map:', e.error.message || e.error); });

  function fc(features) { return { type: 'FeatureCollection', features }; }

  async function reload() {
    try {
      const [plots, media] = await Promise.all([S.listPlots(), S.listMedia()]);
      st.plots = plots; st.media = media;
    } catch (e) { toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 6000); }
    renderData();
  }

  function renderData() {
    const selId = st.view && (st.view.kind === 'plot' ? st.view.id : (st.media.find(m => m.id === st.view.id) || {}).plot_id);
    map.getSource('plots').setData(fc(st.plots.filter(p => p.boundary).map(p => ({
      type: 'Feature', geometry: p.boundary, properties: { id: p.id, sel: p.id === selId }
    }))));

    // หมุดแปลง
    st.plotMarkers.forEach(m => m.remove()); st.plotMarkers.clear();
    st.plots.forEach(p => {
      const c = plotCenter(p); if (!c) return;
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'plot-tag' + (p.id === selId ? ' is-selected' : '');
      el.innerHTML = '<span class="bean">' + ICON.bean + '</span><span>' + esc(p.name) + '</span>';
      el.setAttribute('aria-label', 'แปลง ' + p.name);
      el.addEventListener('click', ev => { ev.stopPropagation(); st.markerClickAt = Date.now(); if (!st.mode) openPlot(p.id); });
      const mk = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -4] }).setLngLat(c).addTo(map);
      el.setAttribute('aria-label', 'แปลง ' + p.name);
      st.plotMarkers.set(p.id, mk);
    });

    // หมุดสื่อ
    st.mediaMarkers.forEach(m => m.remove()); st.mediaMarkers.clear();
    const selMedia = st.view && st.view.kind === 'media' ? st.view.id : null;
    st.media.forEach(m => {
      if (m.lon == null || m.lat == null) return;
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'pin t-' + m.type + (m.id === selMedia ? ' is-selected' : '');
      el.innerHTML = ICON[m.type] || ICON.info;
      el.title = typeLabel(m.type) + ': ' + m.title; el.setAttribute('aria-label', el.title);
      el.addEventListener('click', ev => { ev.stopPropagation(); st.markerClickAt = Date.now(); if (!st.mode) openMedia(m.id, { fly: false }); });
      const draggable = !!(st.user && canEditMedia(m));
      if (draggable) el.classList.add('is-draggable');
      const mk = new maplibregl.Marker({ element: el, draggable }).setLngLat([m.lon, m.lat]).addTo(map);
      el.setAttribute('aria-label', el.title);
      if (draggable) {
        mk.on('dragend', async () => {
          st.markerClickAt = Date.now();
          const ll = mk.getLngLat(); const prev = [m.lon, m.lat];
          try {
            const saved = await S.saveMedia(Object.assign({}, m, { lon: +ll.lng.toFixed(7), lat: +ll.lat.toFixed(7) }));
            Object.assign(m, saved); toast('ย้ายหมุด "' + m.title + '" แล้ว');
            if (st.view && st.view.id === m.id) renderView();
          } catch (e) { mk.setLngLat(prev); toast('ย้ายหมุดไม่สำเร็จ: ' + e.message, 5000); }
        });
      }
      st.mediaMarkers.set(m.id, mk);
    });
    updateMarkerVisibility();
    renderLegend();
    renderOrtho();
    $('#btnList').textContent = 'แปลงทั้งหมด (' + st.plots.length.toLocaleString('th-TH') + ')';
  }

  function updateMarkerVisibility() {
    const z = map.getZoom();
    const selPlot = st.view && st.view.kind === 'plot' ? st.view.id : null;
    st.mediaMarkers.forEach((mk, id) => {
      const m = st.media.find(x => x.id === id);
      const show = !st.hidden.has(m.type) && (z >= cfg.MEDIA_MIN_ZOOM || (st.view && (st.view.id === id || m.plot_id === selPlot)));
      mk.getElement().style.display = show ? '' : 'none';
    });
  }

  // ---------------- ออร์โธ ----------------
  function renderOrtho() {
    const style = map.getStyle(); if (!style) return;
    style.layers.filter(l => l.id.startsWith('ortho-')).forEach(l => map.removeLayer(l.id));
    Object.keys(style.sources).filter(s => s.startsWith('ortho-')).forEach(s => map.removeSource(s));
    if (!st.showOrtho) return;
    st.plots.forEach(p => {
      if (!p.ortho_url || !p.ortho_type) return;
      const sid = 'ortho-' + p.id;
      try {
        if (p.ortho_type === 'xyz') {
          const tileUrl = /^https?:/.test(p.ortho_url) ? p.ortho_url : location.href.split(/[?#]/)[0].replace(/[^/]*$/, '') + p.ortho_url.replace(/^\.?\//, '');
          const src = { type: 'raster', tiles: [tileUrl], tileSize: 256, minzoom: cfg.ORTHO_MIN_ZOOM || 14, maxzoom: cfg.ORTHO_MAX_ZOOM || 21 };
          const b = p.ortho_bounds || (p.boundary ? bboxOf(plotCoords(p)) : null); if (b) src.bounds = b;
          map.addSource(sid, src);
        } else {
          const b = p.ortho_bounds; if (!b) return;
          map.addSource(sid, { type: 'image', url: S.url(p.ortho_url), coordinates: [[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]]] });
        }
        map.addLayer({ id: sid, type: 'raster', source: sid, minzoom: (cfg.ORTHO_MIN_ZOOM || 14) - 1, paint: { 'raster-opacity': p._orthoOpacity != null ? p._orthoOpacity : 1 } }, 'plots-fill');
      } catch (e) { console.warn('ortho', e); }
    });
  }

  // ---------------- คำอธิบายสัญลักษณ์ ----------------
  function renderLegend() {
    const L = $('#legend'); L.innerHTML = '';
    TYPES.forEach(t => {
      const n = st.media.filter(m => m.type === t.key).length;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', String(!st.hidden.has(t.key)));
      b.innerHTML = '<span class="dot t-' + t.key + '">' + ICON[t.key] + '</span><span class="label">' + t.label + '</span><span class="n">' + n + '</span>';
      b.title = (st.hidden.has(t.key) ? 'แสดง ' : 'ซ่อน ') + t.label;
      b.onclick = () => { st.hidden.has(t.key) ? st.hidden.delete(t.key) : st.hidden.add(t.key); renderLegend(); updateMarkerVisibility(); };
      L.appendChild(b);
    });
    if (st.plots.some(p => p.ortho_url)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', String(st.showOrtho));
      b.innerHTML = '<span class="dot" style="background:#5b6b3a">' + ICON.aerial + '</span><span class="label">ภาพออร์โธ</span>';
      b.onclick = () => { st.showOrtho = !st.showOrtho; renderLegend(); renderOrtho(); };
      L.appendChild(b);
    }
  }

  // ---------------- 2D / 3D / ดาวเทียม ----------------
  function set3D(on) {
    st.is3d = on;
    $('#b2d').setAttribute('aria-pressed', String(!on)); $('#b3d').setAttribute('aria-pressed', String(on));
    if (on) {
      map.setTerrain({ source: window.TERRAIN_SOURCE, exaggeration: 1.4 });
      try { map.setSky({ 'sky-color': '#a9c9e8', 'horizon-color': '#e3ecef', 'fog-color': '#e3ecef', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.5 }); } catch (e) {}
      map.easeTo({ pitch: 55, bearing: map.getBearing() || -20, duration: 1400 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    }
    applyLayerVisibility();
  }
  function setSat(on) {
    st.sat = on;
    $('#bMap').setAttribute('aria-pressed', String(!on)); $('#bSat').setAttribute('aria-pressed', String(on));
    applyLayerVisibility();
  }
  function applyLayerVisibility() {
    const vis = (id, v) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none'); };
    vis('sat', st.sat);
    window.VECTOR_FILL_LAYERS.forEach(id => vis(id, !st.sat));
    vis('building', !st.sat && !st.is3d);
    vis('building-3d', !st.sat && st.is3d);
    vis('wood-3d', !st.sat && st.is3d);
  }
  $('#b2d').onclick = () => set3D(false);
  $('#b3d').onclick = () => set3D(true);
  $('#bMap').onclick = () => setSat(false);
  $('#bSat').onclick = () => setSat(true);

  // ---------------- ค้นหา / รายการ ----------------
  const q = $('#q'), results = $('#results');
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase();
    if (!s) { results.hidden = true; return; }
    const hits = st.plots.filter(p => [p.name, p.code, p.owner_name, p.village, p.subdistrict, p.district, p.province, p.variety]
      .some(v => v && String(v).toLowerCase().includes(s))).slice(0, 20);
    results.innerHTML = hits.length ? '' : '<div class="muted" style="padding:10px">ไม่พบแปลงที่ตรงกับ "' + esc(q.value) + '"</div>';
    hits.forEach(p => {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = esc(p.name) + '<small>' + esc([p.code, p.owner_name, p.village, p.district].filter(Boolean).join(' · ')) + '</small>';
      b.onclick = () => { results.hidden = true; q.value = ''; openPlot(p.id); };
      results.appendChild(b);
    });
    results.hidden = false;
  });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { results.hidden = true; q.blur(); } if (e.key === 'Enter') { const b = results.querySelector('button'); if (b) b.click(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) results.hidden = true; });
  $('#btnList').onclick = () => openList();

  // ---------------- แผงข้อมูล ----------------
  const panel = $('#panel'), pBody = $('#pBody');
  function showPanel(on) {
    panel.hidden = !on; document.body.classList.toggle('panel-open', on);
    if (!on) destroyPano();
  }
  $('#pClose').onclick = () => { st.view = null; st.history = []; showPanel(false); renderData(); writeUrl(); };
  $('#pBack').onclick = () => { const prev = st.history.pop(); if (prev) { st.view = prev; renderView(); renderData(); writeUrl(); } };
  $('#pLink').onclick = () => copyText(location.href);

  function go(view) {
    if (st.view && !(st.view.kind === view.kind && st.view.id === view.id)) st.history.push(st.view);
    if (st.history.length > 20) st.history.shift();
    st.view = view; renderView(); renderData(); writeUrl();
  }
  function padding() {
    const mobile = window.innerWidth <= 760;
    return mobile ? { top: 150, bottom: window.innerHeight * 0.62 + 20, left: 30, right: 30 } : { top: 80, bottom: 80, left: 60, right: 420 + 60 };
  }
  function openList() { go({ kind: 'list', id: 'all' }); }
  function openPlot(id, opt = {}) {
    const p = st.plots.find(x => x.id === id || x.code === id); if (!p) return;
    go({ kind: 'plot', id: p.id });
    if (opt.fly !== false) {
      const c = plotCoords(p);
      if (c.length > 1) map.fitBounds(bboxOf(c), { padding: padding(), maxZoom: 18, duration: 1200 });
      else if (c.length) map.flyTo({ center: c[0], zoom: 17, padding: padding() });
    }
  }
  function openMedia(id, opt = {}) {
    const m = st.media.find(x => x.id === id); if (!m) return;
    go({ kind: 'media', id });
    if (opt.fly !== false) map.flyTo({ center: [m.lon, m.lat], zoom: Math.max(map.getZoom(), 17), padding: padding(), duration: 1000 });
  }

  function renderView() {
    destroyPano();
    const v = st.view; if (!v) { showPanel(false); return; }
    $('#pBack').hidden = !st.history.length;
    if (v.kind === 'list') renderList();
    else if (v.kind === 'plot') renderPlot(st.plots.find(p => p.id === v.id));
    else if (v.kind === 'media') renderMedia(st.media.find(m => m.id === v.id));
    showPanel(true);
    pBody.scrollTop = 0;
  }

  function renderList() {
    $('#pCrumb').textContent = 'แปลงทั้งหมด';
    let h = '<div class="sec"><div class="eyebrow">รายการแปลง</div><h2 class="title">' + st.plots.length.toLocaleString('th-TH') + ' แปลง</h2></div>';
    if (!st.plots.length) h += '<div class="sec"><p class="muted">ยังไม่มีแปลงในระบบ' + (st.user ? ' กด "+ แปลงใหม่" ด้านล่างเพื่อเริ่ม' : '') + '</p></div>';
    h += '<div>' + st.plots.map(p => {
      const n = st.media.filter(m => m.plot_id === p.id).length;
      return '<button type="button" class="list-plot" data-plot="' + esc(p.id) + '"><span class="bean">' + ICON.bean + '</span><span><b>' + esc(p.name) + '</b><small>' +
        esc([p.code, p.owner_name, p.village, p.district].filter(Boolean).join(' · ')) + (n ? ' · สื่อ ' + n + ' รายการ' : '') + (p.is_published === false ? ' · ยังไม่เผยแพร่' : '') + '</small></span></button>';
    }).join('') + '</div>';
    pBody.innerHTML = h;
    pBody.querySelectorAll('[data-plot]').forEach(b => b.onclick = () => openPlot(b.dataset.plot));
  }

  function fact(label, val, full) {
    return '<div' + (full ? ' style="grid-column:1/-1"' : '') + '><dt>' + label + '</dt><dd' + (val == null || val === '' ? ' class="na">ยังไม่ระบุ' : '>' + esc(val)) + '</dd></div>';
  }

  function mediaThumbs(list, currentId) {
    if (!list.length) return '';
    const groups = TYPES.map(t => ({ t, items: list.filter(m => m.type === t.key) })).filter(g => g.items.length);
    return groups.map(g => '<div class="mgroup"><h3><span class="chip-dot pin t-' + g.t.key + '" style="width:20px;height:20px;border-width:0;box-shadow:none">' + ICON[g.t.key] + '</span>' + g.t.label + ' (' + g.items.length + ')</h3><div class="thumbs">' +
      g.items.map(m => {
        const th = thumbUrl(m);
        return '<button type="button" class="thumb' + (m.id === currentId ? ' is-current' : '') + '" data-media="' + esc(m.id) + '" title="' + esc(m.title) + '">' +
          (th ? '<img src="' + esc(th) + '" alt="" loading="lazy">' : '<span style="padding:6px">' + esc(m.title) + '</span>') +
          (th ? '<span class="cap">' + esc(m.title) + '</span>' : '') + '</button>';
      }).join('') + '</div></div>').join('');
  }
  function thumbUrl(m) {
    if (m.thumb_path) return S.url(m.thumb_path);
    if (m.type === 'video' && m.youtube_id) return 'https://i.ytimg.com/vi/' + m.youtube_id + '/mqdefault.jpg';
    if ((m.type === 'photo' || m.type === 'aerial') && m.file_path) return S.url(m.file_path);
    return null;
  }
  function bindThumbs() { pBody.querySelectorAll('[data-media]').forEach(b => b.onclick = () => openMedia(b.dataset.media)); }

  function renderPlot(p) {
    if (!p) { pBody.innerHTML = '<div class="sec"><p>ไม่พบแปลงนี้ อาจถูกลบไปแล้ว</p></div>'; return; }
    $('#pCrumb').textContent = 'แปลง' + (p.code ? ' ' + p.code : '');
    const area = geomArea(p.boundary);
    const list = st.media.filter(m => m.plot_id === p.id);
    const loc = [p.village, p.subdistrict && 'ต.' + p.subdistrict, p.district && 'อ.' + p.district, p.province && 'จ.' + p.province]
      .filter(v => v && !/^(ต\.|อ\.|จ\.)?—$/.test(v)).join(' ');
    const c = plotCenter(p);
    let h = '<div class="sec">' +
      '<div class="eyebrow">แปลงกาแฟ' + (p.is_published === false ? ' · ยังไม่เผยแพร่' : '') + '</div>' +
      '<h2 class="title">' + esc(p.name) + '</h2>' +
      (p.owner_name ? '<p class="sub">เจ้าของแปลง: ' + esc(p.owner_name) + '</p>' : '') +
      (loc ? '<p class="sub">' + esc(loc) + '</p>' : '') +
      '</div><div class="sec"><dl class="facts">' +
      fact('พื้นที่', thaiArea(area)) + fact('พันธุ์', p.variety) +
      fact('ปีที่ปลูก', p.planted_year ? 'พ.ศ. ' + p.planted_year : null) + fact('จำนวนต้น', fmtNum(p.tree_count, 'ต้น')) +
      fact('ความสูงจากระดับทะเล', fmtNum(p.elevation_m, 'ม.')) + fact('ผลผลิตเชอร์รี่', fmtNum(p.yield_kg, 'กก./ปี')) +
      fact('ไม้ร่มเงา', p.shade_trees, true) +
      (c ? fact('พิกัดกลางแปลง', c[1].toFixed(6) + ', ' + c[0].toFixed(6), true) : '') +
      '</dl>' +
      (p.description ? '<p class="desc">' + esc(p.description) + '</p>' : '') +
      '<div class="row"><button class="btn sm" type="button" id="aZoom">ซูมไปที่แปลง</button>' +
      (c ? '<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + c[1] + ',' + c[0] + '">นำทาง</a>' : '') + '</div>' +
      '</div>';
    if (p.ortho_url) {
      h += '<div class="sec"><div class="eyebrow">ภาพถ่ายทางอากาศ (ออร์โธ)</div>' +
        '<div class="ortho-ctl"><label for="oOp" class="muted">ความทึบ</label><input type="range" id="oOp" min="0" max="1" step="0.05" value="' + (p._orthoOpacity != null ? p._orthoOpacity : 1) + '"></div>' +
        (p.ortho_date ? '<p class="muted">ถ่ายเมื่อ ' + esc(fmtDate(p.ortho_date)) + '</p>' : '') + '</div>';
    }
    h += '<div class="sec"><div class="eyebrow">สื่อในแปลงนี้</div>' + (list.length ? mediaThumbs(list) : '<p class="muted">ยังไม่มีพาโนรามา ภาพถ่าย หรือวีดีโอ</p>') + '</div>';
    if (canEdit(p)) {
      h += '<div class="sec"><div class="eyebrow">แก้ไข</div><div class="row">' +
        '<button class="btn sm primary" type="button" id="aAddMedia">+ เพิ่มสื่อในแปลงนี้</button>' +
        '<button class="btn sm" type="button" id="aEdit">แก้ไขข้อมูล</button>' +
        '<button class="btn sm" type="button" id="aDraw">' + (p.boundary ? 'แก้ขอบเขต' : 'วาดขอบเขต') + '</button>' +
        '<button class="btn sm" type="button" id="aImportB">นำเข้าขอบเขตจากไฟล์</button>' +
        '<button class="btn sm danger" type="button" id="aDel">ลบแปลง</button></div></div>';
    }
    pBody.innerHTML = h;
    bindThumbs();
    $('#aZoom').onclick = () => openPlotFly(p);
    const op = $('#oOp'); if (op) op.oninput = () => { p._orthoOpacity = +op.value; if (map.getLayer('ortho-' + p.id)) map.setPaintProperty('ortho-' + p.id, 'raster-opacity', +op.value); };
    if (canEdit(p)) {
      $('#aAddMedia').onclick = () => mediaForm({ plot_id: p.id });
      $('#aEdit').onclick = () => plotForm(p);
      $('#aDraw').onclick = () => startDraw(p.boundary, async g => savePlotQuick(p, { boundary: g }));
      $('#aImportB').onclick = () => pickImport(async fcol => {
        const g = (fcol.features.find(f => f.geometry && /Polygon/.test(f.geometry.type)) || {}).geometry;
        if (!g) { toast('ไม่พบรูปแปลง (Polygon) ในไฟล์', 5000); return; }
        await savePlotQuick(p, { boundary: g });
      });
      $('#aDel').onclick = () => confirmBox('ลบแปลง "' + p.name + '"?', 'สื่อทั้งหมด ' + list.length + ' รายการในแปลงนี้จะถูกลบด้วย และกู้คืนไม่ได้', 'ลบแปลง', async () => {
        for (const m of list) await S.deleteMedia(m);
        await S.deletePlot(p.id); toast('ลบแปลงแล้ว');
        st.view = null; st.history = []; showPanel(false); await reload(); writeUrl();
      });
    }
  }
  function openPlotFly(p) { const c = plotCoords(p); if (c.length > 1) map.fitBounds(bboxOf(c), { padding: padding(), maxZoom: 18 }); else if (c.length) map.flyTo({ center: c[0], zoom: 17 }); }
  async function savePlotQuick(p, patch) {
    const next = Object.assign({}, p, patch);
    if (patch.boundary) { const c = centroid(patch.boundary); if (c) { next.center_lon = +c[0].toFixed(7); next.center_lat = +c[1].toFixed(7); } }
    try { await S.savePlot(next); toast('บันทึกแปลงแล้ว'); await reload(); renderView(); }
    catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 6000); }
  }

  function renderMedia(m) {
    if (!m) { pBody.innerHTML = '<div class="sec"><p>ไม่พบรายการนี้ อาจถูกลบไปแล้ว</p></div>'; return; }
    const p = st.plots.find(x => x.id === m.plot_id);
    $('#pCrumb').textContent = (p ? p.name + ' › ' : '') + typeLabel(m.type);
    let viewer = '';
    if (m.type === 'pano') viewer = '<div class="viewer" id="panoBox"></div>';
    else if (m.type === 'photo' || m.type === 'aerial') {
      viewer = m.file_path ? '<div class="viewer"><img id="mImg" src="' + esc(S.url(m.file_path)) + '" alt="' + esc(m.title) + '"></div>' : '';
    } else if (m.type === 'video') {
      viewer = m.youtube_id
        ? '<div class="viewer" id="ytBox"><img src="https://i.ytimg.com/vi/' + esc(m.youtube_id) + '/hqdefault.jpg" alt="" style="cursor:pointer"><button class="play" type="button" id="ytPlay" aria-label="เล่นวีดีโอ"><svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.5l11 6.5-11 6.5z"/></svg></button></div>'
        : '<div class="viewer"><div class="empty">ยังไม่ได้ใส่ลิงก์ YouTube</div></div>';
    }
    const siblings = p ? st.media.filter(x => x.plot_id === p.id && x.id !== m.id) : [];
    let h = viewer + '<div class="sec">' +
      '<div class="eyebrow" style="display:flex;align-items:center;gap:6px"><span class="pin t-' + m.type + '" style="width:20px;height:20px;border-width:0;box-shadow:none">' + ICON[m.type] + '</span>' + typeLabel(m.type) + '</div>' +
      '<h2 class="title">' + esc(m.title) + '</h2>' +
      (m.description ? '<p class="desc">' + esc(m.description) + '</p>' : '') +
      '<dl class="facts">' + fact('วันที่ถ่าย', fmtDate(m.taken_at)) + fact('ความสูงบิน', m.alt_m != null ? fmtNum(Math.round(m.alt_m), 'ม.') : null) +
      fact('พิกัด', m.lat.toFixed(6) + ', ' + m.lon.toFixed(6), true) + '</dl>' +
      '<div class="row"><button class="btn sm" type="button" id="aCopy">คัดลอกพิกัด</button>' +
      (m.type === 'video' && m.youtube_id ? '<a class="btn sm" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + esc(m.youtube_id) + '">เปิดใน YouTube</a>' : '') +
      (m.link_url ? '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(m.link_url) + '">เปิดลิงก์</a>' : '') +
      (p ? '<button class="btn sm" type="button" id="aPlot">ดูข้อมูลแปลง</button>' : '') + '</div></div>';
    if (siblings.length) h += '<div class="sec"><div class="eyebrow">สื่ออื่นในแปลงนี้</div>' + mediaThumbs(siblings) + '</div>';
    if (canEditMedia(m)) {
      h += '<div class="sec"><div class="eyebrow">แก้ไข</div><p class="muted">ลากหมุดบนแผนที่เพื่อย้ายตำแหน่งได้</p><div class="row">' +
        '<button class="btn sm" type="button" id="aEditM">แก้ไขรายการนี้</button>' +
        '<button class="btn sm danger" type="button" id="aDelM">ลบ</button></div></div>';
    }
    pBody.innerHTML = h;
    bindThumbs();
    $('#aCopy').onclick = () => copyText(m.lat.toFixed(6) + ', ' + m.lon.toFixed(6));
    if (p) $('#aPlot').onclick = () => openPlot(p.id, { fly: false });
    const img = $('#mImg'); if (img) img.onclick = () => openLightbox(img.src);
    const yb = $('#ytBox');
    if (yb) yb.onclick = () => { yb.innerHTML = '<iframe class="yt" src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(m.youtube_id) + '?autoplay=1&rel=0" title="' + esc(m.title) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>'; yb.onclick = null; };
    if (m.type === 'pano') {
      const src = m.lite_path && maxTexture() < 8192 ? m.lite_path : (m.file_path || m.lite_path);
      if (!src) $('#panoBox').innerHTML = '<div class="empty">ยังไม่มีไฟล์ภาพ</div>';
      else {
        try {
          st.pano = pannellum.viewer('panoBox', {
            type: 'equirectangular', panorama: S.url(src), autoLoad: true, autoRotate: -2, hfov: 100,
            showZoomCtrl: true, showFullscreenCtrl: true, compass: m.heading != null, northOffset: m.heading || 0,
            strings: { loadingLabel: 'กำลังโหลด…', bylineLabel: '', genericWebGLError: 'อุปกรณ์นี้แสดงภาพ 360° ไม่ได้', iOS8WebGLError: 'อุปกรณ์นี้แสดงภาพ 360° ไม่ได้' }
          });
        } catch (e) { $('#panoBox').innerHTML = '<div class="empty">เปิดภาพ 360° ไม่ได้: ' + esc(e.message) + '</div>'; }
      }
    }
    if (canEditMedia(m)) {
      $('#aEditM').onclick = () => mediaForm(m);
      $('#aDelM').onclick = () => confirmBox('ลบ "' + m.title + '"?', 'ไฟล์ที่อัปโหลดไว้จะถูกลบด้วย และกู้คืนไม่ได้', 'ลบ', async () => {
        await S.deleteMedia(m); toast('ลบแล้ว');
        st.view = p ? { kind: 'plot', id: p.id } : null; st.history = []; await reload(); renderView(); writeUrl();
      });
    }
  }
  function destroyPano() { if (st.pano) { try { st.pano.destroy(); } catch (e) {} st.pano = null; } }

  function openLightbox(src) { $('#lbImg').src = src; $('#lightbox').hidden = false; }
  $('#lbClose').onclick = () => { $('#lightbox').hidden = true; };
  $('#lightbox').onclick = e => { if (e.target.id === 'lightbox') $('#lightbox').hidden = true; };

  // ---------------- ลิงก์ ----------------
  function writeUrl() {
    const u = new URL(location.href);
    u.searchParams.delete('plot'); u.searchParams.delete('media');
    if (st.view && st.view.kind === 'plot') { const p = st.plots.find(x => x.id === st.view.id); u.searchParams.set('plot', (p && p.code) || st.view.id); }
    if (st.view && st.view.kind === 'media') u.searchParams.set('media', st.view.id);
    history.replaceState(null, '', u);
  }
  function routeFromUrl() {
    const u = new URL(location.href);
    if (u.searchParams.get('media')) openMedia(u.searchParams.get('media'));
    else if (u.searchParams.get('plot')) openPlot(u.searchParams.get('plot'));
    else if (st.plots.length) {
      const all = st.plots.flatMap(plotCoords);
      if (all.length > 1) map.fitBounds(bboxOf(all), { padding: 80, maxZoom: 16, duration: 0 });
    }
  }

  // ---------------- เข้าสู่ระบบ ----------------
  function renderAuth() {
    const on = !!(st.user && st.user.role);
    $('#editbar').hidden = !on;
    $('#btnLogin').hidden = on;
    $('#eImport').hidden = !(on && st.user.role === 'admin');
    if (on) $('#eWho').textContent = (st.user.display_name || st.user.email) + (st.user.role === 'admin' ? ' · ผู้ดูแล' : ' · เจ้าของแปลง');
  }
  $('#btnLogin').onclick = () => {
    if (S.mode === 'demo') {
      openDialog('แก้ไขข้อมูล (โหมดสาธิต)',
        '<p class="f full desc">เว็บนี้ยังไม่ได้เชื่อม Supabase จึงทดลองแก้ไขได้โดยไม่ต้องมีรหัสผ่าน ข้อมูลที่แก้จะเก็บไว้ในเบราว์เซอร์นี้เท่านั้น ส่วนไฟล์ภาพที่อัปโหลดจะหายเมื่อรีโหลดหน้า</p>',
        'เริ่มทดลองแก้ไข', async () => { st.user = await S.signIn(); renderAuth(); renderData(); renderView(); return true; });
      return;
    }
    openDialog('เข้าสู่ระบบสำหรับผู้แก้ไข',
      '<div class="f full"><label for="lEmail">อีเมล</label><input id="lEmail" type="email" autocomplete="username" required></div>' +
      '<div class="f full"><label for="lPass">รหัสผ่าน</label><input id="lPass" type="password" autocomplete="current-password" required></div>' +
      '<p class="f full muted">บัญชีผู้แก้ไขสร้างโดยผู้ดูแลระบบ ผู้ชมทั่วไปไม่ต้องเข้าสู่ระบบ</p>',
      'เข้าสู่ระบบ', async () => {
        const u = await S.signIn($('#lEmail').value.trim(), $('#lPass').value);
        if (!u || !u.role) { await S.signOut(); throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์แก้ไข ให้ผู้ดูแลเพิ่มในตาราง profiles'); }
        st.user = u; renderAuth(); renderData(); renderView(); toast('เข้าสู่ระบบแล้ว'); return true;
      });
  };
  $('#eLogout').onclick = async () => { await S.signOut(); st.user = null; renderAuth(); renderData(); renderView(); toast('ออกจากระบบแล้ว'); };

  // ---------------- หน้าต่างฟอร์ม ----------------
  const dlg = $('#dlg'), dlgForm = $('#dlgForm');
  function openDialog(title, bodyHtml, okLabel, onOk, opt = {}) {
    dlgForm.innerHTML = '<header><h2>' + esc(title) + '</h2></header><div class="body">' + bodyHtml +
      '<div class="err" id="dErr" hidden></div><div class="progress" id="dProg" hidden></div></div>' +
      '<footer>' + (opt.extraFooter || '') + '<button class="btn" type="button" id="dCancel">ยกเลิก</button>' +
      '<button class="btn ' + (opt.danger ? 'danger' : 'primary') + '" type="submit" id="dOk">' + esc(okLabel) + '</button></footer>';
    $('#dCancel').onclick = () => dlg.close();
    dlgForm.onsubmit = async e => {
      e.preventDefault();
      const ok = $('#dOk'); ok.disabled = true; $('#dErr').hidden = true;
      try { const r = await onOk(); if (r !== false) dlg.close(); }
      catch (err) { $('#dErr').textContent = err.message || String(err); $('#dErr').hidden = false; }
      finally { ok.disabled = false; }
    };
    if (!dlg.open) dlg.showModal();
    const first = dlgForm.querySelector('.body input:not([type=hidden]), .body select, .body textarea'); if (first && !opt.noFocus) first.focus();
  }
  function confirmBox(title, text, okLabel, fn) {
    openDialog(title, '<p class="f full desc">' + esc(text) + '</p>', okLabel, async () => { await fn(); return true; }, { danger: true, noFocus: true });
  }
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const numOrNull = id => { const v = val(id); return v === '' ? null : Number(v); };
  const inp = (id, label, value, type = 'text', extra = '', full = false) =>
    '<div class="f' + (full ? ' full' : '') + '"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" value="' + esc(value == null ? '' : value) + '" ' + extra + '></div>';

  // ---------- ฟอร์มแปลง ----------
  function plotForm(p, preset) {
    p = p || {};
    const isNew = !p.id;
    let boundary = (preset && preset.boundary) || p.boundary || null;
    const area = geomArea(boundary);
    const admin = st.user && st.user.role === 'admin';
    const body =
      inp('fName', 'ชื่อแปลง *', p.name, 'text', 'required', true) +
      inp('fCode', 'รหัสแปลง', p.code, 'text', 'placeholder="เช่น CF-001"') +
      inp('fOwner', 'ชื่อเจ้าของแปลง (แสดงต่อสาธารณะ)', p.owner_name) +
      inp('fVillage', 'หมู่บ้าน', p.village) + inp('fSub', 'ตำบล', p.subdistrict) +
      inp('fDist', 'อำเภอ', p.district) + inp('fProv', 'จังหวัด', p.province) +
      inp('fVar', 'พันธุ์กาแฟ', p.variety, 'text', 'list="varList"') +
      '<datalist id="varList"><option>อาราบิก้า</option><option>อาราบิก้า คาติมอร์</option><option>อาราบิก้า ทิปปิก้า</option><option>อาราบิก้า กีชา</option><option>โรบัสต้า</option></datalist>' +
      inp('fYear', 'ปีที่ปลูก (พ.ศ.)', p.planted_year, 'number', 'min="2400" max="2700"') +
      inp('fTrees', 'จำนวนต้น', p.tree_count, 'number', 'min="0"') +
      inp('fElev', 'ความสูงจากระดับทะเล (ม.)', p.elevation_m, 'number') +
      inp('fYield', 'ผลผลิตเชอร์รี่ (กก./ปี)', p.yield_kg, 'number', 'min="0" step="any"') +
      inp('fShade', 'ไม้ร่มเงา', p.shade_trees, 'text', '', true) +
      '<div class="f full"><label for="fDesc">รายละเอียด</label><textarea id="fDesc">' + esc(p.description) + '</textarea></div>' +
      '<div class="f full"><label>ขอบเขตแปลง</label><div class="hint" id="fBoundInfo">' + (boundary ? 'มีขอบเขตแล้ว · พื้นที่ ' + thaiArea(area) : 'ยังไม่มีขอบเขต วาดบนแผนที่หรือนำเข้าจากไฟล์ KML / GeoJSON / Shapefile (.zip) ได้ภายหลัง') + '</div></div>' +
      '<div class="f full"><label>ภาพออร์โธ (ไม่บังคับ)</label><div class="hint">ใส่ URL tiles แบบ {z}/{x}/{y} ที่ได้จาก gdal2tiles หรือ URL ไฟล์ภาพเดี่ยว พร้อมขอบเขต [ตะวันตก, ใต้, ตะวันออก, เหนือ]</div></div>' +
      '<div class="f"><label for="fOType">ชนิดออร์โธ</label><select id="fOType"><option value="">ไม่มี</option><option value="xyz"' + (p.ortho_type === 'xyz' ? ' selected' : '') + '>XYZ tiles</option><option value="image"' + (p.ortho_type === 'image' ? ' selected' : '') + '>ภาพเดี่ยว</option></select></div>' +
      inp('fODate', 'วันที่บินถ่าย', p.ortho_date, 'date') +
      inp('fOUrl', 'URL / path ออร์โธ', p.ortho_url, 'text', 'placeholder="ortho/CF-001/{z}/{x}/{y}.png หรือ https://..."', true) +
      '<div class="f full"><label for="fOFile">หรืออัปโหลดภาพออร์โธเดี่ยว (JPG / PNG / WebP ไม่เกิน 50 MB)</label><input id="fOFile" type="file" accept="image/jpeg,image/png,image/webp"><span class="hint">ส่งออกจาก QGIS / Metashape เป็นภาพพร้อมจดขอบเขตพิกัด แล้วกรอกในช่องขอบเขตภาพด้านล่าง</span></div>' +
      inp('fOBounds', 'ขอบเขตภาพ (เฉพาะภาพเดี่ยว)', p.ortho_bounds ? p.ortho_bounds.join(', ') : '', 'text', 'placeholder="98.9480, 19.2985, 98.9520, 19.3015"', true) +
      (admin && S.mode === 'live' ? inp('fOwnerId', 'รหัสบัญชีเจ้าของที่แก้ไขได้ (owner_id)', p.owner_id, 'text', 'placeholder="uuid จาก Authentication > Users"', true) : '') +
      '<div class="f full check"><input type="checkbox" id="fPub"' + (p.is_published !== false ? ' checked' : '') + '><label for="fPub">เผยแพร่ให้สาธารณะเห็น</label></div>';
    openDialog(isNew ? 'แปลงใหม่' : 'แก้ไขข้อมูลแปลง', body, 'บันทึก', async () => {
      if (!val('fName')) throw new Error('กรุณาใส่ชื่อแปลง');
      let ob = null;
      if (val('fOBounds')) {
        ob = val('fOBounds').split(/[\s,]+/).map(Number);
        if (ob.length !== 4 || ob.some(isNaN)) throw new Error('ขอบเขตภาพออร์โธต้องเป็นตัวเลข 4 ค่า');
      }
      const row = Object.assign({}, p, {
        name: val('fName'), code: val('fCode') || null, owner_name: val('fOwner') || null,
        village: val('fVillage') || null, subdistrict: val('fSub') || null, district: val('fDist') || null, province: val('fProv') || null,
        variety: val('fVar') || null, planted_year: numOrNull('fYear'), tree_count: numOrNull('fTrees'),
        elevation_m: numOrNull('fElev'), yield_kg: numOrNull('fYield'), shade_trees: val('fShade') || null,
        description: val('fDesc') || null, boundary,
        ortho_type: val('fOType') || null, ortho_url: val('fOUrl') || null, ortho_bounds: ob, ortho_date: val('fODate') || null,
        is_published: $('#fPub').checked
      });
      if (document.getElementById('fOwnerId')) row.owner_id = val('fOwnerId') || null;
      const of = $('#fOFile') && $('#fOFile').files[0];
      if (of) {
        if (!ob) throw new Error('ภาพออร์โธเดี่ยวต้องกรอกขอบเขตภาพด้วย');
        if (!row.id) row.id = S.newId();
        $('#dProg').hidden = false; $('#dProg').textContent = 'กำลังอัปโหลดภาพออร์โธ…';
        const ext = (of.name.match(/\.(jpe?g|png|webp)$/i) || ['', 'jpg'])[1].toLowerCase();
        row.ortho_url = await S.upload(of, row.id + '/ortho-' + Date.now().toString(36) + '.' + ext);
        row.ortho_type = 'image';
      }
      if (boundary) { const c = centroid(boundary); row.center_lon = +c[0].toFixed(7); row.center_lat = +c[1].toFixed(7); }
      else if (preset && preset.center) { row.center_lon = preset.center[0]; row.center_lat = preset.center[1]; }
      delete row._orthoOpacity; delete row.area_sqm;
      const saved = await S.savePlot(row);
      toast('บันทึกแปลงแล้ว'); await reload(); openPlot(saved.id, { fly: isNew });
      return true;
    });
  }

  // ---------- ฟอร์มสื่อ ----------
  function mediaForm(m) {
    m = m || {};
    const isNew = !m.id;
    const plotsEditable = st.plots.filter(canEdit);
    const opts = '<option value="">— ไม่ผูกกับแปลง —</option>' + plotsEditable.map(p => '<option value="' + esc(p.id) + '"' + (p.id === m.plot_id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
    const c = m.lat != null ? [m.lon, m.lat] : null;
    const body =
      '<div class="f"><label for="mType">ชนิด</label><select id="mType">' + TYPES.map(t => '<option value="' + t.key + '"' + (t.key === (m.type || 'photo') ? ' selected' : '') + '>' + t.label + '</option>').join('') + '</select></div>' +
      '<div class="f"><label for="mPlot">แปลง</label><select id="mPlot">' + opts + '</select></div>' +
      '<div class="f full" id="wFile"><label for="mFile">' + (isNew ? 'ไฟล์ภาพ' : 'เปลี่ยนไฟล์ภาพ (ไม่บังคับ)') + '</label><input id="mFile" type="file" accept="image/jpeg,image/png,image/webp"' + (isNew ? ' multiple' : '') + '>' +
      '<span class="hint" id="mFileHint">ถ้าภาพมีพิกัด GPS (เช่น ไฟล์จากโดรนหรือมือถือ) ระบบจะปักหมุดและใส่วันที่ให้อัตโนมัติ' + (isNew ? ' · เลือกหลายภาพได้ จะสร้างหมุดแยกให้ทีละภาพ' : '') + '</span></div>' +
      '<div class="f full check" id="wShrink"><input type="checkbox" id="mShrink" checked><label for="mShrink">ย่อภาพถ่ายเหลือด้านยาว 2560 px ก่อนอัปโหลด (ประหยัดพื้นที่ โหลดเร็ว)</label></div>' +
      inp('mYt', 'ลิงก์ YouTube', m.youtube_id ? 'https://youtu.be/' + m.youtube_id : '', 'url', 'placeholder="https://youtu.be/... (ตั้งเป็นไม่เป็นสาธารณะ / Unlisted ได้)"', true) +
      inp('mTitle', 'ชื่อรายการ *', m.title, 'text', '', true) +
      '<div class="f full"><label for="mDesc">คำอธิบาย</label><textarea id="mDesc">' + esc(m.description) + '</textarea></div>' +
      inp('mLat', 'ละติจูด *', c ? c[1] : '', 'number', 'step="any"') +
      inp('mLon', 'ลองจิจูด *', c ? c[0] : '', 'number', 'step="any"') +
      '<div class="f full"><div class="row"><button class="btn sm" type="button" id="mPick">เลือกตำแหน่งบนแผนที่</button><button class="btn sm" type="button" id="mHere">ใช้ตำแหน่งของฉัน</button><button class="btn sm" type="button" id="mCenter">กลางจอแผนที่</button></div></div>' +
      inp('mDate', 'วันที่ถ่าย', m.taken_at ? String(m.taken_at).slice(0, 10) : '', 'date') +
      inp('mAlt', 'ความสูงบิน (ม.)', m.alt_m, 'number', 'step="any"') +
      inp('mHead', 'ทิศหน้ากล้อง (องศาจากทิศเหนือ)', m.heading, 'number', 'step="any" min="0" max="360"') +
      inp('mLink', 'ลิงก์อื่น (ไม่บังคับ)', m.link_url, 'url', '', true);

    let exifs = []; // ผลอ่าน EXIF ต่อไฟล์
    openDialog(isNew ? 'เพิ่มหมุด / สื่อ' : 'แก้ไข ' + typeLabel(m.type), body, 'บันทึก', async () => {
      const type = val('mType');
      const files = Array.from($('#mFile').files || []);
      const yt = ytId(val('mYt'));
      if (type === 'video' && !yt && !m.youtube_id) throw new Error('ใส่ลิงก์ YouTube ที่ถูกต้อง');
      if (isNew && ['pano', 'photo', 'aerial'].includes(type) && !files.length) throw new Error('เลือกไฟล์ภาพอย่างน้อย 1 ไฟล์');
      const lat = numOrNull('mLat'), lon = numOrNull('mLon');
      const base = {
        type, plot_id: val('mPlot') || null, description: val('mDesc') || null, link_url: val('mLink') || null,
        taken_at: val('mDate') || null, alt_m: numOrNull('mAlt'), heading: numOrNull('mHead'),
        youtube_id: type === 'video' ? (yt || m.youtube_id) : null
      };
      const prog = $('#dProg'); prog.hidden = false;
      const fileList = ['pano', 'photo', 'aerial'].includes(type) ? files : [];
      if (!fileList.length) {
        if (lat == null || lon == null) throw new Error('ระบุพิกัดของหมุด');
        if (!val('mTitle')) throw new Error('ใส่ชื่อรายการ');
        const row = Object.assign({}, m, base, { title: val('mTitle'), lat, lon });
        if (!row.plot_id) row.plot_id = plotAt([lon, lat]);
        prog.textContent = 'กำลังบันทึก…';
        const saved = await S.saveMedia(row);
        await reload(); toast('บันทึกแล้ว'); openMedia(saved.id, { fly: isNew }); return true;
      }
      let lastId = null;
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i], ex = exifs[i] || {};
        prog.textContent = 'กำลังเตรียมและอัปโหลด ' + (i + 1) + ' / ' + fileList.length + ' : ' + f.name;
        const pLat = ex.lat != null && fileList.length > 1 ? ex.lat : (lat != null ? lat : ex.lat);
        const pLon = ex.lon != null && fileList.length > 1 ? ex.lon : (lon != null ? lon : ex.lon);
        if (pLat == null || pLon == null) throw new Error('ไฟล์ ' + f.name + ' ไม่มีพิกัด GPS กรุณาระบุพิกัดเอง');
        const id = m.id || S.newId();
        const row = Object.assign({}, m, base, {
          id, lat: pLat, lon: pLon,
          title: fileList.length > 1 ? (val('mTitle') ? val('mTitle') + ' (' + (i + 1) + ')' : f.name.replace(/\.[^.]+$/, '')) : (val('mTitle') || f.name.replace(/\.[^.]+$/, '')),
          taken_at: base.taken_at || ex.date || null,
          alt_m: base.alt_m != null ? base.alt_m : (ex.alt != null ? ex.alt : null),
          heading: base.heading != null ? base.heading : (ex.heading != null ? ex.heading : null)
        });
        if (!row.plot_id) row.plot_id = plotAt([pLon, pLat]);
        const files2 = await prepareImage(f, type, $('#mShrink').checked);
        const dir = (row.plot_id || 'unassigned') + '/' + id + '/';
        const stamp = Date.now().toString(36);
        row.file_path = await S.upload(files2.main, dir + 'main-' + stamp + '.jpg');
        row.thumb_path = await S.upload(files2.thumb, dir + 'thumb-' + stamp + '.jpg');
        row.lite_path = files2.lite ? await S.upload(files2.lite, dir + 'lite-' + stamp + '.jpg') : null;
        const saved = await S.saveMedia(row); lastId = saved.id;
      }
      await reload(); toast(fileList.length > 1 ? 'เพิ่ม ' + fileList.length + ' รายการแล้ว' : 'บันทึกแล้ว');
      if (lastId) openMedia(lastId, { fly: true });
      return true;
    });

    const syncType = () => {
      const t = val('mType');
      const img = ['pano', 'photo', 'aerial'].includes(t);
      $('#wFile').hidden = !img; $('#wShrink').hidden = !(t === 'photo' || t === 'aerial');
      $('#mYt').closest('.f').hidden = t !== 'video';
    };
    $('#mType').onchange = syncType; syncType();
    $('#mFile').onchange = async () => {
      const files = Array.from($('#mFile').files || []); exifs = [];
      const hint = $('#mFileHint');
      let gps = 0;
      for (const f of files) {
        const ex = await readExif(f); exifs.push(ex); if (ex.lat != null) gps++;
      }
      const ex = exifs[0] || {};
      if (files.length === 1 || !val('mLat')) {
        if (ex.lat != null) { $('#mLat').value = ex.lat.toFixed(7); $('#mLon').value = ex.lon.toFixed(7); }
        if (ex.date && !val('mDate')) $('#mDate').value = ex.date.slice(0, 10);
        if (ex.alt != null && !val('mAlt')) $('#mAlt').value = Math.round(ex.alt);
        if (ex.heading != null && !val('mHead')) $('#mHead').value = Math.round(ex.heading);
      }
      if (ex.ratio && Math.abs(ex.ratio - 2) < 0.02 && val('mType') !== 'pano') { $('#mType').value = 'pano'; syncType(); }
      if (!val('mTitle') && files.length === 1) $('#mTitle').value = files[0].name.replace(/\.[^.]+$/, '');
      if (!val('mPlot') && ex.lat != null) { const pid = plotAt([ex.lon, ex.lat]); if (pid) $('#mPlot').value = pid; }
      hint.textContent = files.length ? ('อ่านพิกัด GPS ได้ ' + gps + ' จาก ' + files.length + ' ไฟล์' +
        (ex.ratio && Math.abs(ex.ratio - 2) < 0.02 ? ' · ภาพอัตราส่วน 2:1 ตั้งเป็นพาโนรามาให้แล้ว' : '') +
        (gps < files.length ? ' · ไฟล์ที่ไม่มีพิกัดจะใช้พิกัดที่กรอกด้านล่าง' : '')) : '';
    };
    $('#mPick').onclick = () => {
      dlg.close();
      startPick(ll => {
        dlg.showModal(); $('#mLat').value = ll.lat.toFixed(7); $('#mLon').value = ll.lng.toFixed(7);
        if (!val('mPlot')) { const pid = plotAt([ll.lng, ll.lat]); if (pid) $('#mPlot').value = pid; }
      }, () => dlg.showModal());
    };
    $('#mHere').onclick = () => {
      if (!navigator.geolocation) { toast('อุปกรณ์นี้ไม่รองรับการหาตำแหน่ง'); return; }
      $('#mHere').disabled = true;
      navigator.geolocation.getCurrentPosition(pos => {
        $('#mHere').disabled = false;
        $('#mLat').value = pos.coords.latitude.toFixed(7); $('#mLon').value = pos.coords.longitude.toFixed(7);
        toast('ได้ตำแหน่งแล้ว ความคลาดเคลื่อนประมาณ ' + Math.round(pos.coords.accuracy) + ' ม.');
      }, err => { $('#mHere').disabled = false; toast('หาตำแหน่งไม่ได้: ' + err.message, 5000); }, { enableHighAccuracy: true, timeout: 15000 });
    };
    $('#mCenter').onclick = () => { const c2 = map.getCenter(); $('#mLat').value = c2.lat.toFixed(7); $('#mLon').value = c2.lng.toFixed(7); };
  }
  function plotAt(pt) { const p = st.plots.find(x => x.boundary && inGeom(pt, x.boundary) && canEdit(x)); return p ? p.id : null; }

  async function readExif(file) {
    const r = {};
    try {
      await need('exifr');
      const o = await exifr.parse(file, { gps: true, xmp: true, tiff: true, exif: true, mergeOutput: true });
      if (o) {
        if (typeof o.latitude === 'number' && typeof o.longitude === 'number') { r.lat = o.latitude; r.lon = o.longitude; }
        const d = o.DateTimeOriginal || o.CreateDate || o.ModifyDate;
        if (d instanceof Date && !isNaN(d)) r.date = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
        if (o.RelativeAltitude != null) r.alt = parseFloat(o.RelativeAltitude);
        else if (o.GPSAltitude != null) r.alt = parseFloat(o.GPSAltitude);
        const yaw = o.GimbalYawDegree != null ? o.GimbalYawDegree : (o.FlightYawDegree != null ? o.FlightYawDegree : o.PoseHeadingDegrees);
        if (yaw != null && !isNaN(parseFloat(yaw))) r.heading = (parseFloat(yaw) + 360) % 360;
        const w = o.ExifImageWidth || o.ImageWidth || o.FullPanoWidthPixels, h = o.ExifImageHeight || o.ImageHeight || o.FullPanoHeightPixels;
        if (w && h) r.ratio = w / h;
      }
    } catch (e) { /* ไม่มี EXIF */ }
    if (!r.ratio) {
      try { const bm = await createImageBitmap(file); r.ratio = bm.width / bm.height; bm.close && bm.close(); } catch (e) {}
    }
    return r;
  }

  async function prepareImage(file, type, shrink) {
    const bm = await createImageBitmap(file);
    const toBlob = (w, h, crop) => new Promise((res, rej) => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      if (crop) ctx.drawImage(bm, crop[0], crop[1], crop[2], crop[3], 0, 0, w, h); else ctx.drawImage(bm, 0, 0, w, h);
      cv.toBlob(b => b ? res(b) : rej(new Error('แปลงภาพไม่สำเร็จ')), 'image/jpeg', 0.88);
    });
    const W = bm.width, H = bm.height;
    const out = {};
    if (type === 'pano') {
      out.main = W > 8192 ? await toBlob(8192, Math.round(8192 * H / W)) : file;
      out.lite = W > 4096 ? await toBlob(4096, Math.round(4096 * H / W)) : null;
      const cw = W * 0.4, ch = Math.min(H, cw / 1.6);
      out.thumb = await toBlob(480, 300, [(W - cw) / 2, (H - ch) / 2, cw, ch]);
    } else {
      const max = Math.max(W, H);
      out.main = shrink && max > 2560 ? await toBlob(Math.round(W * 2560 / max), Math.round(H * 2560 / max)) : file;
      const s = 480 / max; out.thumb = await toBlob(Math.round(W * s), Math.round(H * s));
    }
    bm.close && bm.close();
    return out;
  }

  // ---------------- วาดขอบเขต / เลือกตำแหน่ง ----------------
  function setMode(mode, text) {
    st.mode = mode;
    document.body.classList.toggle('mode-draw', mode === 'draw');
    document.body.classList.toggle('mode-pick', mode === 'pick');
    $('#modebar').hidden = !mode; $('#modeText').textContent = text || '';
    $('#mUndo').hidden = $('#mDone').hidden = mode !== 'draw';
    if (mode) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
  }
  function startDraw(existing, onDone) {
    const ring = existing && rings(existing)[0] ? rings(existing)[0][0].slice(0, -1).map(p => p.slice(0, 2)) : [];
    st.draw = { pts: ring, onDone, drag: null };
    if (rings(existing).length > 1) toast('แปลงนี้มีหลายรูป จะแก้ได้เฉพาะรูปแรก', 5000);
    setMode('draw', drawText()); renderDraw();
  }
  function drawText() {
    const n = st.draw ? st.draw.pts.length : 0;
    let t = 'คลิกบนแผนที่เพื่อวางจุดมุมแปลง · ลากจุดเพื่อย้าย · คลิกขวาที่จุดเพื่อลบ';
    if (n >= 3) {
      const ring = st.draw.pts.concat([st.draw.pts[0]]);
      t = n + ' จุด · พื้นที่ ' + thaiArea(ringArea(ring)) + ' · ' + t;
    } else t = n + ' จุด (ต้องมีอย่างน้อย 3) · ' + t;
    return t;
  }
  function renderDraw() {
    const d = st.draw; const feats = [];
    if (d) {
      if (d.pts.length >= 3) feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [d.pts.concat([d.pts[0]])] } });
      else if (d.pts.length === 2) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: d.pts } });
      d.pts.forEach((p, i) => feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: { i } }));
      $('#modeText').textContent = drawText();
      $('#mDone').disabled = d.pts.length < 3;
    }
    map.getSource('draw').setData(fc(feats));
  }
  function endDraw() { st.draw = null; renderDraw(); setMode(null); }
  function setupDrawEvents() {
    map.on('click', e => {
      if (Date.now() - st.markerClickAt < 400) return;
      if (st.mode === 'pick' && st.pick) { const cb = st.pick.cb; st.pick = null; setMode(null); cb(e.lngLat); return; }
      if (st.mode !== 'draw' || !st.draw) return;
      if (map.queryRenderedFeatures(e.point, { layers: ['draw-vertex'] }).length) return;
      st.draw.pts.push([+e.lngLat.lng.toFixed(7), +e.lngLat.lat.toFixed(7)]); renderDraw();
    });
    const begin = e => {
      if (st.mode !== 'draw' || !st.draw) return;
      e.preventDefault(); st.draw.drag = e.features[0].properties.i; map.dragPan.disable();
    };
    map.on('mousedown', 'draw-vertex', begin);
    map.on('touchstart', 'draw-vertex', e => { if (e.points && e.points.length === 1) begin(e); });
    const move = e => { if (st.draw && st.draw.drag != null) { st.draw.pts[st.draw.drag] = [+e.lngLat.lng.toFixed(7), +e.lngLat.lat.toFixed(7)]; renderDraw(); } };
    map.on('mousemove', move); map.on('touchmove', move);
    const end = () => { if (st.draw && st.draw.drag != null) { st.draw.drag = null; map.dragPan.enable(); } };
    map.on('mouseup', end); map.on('touchend', end);
    map.on('contextmenu', 'draw-vertex', e => {
      if (st.mode !== 'draw') return;
      st.draw.pts.splice(e.features[0].properties.i, 1); renderDraw();
    });
    map.on('mouseenter', 'draw-vertex', () => { if (st.mode === 'draw') map.getCanvas().style.cursor = 'move'; });
    map.on('mouseleave', 'draw-vertex', () => { map.getCanvas().style.cursor = ''; });
  }
  $('#mUndo').onclick = () => { if (st.draw) { st.draw.pts.pop(); renderDraw(); } };
  $('#mDone').onclick = () => {
    if (!st.draw || st.draw.pts.length < 3) return;
    const g = { type: 'Polygon', coordinates: [st.draw.pts.concat([st.draw.pts[0]])] };
    const cb = st.draw.onDone; endDraw(); cb(g);
  };
  $('#mCancel').onclick = () => {
    if (st.mode === 'draw') endDraw();
    else if (st.mode === 'pick') { const c = st.pick && st.pick.cancel; st.pick = null; setMode(null); if (c) c(); }
  };
  document.addEventListener('keydown', e => {
    if (!st.mode || dlg.open) return;
    if (e.key === 'Escape') $('#mCancel').click();
    if (e.key === 'Enter' && st.mode === 'draw') $('#mDone').click();
    if ((e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) && st.mode === 'draw') { e.preventDefault(); $('#mUndo').click(); }
  });
  function startPick(cb, cancel) { st.pick = { cb, cancel }; setMode('pick', 'คลิกบนแผนที่ตรงตำแหน่งของหมุด'); }

  // ---------------- นำเข้า / ส่งออก ----------------
  let importCb = null;
  function pickImport(cb) { importCb = cb; $('#importFile').value = ''; $('#importFile').click(); }
  $('#importFile').onchange = async () => {
    const f = $('#importFile').files[0]; if (!f || !importCb) return;
    try { const fcol = await parseGeoFile(f); await importCb(fcol); }
    catch (e) { toast('อ่านไฟล์ไม่สำเร็จ: ' + e.message, 6000); }
  };
  async function parseGeoFile(f) {
    const name = f.name.toLowerCase();
    let out;
    if (name.endsWith('.kml')) { await need('toGeoJSON'); out = toGeoJSON.kml(new DOMParser().parseFromString(await f.text(), 'text/xml')); }
    else if (name.endsWith('.zip')) { await need('shp'); const r = await shp(await f.arrayBuffer()); out = Array.isArray(r) ? fc(r.flatMap(x => x.features)) : r; }
    else { const j = JSON.parse(await f.text()); out = j.type === 'FeatureCollection' ? j : (j.type === 'Feature' ? fc([j]) : fc([{ type: 'Feature', geometry: j, properties: {} }])); }
    // ตัดค่าความสูง (Z) ทิ้ง
    const strip = c => typeof c[0] === 'number' ? c.slice(0, 2) : c.map(strip);
    out.features.forEach(ft => { if (ft.geometry && ft.geometry.coordinates) ft.geometry.coordinates = strip(ft.geometry.coordinates); });
    return out;
  }
  $('#eImport').onclick = () => pickImport(async fcol => {
    const polys = fcol.features.filter(f => f.geometry && /Polygon/.test(f.geometry.type));
    if (!polys.length) { toast('ไม่พบรูปแปลง (Polygon) ในไฟล์', 5000); return; }
    const keys = polys[0].properties ? Object.keys(polys[0].properties) : [];
    const guess = keys.find(k => /^(name|plot_?name|ชื่อ)/i.test(k)) || keys[0] || '';
    const sel = k => '<select id="' + k + '"><option value="">—</option>' + keys.map(x => '<option' + (x === guess && k === 'iName' ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
    openDialog('นำเข้าแปลงจากไฟล์',
      '<p class="f full desc">พบรูปแปลง ' + polys.length + ' รูป เลือกคอลัมน์ในไฟล์ที่ใช้เป็นข้อมูลแปลง</p>' +
      '<div class="f"><label for="iName">ชื่อแปลง</label>' + sel('iName') + '</div>' +
      '<div class="f"><label for="iOwner">ชื่อเจ้าของ</label>' + sel('iOwner') + '</div>' +
      '<div class="f"><label for="iCode">รหัสแปลง</label>' + sel('iCode') + '</div>' +
      '<div class="f full check"><input type="checkbox" id="iPub"><label for="iPub">เผยแพร่ทันที (ไม่ติ๊ก = ซ่อนไว้ตรวจก่อน)</label></div>',
      'นำเข้า ' + polys.length + ' แปลง', async () => {
        const kN = val('iName'), kO = val('iOwner'), kC = val('iCode');
        const prog = $('#dProg'); prog.hidden = false;
        for (let i = 0; i < polys.length; i++) {
          const ft = polys[i], pr = ft.properties || {};
          prog.textContent = 'กำลังบันทึก ' + (i + 1) + ' / ' + polys.length;
          const c = centroid(ft.geometry);
          await S.savePlot({
            name: (kN && pr[kN] != null ? String(pr[kN]) : 'แปลงนำเข้า ' + (i + 1)), owner_name: kO && pr[kO] != null ? String(pr[kO]) : null,
            code: kC && pr[kC] != null ? String(pr[kC]) : null, boundary: ft.geometry,
            center_lon: c ? +c[0].toFixed(7) : null, center_lat: c ? +c[1].toFixed(7) : null, is_published: $('#iPub').checked
          });
        }
        await reload(); toast('นำเข้า ' + polys.length + ' แปลงแล้ว'); openList();
        const all = st.plots.flatMap(plotCoords); if (all.length > 1) map.fitBounds(bboxOf(all), { padding: padding() });
        return true;
      });
  });
  $('#eExport').onclick = () => {
    const feats = st.plots.filter(p => p.boundary).map(p => {
      const pr = Object.assign({}, p); delete pr.boundary; delete pr._orthoOpacity; pr.layer = 'plot'; pr.area_sqm = geomArea(p.boundary);
      return { type: 'Feature', geometry: p.boundary, properties: pr };
    }).concat(st.media.map(m => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
      properties: Object.assign({ layer: 'media', file_url: S.url(m.file_path) }, m) })));
    const blob = new Blob([JSON.stringify(fc(feats), null, 1)], { type: 'application/geo+json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'coffee-plots-' + new Date().toISOString().slice(0, 10) + '.geojson'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ---------------- ปุ่มแก้ไขหลัก ----------------
  $('#eNewPlot').onclick = () => {
    toast('วาดขอบเขตแปลงบนแผนที่ หรือกด "ยกเลิก" เพื่อกรอกข้อมูลโดยไม่วาด', 4500);
    st.draw = { pts: [], drag: null, onDone: g => plotForm(null, { boundary: g }) };
    setMode('draw', drawText()); renderDraw();
    const cancel = $('#mCancel').onclick;
    $('#mCancel').onclick = () => {
      $('#mCancel').onclick = cancel;
      const wasDraw = st.mode === 'draw'; endDraw();
      if (wasDraw) { const c = map.getCenter(); plotForm(null, { center: [+c.lng.toFixed(7), +c.lat.toFixed(7)] }); }
    };
    const done = $('#mDone').onclick;
    $('#mDone').onclick = () => { $('#mCancel').onclick = cancel; $('#mDone').onclick = done; done(); };
  };
  $('#eNewMedia').onclick = () => {
    const v = st.view; let pid = null;
    if (v && v.kind === 'plot') pid = v.id;
    if (v && v.kind === 'media') pid = (st.media.find(m => m.id === v.id) || {}).plot_id;
    mediaForm({ plot_id: pid });
  };
})();
