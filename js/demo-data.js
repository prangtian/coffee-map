// ข้อมูลตัวอย่างสำหรับโหมดสาธิต — พิกัดเป็นตำแหน่งสมมติ ยังไม่ใช่ที่ตั้งจริงของแปลง
window.DEMO_DATA = {
  plots: [{
    id: 'demo-plot-1', code: 'CF-001', name: 'แปลงกาแฟตัวอย่าง (พิกัดสมมติ)', owner_name: 'ตัวอย่าง เจ้าของแปลง',
    village: '—', subdistrict: '—', district: '—', province: '—',
    variety: 'อาราบิก้า', planted_year: null, tree_count: null, elevation_m: null,
    shade_trees: 'ไม้ป่าดั้งเดิม', yield_kg: null,
    description: 'ข้อมูลชุดนี้เป็นตัวอย่างสำหรับทดลองใช้งาน พาโนรามา 2 จุดมาจากภาพ DJI Mini 2 ที่ส่งมา ส่วนพิกัดและขอบเขตแปลงเป็นตำแหน่งสมมติ',
    boundary: { type: 'Polygon', coordinates: [[[98.9493, 19.3009], [98.9505, 19.3012], [98.9512, 19.3003], [98.9508, 19.2993], [98.9496, 19.2991], [98.9489, 19.2999], [98.9493, 19.3009]]] },
    center_lon: 98.95005, center_lat: 19.30015,
    ortho_url: null, ortho_type: null, ortho_bounds: null, ortho_date: null, is_published: true
  }],
  media: [
    { id: 'demo-m1', plot_id: 'demo-plot-1', type: 'pano', title: 'พาโนรามาเหนือแนวป่า', description: 'มองเห็นแนวป่าดิบเขาและแปลงปลูกบนเนินทั้งสองฝั่ง',
      taken_at: null, lon: 98.9498, lat: 19.3004, alt_m: null, heading: null,
      file_path: 'demo/pano-1.jpg', thumb_path: 'demo/pano-1-thumb.jpg' },
    { id: 'demo-m2', plot_id: 'demo-plot-1', type: 'pano', title: 'พาโนรามากลางแปลงกาแฟ', description: 'แปลงกาแฟใต้ร่มไม้ มีกระท่อมพักอยู่ริมแปลง',
      taken_at: null, lon: 98.9505, lat: 19.2998, alt_m: null, heading: null,
      file_path: 'demo/pano-2.jpg', thumb_path: 'demo/pano-2-thumb.jpg' },
    { id: 'demo-m3', plot_id: 'demo-plot-1', type: 'info', title: 'หมุดข้อมูลตัวอย่าง', description: 'ใช้หมุดชนิดนี้บันทึกข้อมูลอื่นๆ เช่น จุดเก็บตัวอย่างดิน แหล่งน้ำ หรือจุดตากกาแฟ',
      taken_at: null, lon: 98.9494, lat: 19.2996 }
  ]
};
