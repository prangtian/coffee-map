// แผนที่ฐาน: OpenFreeMap (OpenStreetMap vector, ใช้ฟรีไม่ต้องมีคีย์)
// + ภูมิประเทศ AWS Terrain Tiles + ภาพดาวเทียม Esri World Imagery
// โทนสีอิงภาพตัวอย่าง: พื้นเขียวมะกอก ป่าเขียวเข้มยกนูน ถนนสีขาวนวล อาคารสีม่วงอมฟ้า
(function () {
  const C = {
    ground: '#76804f',
    farmland: '#8b9a5c',
    grass: '#a9c07e',
    wood: '#3f7a2c',
    woodTop: '#4a8a33',
    residential: '#7f8366',
    water: '#4d86ba',
    waterLine: '#5b93c4',
    road: '#eef1ea',
    roadMinor: '#dfe5d8',
    path: '#d8ddc8',
    building: '#a3abd9',
    label: '#1f2a14',
    halo: 'rgba(240,244,232,0.85)'
  };

  const TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

  window.buildMapStyle = function () {
    return {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: {
        omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
        sat: {
          type: 'raster', tileSize: 256, maxzoom: 19,
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          attribution: 'ภาพดาวเทียม © Esri, Maxar, Earthstar Geographics'
        },
        dem: {
          type: 'raster-dem', tiles: [TERRAIN], encoding: 'terrarium', tileSize: 256, maxzoom: 15,
          attribution: 'ภูมิประเทศ: AWS Terrain Tiles'
        },
        demShade: { type: 'raster-dem', tiles: [TERRAIN], encoding: 'terrarium', tileSize: 256, maxzoom: 15 }
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': C.ground } },
        { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } },

        { id: 'landuse-res', type: 'fill', source: 'omt', 'source-layer': 'landuse',
          filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'commercial', 'industrial', 'retail']]],
          paint: { 'fill-color': C.residential, 'fill-opacity': 0.8 } },
        { id: 'landcover-farm', type: 'fill', source: 'omt', 'source-layer': 'landcover',
          filter: ['==', ['get', 'class'], 'farmland'], paint: { 'fill-color': C.farmland } },
        { id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
          filter: ['in', ['get', 'class'], ['literal', ['grass', 'wetland']]], paint: { 'fill-color': C.grass } },
        { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
          paint: { 'fill-color': C.grass, 'fill-opacity': 0.55 } },
        { id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
          filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': C.wood } },

        { id: 'hillshade', type: 'hillshade', source: 'demShade',
          paint: { 'hillshade-shadow-color': 'rgba(20,32,10,0.55)', 'hillshade-highlight-color': 'rgba(255,255,240,0.25)',
                   'hillshade-accent-color': 'rgba(20,32,10,0.3)', 'hillshade-exaggeration': 0.45 } },

        { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': C.water } },
        { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
          paint: { 'line-color': C.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 3] } },

        { id: 'road-path', type: 'line', source: 'omt', 'source-layer': 'transportation',
          filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]], minzoom: 13,
          paint: { 'line-color': C.path, 'line-width': 1, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } },
        { id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation',
          filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': C.roadMinor, 'line-opacity': 0.85,
                   'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 1.6, 17, 5] } },
        { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation',
          filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': C.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 12, 2.2, 16, 8] } },

        { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13,
          paint: { 'fill-color': C.building } },
        { id: 'building-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13,
          layout: { visibility: 'none' },
          paint: { 'fill-extrusion-color': C.building,
                   'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
                   'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                   'fill-extrusion-opacity': 0.9 } },
        { id: 'wood-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'landcover',
          filter: ['==', ['get', 'class'], 'wood'], layout: { visibility: 'none' },
          paint: { 'fill-extrusion-color': C.woodTop, 'fill-extrusion-height': 14, 'fill-extrusion-opacity': 0.85 } },

        { id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place',
          filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet', 'suburb']]],
          layout: {
            'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['match', ['get', 'class'], 'city', 15, 'town', 13, 11]
          },
          paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } },
        { id: 'peak-label', type: 'symbol', source: 'omt', 'source-layer': 'mountain_peak', minzoom: 11,
          layout: {
            'text-field': ['concat', '▲ ', ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ''], ' ', ['to-string', ['coalesce', ['get', 'ele'], '']]],
            'text-font': ['Noto Sans Italic'], 'text-size': 10, 'text-offset': [0, 0.2]
          },
          paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.2 } }
      ]
    };
  };

  // layer ที่ซ่อนเมื่อเปิดภาพดาวเทียม
  window.VECTOR_FILL_LAYERS = ['landuse-res', 'landcover-farm', 'landcover-grass', 'park', 'landcover-wood',
    'hillshade', 'waterway', 'building', 'water'];
  window.TERRAIN_SOURCE = 'dem';
})();
