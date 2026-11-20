// Fixed scenes used to produce the entry's screenshots without any clicking:
//   ?shot=cover  — one finished cover filling the whole window
//   ?shot=editor — the editor with a composed scene loaded
// Query parameters choose the size, layout, grade, sample photos and lettering, e.g.
//   ?shot=cover&size=1080x1350&layout=mosaic&grade=sunset&photos=neon,boulevard,boat,pier
// Once the scene is painted with fonts and photos in place, window.__shotReady is set
// so the screenshot driver knows the frame is final.
export async function runScene(kind, query, applyScene) {
  if (kind === 'cover') document.body.classList.add('shot-cover');
  const scene = {
    size: query.get('size') ?? '1080x1350',
    layout: query.get('layout') ?? 'mosaic',
    grade: query.get('grade') ?? 'sunset',
    photos: (query.get('photos') ?? 'boulevard,neon,pier,boat').split(',').map((s) => s.trim()).filter(Boolean),
    title: query.get('title') ?? 'NEON VICE',
    tagline: query.get('tagline') ?? 'SUNSET · NEON · TROUBLE',
    foot: query.get('foot') ?? 'NEON SHORES · EST. 2026',
    font: query.get('font') ?? 'anton',
    fill: query.get('fill') ?? 'sunset',
    place: query.get('pos') ?? 'top',
    sun: query.get('sun') === '1',
    grain: query.get('grain') !== '0',
    selected: Number(query.get('selected') ?? 0),
  };
  if (query.get('assign')) scene.assign = query.get('assign').split(',').map(Number);
  if (query.get('oy')) scene.oyList = query.get('oy').split(',').map(Number);
  await applyScene(scene);
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('80px Anton'),
      document.fonts.load('40px "Bebas Neue"'),
    ]).catch(() => {});
  }
  if (document.fonts?.ready) await document.fonts.ready;
  const { redraw } = await import('./editor.js');
  redraw();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
