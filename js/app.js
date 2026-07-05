(function () {
  const CONFIG = window.MOTO_MAP_CONFIG || {};
  const TYPE_META = {
    official_boundary: { label: "官方边界提示", color: "#e5484d" },
    bridge_tunnel: { label: "桥隧/跨江入口", color: "#7c4dff" },
    risk_road: { label: "重点边界道路", color: "#ff8a3d" },
    camera_verified: { label: "已核实电子眼", color: "#a11d33" },
    camera_unverified: { label: "待核实电子眼", color: "#f97316" },
    user_report: { label: "用户反馈待核实", color: "#2f80ed" }
  };
  const QUICK_ROUTES = {
    "wuyi-meixi": [[112.9769,28.1977],[112.8900,28.1900]],
    "rail-south": [[113.0144,28.1940],[113.0656,28.1487]],
    "yuelu-kaifu": [[112.9300,28.2100],[113.0100,28.2550]]
  };

  let map, infoWindow, engine = "demo", pickMode = null;
  let points = [], zones = [], sources = [], markers = [], overlays = [];
  let activeTypes = new Set(Object.keys(TYPE_META));
  let keyword = "";

  const els = {
    loading: document.getElementById("loading"), mapNotice: document.getElementById("mapNotice"), filters: document.getElementById("filters"), stats: document.getElementById("stats"), pointList: document.getElementById("pointList"), searchInput: document.getElementById("searchInput"), togglePanel: document.getElementById("togglePanel"), sidePanel: document.getElementById("sidePanel"), dataVersion: document.getElementById("dataVersion"), totalCount: document.getElementById("totalCount"), riskRadius: document.getElementById("riskRadius"), engineMode: document.getElementById("engineMode"), visibleCount: document.getElementById("visibleCount"), startLng: document.getElementById("startLng"), startLat: document.getElementById("startLat"), endLng: document.getElementById("endLng"), endLat: document.getElementById("endLat"), routeResult: document.getElementById("routeResult"), pickStart: document.getElementById("pickStart"), pickEnd: document.getElementById("pickEnd"), checkRoute: document.getElementById("checkRoute")
  };

  function setNotice(message, level = "info") { els.mapNotice.textContent = message || ""; els.mapNotice.className = `map-notice ${level}`; }
  function hideLoading() { if (els.loading) els.loading.style.display = "none"; }
  async function fetchJSON(path) { const res = await fetch(path, { cache: "no-store" }); if (!res.ok) throw new Error(`读取${path}失败：${res.status}`); return res.json(); }
  function hasAmapKey() { return !!CONFIG.amapKey && CONFIG.amapKey !== "YOUR_AMAP_JS_KEY"; }

  function loadAMapScript() {
    return new Promise((resolve, reject) => {
      if (window.AMap) return resolve(window.AMap);
      if (!hasAmapKey()) return reject(new Error("未填写高德Web端JS API Key，已进入原型预览模式"));
      if (CONFIG.securityJsCode) window._AMapSecurityConfig = { securityJsCode: CONFIG.securityJsCode };
      const cbName = "__amapInitCallback" + Date.now();
      window[cbName] = function () { resolve(window.AMap); delete window[cbName]; };
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(CONFIG.amapKey)}&plugin=AMap.Scale,AMap.ToolBar,AMap.Geolocation&callback=${cbName}`;
      script.onerror = () => reject(new Error("高德地图脚本加载失败，已进入原型预览模式"));
      document.head.appendChild(script);
    });
  }

  function initAMap() {
    engine = "amap";
    map = new AMap.Map("map", { center: CONFIG.mapCenter || [112.9388,28.2282], zoom: CONFIG.mapZoom || 11, resizeEnable: true, viewMode: "2D", mapStyle: CONFIG.mapStyle || "amap://styles/normal" });
    infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30), closeWhenClickMap: true });
    map.addControl(new AMap.Scale()); map.addControl(new AMap.ToolBar({ position: { right: "12px", top: "76px" } }));
    map.on("click", e => handleMapPick([e.lnglat.lng, e.lnglat.lat]));
    addLocateControl();
  }

  function addLocateControl() {
    const btn = document.createElement("button"); btn.className = "locate-btn"; btn.textContent = "定位到我"; btn.type = "button";
    btn.onclick = () => { AMap.plugin("AMap.Geolocation", () => { const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 8000, zoomToAccuracy: true }); geo.getCurrentPosition((status, result) => { if (status === "complete") { map.setCenter([result.position.lng, result.position.lat]); map.setZoom(14); } else setNotice("定位失败：请检查浏览器定位权限。", "warn"); }); }); };
    document.querySelector(".map-shell").appendChild(btn);
  }

  function initDemoMap() {
    engine = "demo";
    const el = document.getElementById("map");
    el.className = "demo-map"; el.innerHTML = `<div class="demo-canvas"><div class="river"></div><div class="demo-glow one"></div><div class="demo-glow two"></div><span class="demo-label center">CHANGSHA</span><span class="demo-label river-label">湘江</span></div><svg class="demo-road-svg" viewBox="0 0 1000 700" preserveAspectRatio="none"><path class="demo-road" d="M30,150 C180,120 240,230 405,214 C570,195 650,110 970,134"/><path class="demo-road" d="M82,602 C220,440 330,420 522,450 C700,478 780,610 968,570"/><path class="demo-road" d="M120,88 C180,270 270,320 365,675"/><path class="demo-road" d="M705,40 C640,190 628,350 790,680"/><path class="demo-road thin" d="M18,334 C180,300 326,362 503,330 C690,296 820,330 990,286"/><path class="demo-road thin" d="M238,36 C350,210 420,310 570,652"/></svg><svg id="demoSvg" viewBox="0 0 1000 700" preserveAspectRatio="none"></svg><div id="demoLayer"></div>`;
    el.addEventListener("click", e => {
      if (!pickMode || e.target.classList.contains("demo-point")) return;
      const rect = el.getBoundingClientRect();
      const lngLat = screenToLngLat([(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]);
      handleMapPick(lngLat);
    });
  }

  function renderZones() { engine === "amap" ? renderAmapZones() : renderDemoZones(); }
  function renderAmapZones() {
    overlays.forEach(o => o.setMap && o.setMap(null)); overlays = [];
    zones.forEach(zone => {
      let overlay;
      if (zone.geometryType === "polygon") overlay = new AMap.Polygon({ path: zone.path, strokeColor: zone.strokeColor || "#dc2626", strokeWeight: zone.strokeWeight || 3, strokeOpacity: .9, fillColor: zone.fillColor || "#fecaca", fillOpacity: zone.fillOpacity ?? .25, zIndex: 10 });
      if (zone.geometryType === "polyline") overlay = new AMap.Polyline({ path: zone.path, strokeColor: zone.strokeColor || "#f59e0b", strokeWeight: zone.strokeWeight || 5, strokeOpacity: .85, zIndex: 15 });
      if (overlay) { overlay.on("click", () => openZoneInfo(zone)); map.add(overlay); overlays.push(overlay); }
    });
  }
  function renderDemoZones() {
    const svg = document.getElementById("demoSvg"); if (!svg) return; svg.innerHTML = "";
    zones.forEach(zone => {
      const pts = zone.path.map(ll => { const [x,y] = lngLatToScreen(ll); return `${x*1000},${y*700}`; }).join(" ");
      const node = document.createElementNS("http://www.w3.org/2000/svg", zone.geometryType === "polygon" ? "polygon" : "polyline");
      node.setAttribute("points", pts); node.setAttribute("fill", zone.geometryType === "polygon" ? (zone.fillColor || "#fecaca") : "none"); node.setAttribute("fill-opacity", zone.fillOpacity ?? .2); node.setAttribute("stroke", zone.strokeColor || "#ff8a3d"); node.setAttribute("stroke-width", zone.strokeWeight || 4); node.setAttribute("filter", "drop-shadow(0 7px 12px rgba(0,0,0,.25))"); node.setAttribute("stroke-linejoin", "round"); node.setAttribute("stroke-linecap", "round"); node.style.cursor = "pointer"; node.addEventListener("click", e => { e.stopPropagation(); openZoneInfo(zone); }); svg.appendChild(node);
    });
  }

  function openZoneInfo(zone) {
    const html = `<div class="info"><h3>${esc(zone.name)}</h3><p><b>类型：</b>${esc(zone.typeLabel || "区域/线路")}</p><p><b>说明：</b>${esc(zone.note || "")}</p><p><b>可信度：</b>${esc(zone.confidence || "")}</p><p><b>更新时间：</b>${esc(zone.updatedAt || "")}</p></div>`;
    if (engine === "amap") { const first = zone.path && zone.path[0] ? zone.path[0] : CONFIG.mapCenter; infoWindow.setContent(html); infoWindow.open(map, first); }
    else showDemoInfo(html);
  }

  function renderFilters() {
    els.filters.innerHTML = "";
    Object.entries(TYPE_META).forEach(([type, meta]) => {
      const count = points.filter(p => p.type === type).length;
      const label = document.createElement("label"); label.className = "filter-chip";
      label.innerHTML = `<input type="checkbox" data-type="${type}" ${count ? "checked" : ""} ${count ? "" : "disabled"}/><span class="dot" style="background:${meta.color}"></span><span>${meta.label}</span><em>${count}</em>`;
      if (!count) activeTypes.delete(type); els.filters.appendChild(label);
    });
    els.filters.addEventListener("change", e => { const input = e.target.closest("input[data-type]"); if (!input) return; input.checked ? activeTypes.add(input.dataset.type) : activeTypes.delete(input.dataset.type); renderPoints(); });
  }
  function matchPoint(p) { const text = `${p.name || ""} ${p.direction || ""} ${p.note || ""} ${p.source || ""}`.toLowerCase(); return activeTypes.has(p.type) && (!keyword || text.includes(keyword.toLowerCase())); }

  function renderPoints() { engine === "amap" ? renderAmapPoints() : renderDemoPoints(); const visible = points.filter(matchPoint); renderStats(visible); renderPointList(visible); }
  function renderAmapPoints() {
    markers.forEach(m => m.setMap(null)); markers = [];
    points.filter(matchPoint).forEach(point => { const meta = TYPE_META[point.type] || TYPE_META.user_report; const marker = new AMap.Marker({ position: [point.lng, point.lat], title: point.name, offset: new AMap.Pixel(-9,-9), content: `<div class="marker" style="--marker-color:${meta.color}" aria-label="${esc(point.name)}"></div>` }); marker.on("click", () => openPointInfo(point)); marker.setMap(map); markers.push(marker); });
  }
  function renderDemoPoints() {
    const layer = document.getElementById("demoLayer"); if (!layer) return; layer.innerHTML = "";
    points.filter(matchPoint).forEach(point => { const meta = TYPE_META[point.type] || TYPE_META.user_report; const [x,y] = lngLatToScreen([point.lng, point.lat]); const d = document.createElement("button"); d.type = "button"; d.className = "demo-point"; d.style.left = `${x*100}%`; d.style.top = `${y*100}%`; d.style.setProperty("--marker-color", meta.color); d.title = point.name; d.onclick = e => { e.stopPropagation(); openPointInfo(point); }; layer.appendChild(d); });
  }

  function openPointInfo(point) {
    const meta = TYPE_META[point.type] || TYPE_META.user_report; const position = `${point.lng},${point.lat}`;
    const markerUrl = `https://uri.amap.com/marker?position=${position}&name=${encodeURIComponent(point.name)}&src=${encodeURIComponent(CONFIG.appName || "moto-map")}&coordinate=gaode&callnative=1`;
    const navUrl = `https://uri.amap.com/navigation?to=${position},${encodeURIComponent(point.name)}&mode=car&src=${encodeURIComponent(CONFIG.appName || "moto-map")}&coordinate=gaode&callnative=1`;
    const html = `<div class="info"><h3>${esc(point.name)}</h3><p><b>类型：</b><span style="color:${meta.color}">${meta.label}</span></p><p><b>方向/位置：</b>${esc(point.direction || "未填写")}</p><p><b>可信度：</b>${esc(point.confidence || "待核实")}</p><p><b>来源：</b>${esc(resolveSource(point.source))}</p><p><b>备注：</b>${esc(point.note || "")}</p><p><b>更新时间：</b>${esc(point.updatedAt || "")}</p><div class="info-actions"><a href="${markerUrl}" target="_blank" rel="noopener">高德查看</a><a href="${navUrl}" target="_blank" rel="noopener">导航到该点</a><button type="button" data-copy="${position}">复制坐标</button></div></div>`;
    if (engine === "amap") { infoWindow.setContent(html); infoWindow.open(map, [point.lng, point.lat]); } else showDemoInfo(html);
    setTimeout(bindCopyButtons, 0);
  }
  function bindCopyButtons() { document.querySelectorAll("button[data-copy]").forEach(btn => { btn.onclick = async () => { try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = "已复制"; } catch { btn.textContent = "复制失败"; } }; }); }
  function showDemoInfo(html) { document.querySelectorAll(".demo-info").forEach(n => n.remove()); const box = document.createElement("div"); box.className = "demo-info"; box.innerHTML = `<button class="close" type="button">×</button>${html}`; box.querySelector(".close").onclick = () => box.remove(); document.getElementById("map").appendChild(box); }

  function renderStats(visible) {
    const byType = {}; points.forEach(p => byType[p.type] = (byType[p.type] || 0) + 1);
    const rows = [["总点位", points.length],["当前显示", visible.length],["官方/边界", (byType.official_boundary || 0) + (byType.risk_road || 0)],["待核实", (byType.camera_unverified || 0) + (byType.user_report || 0)]];
    els.stats.innerHTML = rows.map(([k,v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    els.visibleCount.textContent = `${visible.length} / ${points.length}`;
  }
  function renderPointList(visible) {
    els.pointList.innerHTML = "";
    visible.slice(0, 120).forEach(point => { const meta = TYPE_META[point.type] || TYPE_META.user_report; const item = document.createElement("button"); item.className = "point-item"; item.type = "button"; item.innerHTML = `<span class="dot" style="background:${meta.color}"></span><span class="point-text"><b>${esc(point.name)}</b><small>${esc(point.note || point.direction || "")}</small></span>`; item.onclick = () => { focusPoint(point); openPointInfo(point); if (window.matchMedia("(max-width: 900px)").matches) els.sidePanel.classList.remove("open"); }; els.pointList.appendChild(item); });
  }
  function focusPoint(point) { if (engine === "amap") map.setZoomAndCenter(15, [point.lng, point.lat]); }
  function resolveSource(id) { const s = sources.find(x => x.id === id); return s ? s.name : (id || "未填写"); }

  function bindUI() {
    els.searchInput.addEventListener("input", e => { keyword = e.target.value.trim(); renderPoints(); });
    els.togglePanel.addEventListener("click", () => els.sidePanel.classList.toggle("open"));
    els.pickStart.addEventListener("click", () => { pickMode = "start"; setNotice("请在地图上点击起点。", "warn"); });
    els.pickEnd.addEventListener("click", () => { pickMode = "end"; setNotice("请在地图上点击终点。", "warn"); });
    els.checkRoute.addEventListener("click", runRouteCheck);
    document.querySelectorAll(".quick-routes button[data-route]").forEach(btn => btn.addEventListener("click", () => { const r = QUICK_ROUTES[btn.dataset.route]; setRouteInputs(r[0], r[1]); runRouteCheck(); }));
  }
  function handleMapPick(ll) { if (!pickMode) return; if (pickMode === "start") { els.startLng.value = ll[0].toFixed(6); els.startLat.value = ll[1].toFixed(6); } if (pickMode === "end") { els.endLng.value = ll[0].toFixed(6); els.endLat.value = ll[1].toFixed(6); } setNotice(`${pickMode === "start" ? "起点" : "终点"}已设置：${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}`, "warn"); pickMode = null; }
  function setRouteInputs(a,b){ els.startLng.value=a[0]; els.startLat.value=a[1]; els.endLng.value=b[0]; els.endLat.value=b[1]; }
  function runRouteCheck() {
    const a = [parseFloat(els.startLng.value), parseFloat(els.startLat.value)], b = [parseFloat(els.endLng.value), parseFloat(els.endLat.value)];
    if (a.some(Number.isNaN) || b.some(Number.isNaN)) { els.routeResult.textContent = "请先填写起点和终点经纬度，或使用快捷路线。"; return; }
    const radius = Number(CONFIG.riskRadiusMeters || 350);
    const hits = points.filter(p => ["official_boundary","bridge_tunnel","risk_road","camera_verified","camera_unverified","user_report"].includes(p.type)).map(p => ({ point:p, dist: distancePointToSegmentMeters([p.lng,p.lat], a, b) })).filter(x => x.dist <= radius).sort((x,y)=>x.dist-y.dist);
    const inZone = routeTouchesBanZone(a,b);
    drawRoute(a,b);
    const navUrl = `https://uri.amap.com/navigation?from=${a[0]},${a[1]},起点&to=${b[0]},${b[1]},终点&mode=car&src=${encodeURIComponent(CONFIG.appName || "moto-map")}&coordinate=gaode&callnative=1`;
    if (!hits.length && !inZone) { els.routeResult.innerHTML = `直线粗测：未发现${radius}米内的已录入风险点。<br><a href="${navUrl}" target="_blank" rel="noopener">打开高德查看路线</a>`; return; }
    els.routeResult.innerHTML = `<b>直线粗测发现风险：</b><br>${inZone ? "可能穿过禁摩合围区域。<br>" : ""}${hits.slice(0,8).map(x => `· ${esc(x.point.name)}，约${Math.round(x.dist)}米`).join("<br>")}${hits.length>8?`<br>另有${hits.length-8}个点位未展示。`:""}<br><a href="${navUrl}" target="_blank" rel="noopener">打开高德查看路线</a>`;
  }
  function drawRoute(a,b) {
    if (engine === "amap") { overlays.filter(o=>o.__route).forEach(o=>o.setMap(null)); overlays=overlays.filter(o=>!o.__route); const line = new AMap.Polyline({ path:[a,b], strokeColor:"#2563eb", strokeWeight:5, strokeOpacity:.9, zIndex:30 }); line.__route=true; map.add(line); overlays.push(line); map.setFitView([line]); }
    else { document.querySelectorAll(".route-line").forEach(n=>n.remove()); const svg = document.createElementNS("http://www.w3.org/2000/svg","svg"); svg.classList.add("route-line"); svg.setAttribute("viewBox","0 0 1000 700"); const [x1,y1]=lngLatToScreen(a), [x2,y2]=lngLatToScreen(b); const line=document.createElementNS("http://www.w3.org/2000/svg","line"); line.setAttribute("x1",x1*1000); line.setAttribute("y1",y1*700); line.setAttribute("x2",x2*1000); line.setAttribute("y2",y2*700); line.setAttribute("stroke","#2563eb"); line.setAttribute("stroke-width","5"); line.setAttribute("stroke-dasharray","10 8"); svg.appendChild(line); document.getElementById("map").appendChild(svg); }
  }

  function routeTouchesBanZone(a,b) { const zone = zones.find(z => z.type === "ban_area" && z.geometryType === "polygon"); if (!zone) return false; for (let i=0;i<=30;i++){ const t=i/30; const p=[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]; if (pointInPolygon(p, zone.path)) return true; } return false; }
  function pointInPolygon(point, vs) { const x=point[0], y=point[1]; let inside=false; for(let i=0,j=vs.length-1;i<vs.length;j=i++){ const xi=vs[i][0], yi=vs[i][1], xj=vs[j][0], yj=vs[j][1]; const intersect=((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi); if(intersect) inside=!inside; } return inside; }
  function distancePointToSegmentMeters(p,a,b){ const lat0=(p[1]+a[1]+b[1])/3*Math.PI/180; const kx=111320*Math.cos(lat0), ky=110540; const P=[p[0]*kx,p[1]*ky], A=[a[0]*kx,a[1]*ky], B=[b[0]*kx,b[1]*ky]; const AB=[B[0]-A[0],B[1]-A[1]], AP=[P[0]-A[0],P[1]-A[1]]; const ab2=AB[0]*AB[0]+AB[1]*AB[1]; const t=Math.max(0,Math.min(1,(AP[0]*AB[0]+AP[1]*AB[1])/(ab2||1))); const C=[A[0]+AB[0]*t,A[1]+AB[1]*t]; return Math.hypot(P[0]-C[0],P[1]-C[1]); }

  function bounds(){ const all=[]; zones.forEach(z=>z.path.forEach(p=>all.push(p))); points.forEach(p=>all.push([p.lng,p.lat])); const lngs=all.map(p=>p[0]), lats=all.map(p=>p[1]); return {minLng:Math.min(...lngs)-.015,maxLng:Math.max(...lngs)+.015,minLat:Math.min(...lats)-.015,maxLat:Math.max(...lats)+.015}; }
  let B=null; function lngLatToScreen(ll){ if(!B)B=bounds(); const x=(ll[0]-B.minLng)/(B.maxLng-B.minLng); const y=1-(ll[1]-B.minLat)/(B.maxLat-B.minLat); return [x,y]; }
  function screenToLngLat(xy){ if(!B)B=bounds(); return [B.minLng+xy[0]*(B.maxLng-B.minLng), B.minLat+(1-xy[1])*(B.maxLat-B.minLat)]; }
  function esc(value){ return String(value ?? "").replace(/[&<>'"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[s])); }

  async function main(){
    bindUI();
    try{
      const inline = window.__INLINE_DATA__ || null;
      let pointData, zoneData, sourceData;
      if (inline) {
        pointData = inline.points || { points: [] };
        zoneData = inline.zones || { zones: [] };
        sourceData = inline.sources || { sources: [] };
      } else {
        [pointData, zoneData, sourceData] = await Promise.all([fetchJSON("data/points.json"), fetchJSON("data/zones.json"), fetchJSON("data/sources.json")]);
      }
      points = pointData.points || []; zones = zoneData.zones || []; sources = sourceData.sources || [];
      els.dataVersion.textContent = pointData.meta?.updatedAt || "-"; els.totalCount.textContent = points.length; els.riskRadius.textContent = `${CONFIG.riskRadiusMeters || 350}m`;
      try { await loadAMapScript(); initAMap(); els.engineMode.textContent = "高德"; setNotice("已加载高德地图。注意：区域边界为近似绘制，请以官方通告和现场标志为准。", "warn"); }
      catch(err) { if(!CONFIG.demoModeWhenNoKey) throw err; initDemoMap(); els.engineMode.textContent = "预览"; setNotice("当前为无Key原型预览模式：能看布局和数据，但不是正式地图瓦片。填高德Key后自动切换真实地图。", "warn"); }
      renderZones(); renderFilters(); renderPoints(); hideLoading();
    }catch(err){ console.error(err); hideLoading(); setNotice(err.message, "error"); document.getElementById("map").innerHTML = `<div class="error-box"><h2>项目加载失败</h2><p>${esc(err.message)}</p><p>处理方式：用本地服务器或GitHub Pages打开，不要直接双击HTML；并检查data目录文件是否存在。</p></div>`; }
  }
  main();
})();
