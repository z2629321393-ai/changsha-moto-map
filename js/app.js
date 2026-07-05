(function () {
  const CONFIG = window.MOTO_MAP_CONFIG || {};
  const TYPE_META = {
    camera_verified: { label: "已核实风险点", color: "#e5484d" },
    camera_unverified: { label: "待核实截图点位", color: "#f97316" },
    ban_boundary: { label: "禁摩边界", color: "#7c4dff" },
    risky_road: { label: "高风险路段", color: "#facc15" },
    bridge_tunnel_entry: { label: "桥隧入口", color: "#2f80ed" },
    official_boundary: { label: "官方边界提示", color: "#7c4dff" },
    bridge_tunnel: { label: "桥隧/跨江入口", color: "#2f80ed" },
    risk_road: { label: "重点边界道路", color: "#facc15" },
    user_report: { label: "用户反馈待核实", color: "#2f80ed" }
  };

  const QUICK_ROUTES = {
    "wuyi-meixi": [[112.9769, 28.1977], [112.8900, 28.1900], "五一广场 → 梅溪湖"],
    "rail-south": [[113.0144, 28.1940], [113.0656, 28.1487], "长沙站 → 长沙南站"],
    "yuelu-kaifu": [[112.9300, 28.2100], [113.0100, 28.2550], "岳麓区 → 开福区"]
  };

  let map, infoWindow, drivingService, clusterer, engine = "demo", pickMode = null;
  let points = [], zones = [], sources = [], markers = [], overlays = [];
  let activeTypes = new Set(Object.keys(TYPE_META));
  let keyword = "";
  let routeStart = null, routeEnd = null, lastRoutePath = [];

  const els = {
    loading: document.getElementById("loading"),
    mapNotice: document.getElementById("mapNotice"),
    filters: document.getElementById("filters"),
    stats: document.getElementById("stats"),
    pointList: document.getElementById("pointList"),
    searchInput: document.getElementById("searchInput"),
    togglePanel: document.getElementById("togglePanel"),
    sidePanel: document.getElementById("sidePanel"),
    dataVersion: document.getElementById("dataVersion"),
    totalCount: document.getElementById("totalCount"),
    riskRadius: document.getElementById("riskRadius"),
    engineMode: document.getElementById("engineMode"),
    visibleCount: document.getElementById("visibleCount"),
    startText: document.getElementById("startText"),
    destinationInput: document.getElementById("destinationInput"),
    locateStart: document.getElementById("locateStart"),
    resolveDestination: document.getElementById("resolveDestination"),
    startLng: document.getElementById("startLng"),
    startLat: document.getElementById("startLat"),
    endLng: document.getElementById("endLng"),
    endLat: document.getElementById("endLat"),
    routeResult: document.getElementById("routeResult"),
    pickStart: document.getElementById("pickStart"),
    pickEnd: document.getElementById("pickEnd"),
    checkRoute: document.getElementById("checkRoute"),
    tryAvoid: document.getElementById("tryAvoid")
  };

  function setNotice(message, level = "info") {
    if (!els.mapNotice) return;
    els.mapNotice.textContent = message || "";
    els.mapNotice.className = `map-notice ${level}`;
  }

  function hideLoading() {
    if (els.loading) els.loading.style.display = "none";
  }

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`读取${path}失败：${res.status}`);
    return res.json();
  }

  function hasAmapKey() {
    return !!CONFIG.amapKey && CONFIG.amapKey !== "YOUR_AMAP_JS_KEY";
  }

  function loadAMapScript() {
    return new Promise((resolve, reject) => {
      if (window.AMap) return resolve(window.AMap);
      if (!hasAmapKey()) return reject(new Error("未填写高德Web端JS API Key，已进入原型预览模式"));
      if (CONFIG.securityJsCode) window._AMapSecurityConfig = { securityJsCode: CONFIG.securityJsCode };
      const cbName = "__amapInitCallback" + Date.now();
      window[cbName] = function () { resolve(window.AMap); delete window[cbName]; };
      const plugins = [
        "AMap.Scale",
        "AMap.ToolBar",
        "AMap.Geolocation",
        "AMap.Driving",
        "AMap.PlaceSearch"
      ].join(",");
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(CONFIG.amapKey)}&plugin=${plugins}&callback=${cbName}`;
      script.onerror = () => reject(new Error("高德地图脚本加载失败，已进入原型预览模式"));
      document.head.appendChild(script);
    });
  }

  function initAMap() {
    engine = "amap";
    map = new AMap.Map("map", {
      center: CONFIG.mapCenter || [112.9388, 28.2282],
      zoom: CONFIG.mapZoom || 11,
      resizeEnable: true,
      viewMode: "2D",
      mapStyle: CONFIG.mapStyle || "amap://styles/normal"
    });
    infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30), closeWhenClickMap: true });
    map.addControl(new AMap.Scale());
    map.addControl(new AMap.ToolBar({ position: { right: "12px", top: "76px" } }));
    map.on("click", e => handleMapPick([e.lnglat.lng, e.lnglat.lat]));
    map.on("zoomend", () => renderPoints());
    addFloatingLocateControl();
  }

  function addFloatingLocateControl() {
    const btn = document.createElement("button");
    btn.className = "locate-btn";
    btn.textContent = "定位到我";
    btn.type = "button";
    btn.onclick = () => locateStartPoint(true);
    document.querySelector(".map-shell").appendChild(btn);
  }

  function initDemoMap() {
    engine = "demo";
    const el = document.getElementById("map");
    el.className = "demo-map";
    el.innerHTML = `<div class="demo-canvas"><div class="river"></div><div class="demo-glow one"></div><div class="demo-glow two"></div><span class="demo-label center">CHANGSHA</span><span class="demo-label river-label">湘江</span></div><svg class="demo-road-svg" viewBox="0 0 1000 700" preserveAspectRatio="none"><path class="demo-road" d="M30,150 C180,120 240,230 405,214 C570,195 650,110 970,134"/><path class="demo-road" d="M82,602 C220,440 330,420 522,450 C700,478 780,610 968,570"/><path class="demo-road" d="M120,88 C180,270 270,320 365,675"/><path class="demo-road" d="M705,40 C640,190 628,350 790,680"/><path class="demo-road thin" d="M18,334 C180,300 326,362 503,330 C690,296 790,382 980,342"/></svg>`;
    el.addEventListener("click", e => {
      if (!pickMode) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      handleMapPick(screenToLngLat([x, y]));
    });
  }

  function renderZones() {
    overlays.forEach(o => { if (o.setMap) o.setMap(null); });
    overlays = [];
    if (engine !== "amap") return;
    zones.forEach(zone => {
      if (!zone.path || !zone.path.length) return;
      let overlay;
      if (zone.geometryType === "polygon") {
        overlay = new AMap.Polygon({
          path: zone.path,
          strokeColor: zone.strokeColor || "#dc2626",
          strokeWeight: zone.strokeWeight || 3,
          strokeOpacity: 0.95,
          fillColor: zone.fillColor || "#fecaca",
          fillOpacity: zone.fillOpacity ?? 0.22,
          zIndex: 20
        });
      } else {
        overlay = new AMap.Polyline({
          path: zone.path,
          strokeColor: zone.strokeColor || "#ff8a3d",
          strokeWeight: zone.strokeWeight || 5,
          strokeOpacity: 0.9,
          zIndex: 25
        });
      }
      overlay.__zone = true;
      map.add(overlay);
      overlays.push(overlay);
    });
  }

  function renderFilters() {
    if (!els.filters) return;
    const counts = {};
    points.forEach(p => counts[p.type] = (counts[p.type] || 0) + 1);
    els.filters.innerHTML = Object.entries(TYPE_META).map(([type, meta]) => {
      const checked = activeTypes.has(type) ? "checked" : "";
      return `<label class="filter-chip"><input type="checkbox" data-type="${type}" ${checked}><span class="dot" style="background:${meta.color}"></span>${meta.label}<em>${counts[type] || 0}</em></label>`;
    }).join("");
    els.filters.querySelectorAll("input[data-type]").forEach(input => {
      input.addEventListener("change", e => {
        const type = e.target.dataset.type;
        if (e.target.checked) activeTypes.add(type); else activeTypes.delete(type);
        renderPoints();
      });
    });
  }

  function renderPoints() {
    if (Array.isArray(clusterer)) clusterer.forEach(m => m.setMap && m.setMap(null));
    else if (clusterer && clusterer.setMap) clusterer.setMap(null);
    clusterer = null;
    markers.forEach(m => { if (m.setMap) m.setMap(null); else if (m.remove) m.remove(); });
    markers = [];
    const visible = points.filter(p => activeTypes.has(p.type) && matchKeyword(p));
    if (engine === "amap") renderAmapClusteredPoints(visible);
    else visible.forEach(point => addPointMarker(point));
    renderStats(visible);
    renderPointList(visible);
  }

  function matchKeyword(point) {
    if (!keyword) return true;
    const text = [point.name, point.direction, point.confidence, point.source, point.note, point.type].join(" ").toLowerCase();
    return text.includes(keyword.toLowerCase());
  }

  function addPointMarker(point) {
    const meta = TYPE_META[point.type] || TYPE_META.user_report;
    if (engine === "amap") {
      const marker = new AMap.Marker({
        position: [point.lng, point.lat],
        content: `<div class="marker marker-${point.type}" style="--marker-color:${meta.color}" title="${esc(point.name)}"></div>`,
        offset: new AMap.Pixel(-6, -6),
        zIndex: point.type && point.type.startsWith("camera") ? 105 : 90
      });
      marker.on("click", () => openPointInfo(point));
      map.add(marker);
      markers.push(marker);
      return;
    }
    const [x, y] = lngLatToScreen([point.lng, point.lat]);
    const el = document.createElement("button");
    el.className = "demo-point";
    el.type = "button";
    el.title = point.name;
    el.style.left = `${x * 100}%`;
    el.style.top = `${y * 100}%`;
    el.style.setProperty("--marker-color", meta.color);
    el.onclick = () => openPointInfo(point);
    document.getElementById("map").appendChild(el);
    markers.push(el);
  }

  function renderClusterIfNeeded() {
    return;
  }

  function renderAmapClusteredPoints(visible) {
    const zoom = map?.getZoom ? map.getZoom() : 14;
    if (zoom >= 15 || visible.length < 30) {
      visible.forEach(point => addPointMarker(point));
      return;
    }
    const gridSize = zoom <= 11 ? 0.025 : zoom <= 13 ? 0.014 : 0.008;
    const groups = new Map();
    visible.forEach(point => {
      const key = `${Math.round(point.lng / gridSize)},${Math.round(point.lat / gridSize)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(point);
    });
    clusterer = [];
    groups.forEach(group => {
      if (group.length === 1 || zoom >= 14) {
        addPointMarker(group[0]);
        return;
      }
      const lng = group.reduce((sum, p) => sum + p.lng, 0) / group.length;
      const lat = group.reduce((sum, p) => sum + p.lat, 0) / group.length;
      const marker = new AMap.Marker({
        position: [lng, lat],
        content: `<div class="cluster-marker">${group.length}</div>`,
        offset: new AMap.Pixel(-15, -15),
        zIndex: 150
      });
      marker.on("click", () => {
        map.setZoomAndCenter(Math.min(16, zoom + 2), [lng, lat]);
      });
      map.add(marker);
      clusterer.push(marker);
    });
  }

  function openPointInfo(point) {
    const meta = TYPE_META[point.type] || TYPE_META.user_report;
    const position = `${point.lng},${point.lat}`;
    const markerUrl = `https://uri.amap.com/marker?position=${position}&name=${encodeURIComponent(point.name)}&src=${encodeURIComponent(CONFIG.appName || "moto-map")}&coordinate=gaode&callnative=1`;
    const navUrl = `https://uri.amap.com/navigation?to=${position},${encodeURIComponent(point.name)}&mode=car&src=${encodeURIComponent(CONFIG.appName || "moto-map")}&coordinate=gaode&callnative=1`;
    const html = `<div class="info"><h3>${esc(point.name)}</h3><p><b>类型：</b><span style="color:${meta.color}">${meta.label}</span></p><p><b>方向/位置：</b>${esc(point.direction || "未填写")}</p><p><b>可信度：</b>${esc(point.confidence || "待核实")}</p><p><b>来源：</b>${esc(resolveSource(point.source))}</p><p><b>备注：</b>${esc(point.note || "")}</p><p><b>更新时间：</b>${esc(point.updatedAt || "")}</p><div class="info-actions"><a href="${markerUrl}" target="_blank" rel="noopener">高德查看</a><a href="${navUrl}" target="_blank" rel="noopener">导航到该点</a><button type="button" data-copy="${position}">复制坐标</button></div></div>`;
    if (engine === "amap") {
      infoWindow.setContent(html);
      infoWindow.open(map, [point.lng, point.lat]);
    } else {
      showDemoInfo(html);
    }
    setTimeout(bindCopyButtons, 0);
  }

  function bindCopyButtons() {
    document.querySelectorAll("button[data-copy]").forEach(btn => {
      btn.onclick = async () => {
        try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = "已复制"; }
        catch { btn.textContent = "复制失败"; }
      };
    });
  }

  function showDemoInfo(html) {
    document.querySelectorAll(".demo-info").forEach(n => n.remove());
    const box = document.createElement("div");
    box.className = "demo-info";
    box.innerHTML = `<button class="close" type="button">×</button>${html}`;
    box.querySelector(".close").onclick = () => box.remove();
    document.getElementById("map").appendChild(box);
  }

  function renderStats(visible) {
    if (!els.stats) return;
    const byType = {};
    points.forEach(p => byType[p.type] = (byType[p.type] || 0) + 1);
    const rows = [
      ["总点位", points.length],
      ["当前显示", visible.length],
      ["官方/边界", (byType.official_boundary || 0) + (byType.risk_road || 0)],
      ["待核实", (byType.camera_unverified || 0) + (byType.user_report || 0)]
    ];
    els.stats.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    if (els.visibleCount) els.visibleCount.textContent = `${visible.length} / ${points.length}`;
  }

  function renderPointList(visible) {
    if (!els.pointList) return;
    els.pointList.innerHTML = "";
    visible.slice(0, 160).forEach(point => {
      const meta = TYPE_META[point.type] || TYPE_META.user_report;
      const item = document.createElement("button");
      item.className = "point-item";
      item.type = "button";
      item.innerHTML = `<span class="dot" style="background:${meta.color}"></span><span class="point-text"><b>${esc(point.name)}</b><small>${esc(point.note || point.direction || "")}</small></span>`;
      item.onclick = () => {
        focusPoint(point);
        openPointInfo(point);
        if (window.matchMedia("(max-width: 900px)").matches) els.sidePanel.classList.remove("open");
      };
      els.pointList.appendChild(item);
    });
  }

  function focusPoint(point) {
    if (engine === "amap") map.setZoomAndCenter(15, [point.lng, point.lat]);
  }

  function resolveSource(id) {
    const s = sources.find(x => x.id === id);
    return s ? s.name : (id || "未填写");
  }

  function bindUI() {
    if (els.searchInput) els.searchInput.addEventListener("input", e => { keyword = e.target.value.trim(); renderPoints(); });
    if (els.togglePanel) els.togglePanel.addEventListener("click", () => els.sidePanel.classList.toggle("open"));
    if (els.pickStart) els.pickStart.addEventListener("click", () => { pickMode = "start"; setNotice("请在地图上点击起点。", "warn"); });
    if (els.pickEnd) els.pickEnd.addEventListener("click", () => { pickMode = "end"; setNotice("请在地图上点击终点。", "warn"); });
    if (els.locateStart) els.locateStart.addEventListener("click", () => locateStartPoint(false));
    if (els.resolveDestination) els.resolveDestination.addEventListener("click", resolveDestinationByKeyword);
    if (els.checkRoute) els.checkRoute.addEventListener("click", runRouteCheck);
    document.querySelectorAll(".quick-routes button[data-route]").forEach(btn => {
      btn.addEventListener("click", () => {
        const r = QUICK_ROUTES[btn.dataset.route];
        setRouteInputs(r[0], r[1], r[2]);
        runRouteCheck();
      });
    });
  }

  function handleMapPick(ll) {
    if (!pickMode) return;
    if (pickMode === "start") {
      setStartPoint(ll, "地图点选起点");
    }
    if (pickMode === "end") {
      setEndPoint(ll, "地图点选终点");
    }
    setNotice(`${pickMode === "start" ? "起点" : "终点"}已设置：${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}`, "warn");
    pickMode = null;
  }

  function setStartPoint(ll, label = "已设置起点") {
    routeStart = normalizeLngLat(ll);
    if (els.startLng) els.startLng.value = routeStart[0].toFixed(6);
    if (els.startLat) els.startLat.value = routeStart[1].toFixed(6);
    if (els.startText) els.startText.value = `${label}｜${routeStart[0].toFixed(5)}, ${routeStart[1].toFixed(5)}`;
  }

  function setEndPoint(ll, label = "已设置终点") {
    routeEnd = normalizeLngLat(ll);
    if (els.endLng) els.endLng.value = routeEnd[0].toFixed(6);
    if (els.endLat) els.endLat.value = routeEnd[1].toFixed(6);
    if (els.destinationInput) els.destinationInput.value = label;
  }

  function setRouteInputs(a, b, label = "快捷路线") {
    setStartPoint(a, `${label}起点`);
    setEndPoint(b, `${label}终点`);
  }

  function readCoordsFromInputs() {
    const a = [parseFloat(els.startLng?.value), parseFloat(els.startLat?.value)];
    const b = [parseFloat(els.endLng?.value), parseFloat(els.endLat?.value)];
    return { a, b };
  }

  function locateStartPoint(focusOnly) {
    if (engine !== "amap" || !window.AMap) {
      const fallback = CONFIG.mapCenter || [112.9388, 28.2282];
      setStartPoint(fallback, "预览模式默认起点");
      setNotice("预览模式无法调用真实定位；已使用长沙市区默认点。", "warn");
      return;
    }
    setNotice("正在获取浏览器定位权限……", "info");
    AMap.plugin("AMap.Geolocation", () => {
      const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000, zoomToAccuracy: true });
      geo.getCurrentPosition((status, result) => {
        if (status === "complete") {
          const ll = [result.position.lng, result.position.lat];
          setStartPoint(ll, "当前位置");
          map.setZoomAndCenter(14, ll);
          setNotice("已把当前位置设为路线起点。", "info");
        } else {
          setNotice("定位失败：请检查浏览器定位权限，或改用地图点选起点。", "warn");
        }
      });
    });
  }

  function resolveDestinationByKeyword() {
    const kw = (els.destinationInput?.value || "").trim();
    if (!kw) { setNotice("请先输入终点，比如：长沙南站。", "warn"); return; }
    if (engine !== "amap" || !window.AMap) {
      const known = demoDestination(kw);
      if (known) {
        setEndPoint(known, kw);
        setNotice(`预览模式已按内置样例识别：${kw}`, "warn");
      } else {
        setNotice("预览模式不能联网搜索地点；请用地图点选终点，或填写经纬度。", "warn");
      }
      return;
    }
    setNotice("正在搜索终点位置……", "info");
    AMap.plugin("AMap.PlaceSearch", () => {
      const placeSearch = new AMap.PlaceSearch({ city: "长沙", citylimit: false, pageSize: 1, extensions: "base" });
      placeSearch.search(kw, (status, result) => {
        const poi = result?.poiList?.pois?.[0];
        if (status === "complete" && poi && poi.location) {
          const ll = [poi.location.lng, poi.location.lat];
          setEndPoint(ll, poi.name || kw);
          map.setZoomAndCenter(14, ll);
          setNotice(`已找到终点：${poi.name || kw}。`, "info");
        } else {
          setNotice("没有搜索到终点。请写得更具体，或在地图上点选终点。", "warn");
        }
      });
    });
  }

  function demoDestination(kw) {
    const dict = {
      "长沙南站": [113.0656, 28.1487],
      "长沙站": [113.0144, 28.1940],
      "五一广场": [112.9769, 28.1977],
      "梅溪湖": [112.8900, 28.1900],
      "橘子洲": [112.9585, 28.1893]
    };
    return Object.entries(dict).find(([k]) => kw.includes(k))?.[1] || null;
  }

  async function runRouteCheck() {
    if (!routeStart || !routeEnd) {
      const { a, b } = readCoordsFromInputs();
      if (!a.some(Number.isNaN)) routeStart = a;
      if (!b.some(Number.isNaN)) routeEnd = b;
    }
    if (!routeEnd && (els.destinationInput?.value || "").trim()) {
      resolveDestinationByKeyword();
      els.routeResult.innerHTML = "已尝试搜索终点；识别成功后请再点一次“规划并检测”。";
      return;
    }
    if (!routeStart || !routeEnd || routeStart.some(Number.isNaN) || routeEnd.some(Number.isNaN)) {
      els.routeResult.textContent = "请先定位起点，并输入/点选终点。";
      return;
    }
    if (engine === "amap" && window.AMap) {
      runAmapDrivingCheck(routeStart, routeEnd, !!els.tryAvoid?.checked);
    } else {
      runStraightCheck(routeStart, routeEnd, "预览模式直线粗测");
    }
  }

  function runAmapDrivingCheck(a, b, tryAvoid) {
    els.routeResult.innerHTML = "正在规划真实驾车路线，并检测已录入风险点……";
    setNotice("正在调用高德驾车路线规划。", "info");
    clearRouteOnly();
    AMap.plugin("AMap.Driving", () => {
      if (drivingService && drivingService.clear) drivingService.clear();
      const policy = AMap.DrivingPolicy?.LEAST_TIME ?? 0;
      drivingService = new AMap.Driving({
        map,
        policy,
        hideMarkers: false,
        showTraffic: true,
        autoFitView: true
      });
      const avoidApplied = applyAvoidPolygonsIfPossible(drivingService, tryAvoid);
      drivingService.search(new AMap.LngLat(a[0], a[1]), new AMap.LngLat(b[0], b[1]), (status, result) => {
        if (status === "complete" && result) {
          const routePath = getPathFromDrivingResult(result);
          lastRoutePath = routePath;
          if (!routePath.length) {
            runStraightCheck(a, b, "真实路线返回异常，临时直线粗测");
            return;
          }
          const summary = summarizeDrivingResult(result);
          const analysis = analyzeRoutePath(routePath);
          renderRouteAnalysis(analysis, a, b, summary, avoidApplied);
          setNotice("路线规划完成。高德App打开后可能会重新算路，风险提示以本页面检测为准。", analysis.hasRisk ? "warn" : "info");
        } else {
          const message = typeof result === "string" ? result : (result?.info || "未知错误");
          if (tryAvoid) {
            els.routeResult.innerHTML = `避让路线规划失败：${esc(message)}<br>正在改用普通高德路线检测……`;
            runAmapDrivingCheck(a, b, false);
            return;
          }
          els.routeResult.innerHTML = `高德路线规划失败：${esc(message)}<br>已退回直线粗测。`;
          runStraightCheck(a, b, "高德规划失败后的直线粗测");
        }
      });
    });
  }

  function applyAvoidPolygonsIfPossible(driving, tryAvoid) {
    if (!tryAvoid) return "未开启避让";
    const banZone = zones.find(z => z.type === "ban_area" && z.geometryType === "polygon" && z.path?.length);
    if (!banZone) return "未找到可避让区域";
    if (typeof driving.setAvoidPolygons !== "function") return "当前JS插件未暴露避让区域方法，已按普通路线检测";
    const simplified = simplifyPolygonForAvoid(banZone.path, 16);
    try {
      driving.setAvoidPolygons([simplified.map(p => new AMap.LngLat(p[0], p[1]))]);
      return `已尝试避让禁摩合围区域（${simplified.length}个边界点）`;
    } catch (err) {
      return `避让区域设置失败，已按普通路线检测：${err.message}`;
    }
  }

  function simplifyPolygonForAvoid(path, maxPoints) {
    if (path.length <= maxPoints) return path;
    const step = Math.ceil(path.length / maxPoints);
    const reduced = path.filter((_, i) => i % step === 0).slice(0, maxPoints);
    if (reduced.length < 4) return path.slice(0, Math.min(path.length, maxPoints));
    return reduced;
  }

  function getPathFromDrivingResult(result) {
    const route = result.routes?.[0];
    if (!route) return [];
    const out = [];
    (route.steps || []).forEach(step => {
      if (Array.isArray(step.path)) {
        step.path.forEach(p => out.push(normalizeLngLat(p)));
      } else if (typeof step.polyline === "string") {
        step.polyline.split(";").forEach(s => {
          const [lng, lat] = s.split(",").map(Number);
          if (!Number.isNaN(lng) && !Number.isNaN(lat)) out.push([lng, lat]);
        });
      }
    });
    return dedupePath(out);
  }

  function dedupePath(path) {
    const out = [];
    path.forEach(p => {
      const prev = out[out.length - 1];
      if (!prev || Math.abs(prev[0] - p[0]) > 1e-7 || Math.abs(prev[1] - p[1]) > 1e-7) out.push(p);
    });
    return out;
  }

  function summarizeDrivingResult(result) {
    const route = result.routes?.[0] || {};
    const distance = Number(route.distance || route.distanceTotal || 0);
    const time = Number(route.time || route.duration || 0);
    const strategy = route.policy || route.strategy || "高德驾车路线";
    return { distance, time, strategy };
  }

  function analyzeRoutePath(path) {
    const radius = Number(CONFIG.riskRadiusMeters || 250);
    const riskTypes = new Set(["official_boundary", "bridge_tunnel", "risk_road", "ban_boundary", "bridge_tunnel_entry", "risky_road", "camera_verified", "camera_unverified", "user_report"]);
    const hits = points
      .filter(p => riskTypes.has(p.type))
      .map(p => ({ point: p, dist: distancePointToPolylineMeters([p.lng, p.lat], path) }))
      .filter(x => x.dist <= radius)
      .sort((x, y) => x.dist - y.dist);
    const inZone = routePathTouchesBanZone(path);
    return { hits, inZone, radius, hasRisk: hits.length > 0 || inZone };
  }

  function renderRouteAnalysis(analysis, a, b, summary, avoidApplied) {
    const navUrl = makeAmapNavigationUrl(a, b);
    const km = summary.distance ? `${(summary.distance / 1000).toFixed(1)}km` : "-";
    const mins = summary.time ? `${Math.round(summary.time / 60)}分钟` : "-";
    const head = `<div class="route-summary"><b>真实路线检测完成</b><span>距离：${km}｜预计：${mins}</span><small>${esc(avoidApplied || "")}</small></div>`;
    if (!analysis.hasRisk) {
      els.routeResult.innerHTML = `${head}<div class="route-safe">当前路线未发现${analysis.radius}米内的已录入风险点，也未检测到穿过禁摩合围区域。</div><a href="${navUrl}" target="_blank" rel="noopener">打开高德导航</a><p class="route-note">注意：打开高德App后可能重新算路，本页面只负责风险提醒。</p>`;
      return;
    }
    const hitList = analysis.hits.slice(0, 12).map(x => {
      const meta = TYPE_META[x.point.type] || TYPE_META.user_report;
      return `· <span style="color:${meta.color}">${esc(meta.label)}</span>｜${esc(x.point.name)}，距路线约${Math.round(x.dist)}米`;
    }).join("<br>");
    els.routeResult.innerHTML = `${head}<div class="route-danger"><b>发现通行风险：</b><br>${analysis.inZone ? "· 路线可能进入/穿过禁摩合围区域。<br>" : ""}${hitList}${analysis.hits.length > 12 ? `<br>另有${analysis.hits.length - 12}个点位未展示。` : ""}</div><a href="${navUrl}" target="_blank" rel="noopener">打开高德导航</a><p class="route-note">建议对照官方通告和现场标志复核；不要把本工具当作执法或法律依据。</p>`;
  }

  function runStraightCheck(a, b, label = "直线粗测") {
    const path = [a, b];
    const analysis = analyzeRoutePath(path);
    drawFallbackRoute(path);
    const navUrl = makeAmapNavigationUrl(a, b);
    if (!analysis.hasRisk) {
      els.routeResult.innerHTML = `${label}：未发现${analysis.radius}米内的已录入风险点。<br><a href="${navUrl}" target="_blank" rel="noopener">打开高德查看路线</a>`;
      return;
    }
    els.routeResult.innerHTML = `<b>${label}发现风险：</b><br>${analysis.inZone ? "可能穿过禁摩合围区域。<br>" : ""}${analysis.hits.slice(0, 8).map(x => `· ${esc(x.point.name)}，约${Math.round(x.dist)}米`).join("<br>")}${analysis.hits.length > 8 ? `<br>另有${analysis.hits.length - 8}个点位未展示。` : ""}<br><a href="${navUrl}" target="_blank" rel="noopener">打开高德查看路线</a>`;
  }

  function clearRouteOnly() {
    overlays.filter(o => o.__route).forEach(o => o.setMap && o.setMap(null));
    overlays = overlays.filter(o => !o.__route);
    document.querySelectorAll(".route-line").forEach(n => n.remove());
  }

  function drawFallbackRoute(path) {
    clearRouteOnly();
    if (engine === "amap") {
      const line = new AMap.Polyline({ path, strokeColor: "#2563eb", strokeWeight: 5, strokeOpacity: 0.9, zIndex: 50 });
      line.__route = true;
      map.add(line);
      overlays.push(line);
      map.setFitView([line]);
    } else {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("route-line");
      svg.setAttribute("viewBox", "0 0 1000 700");
      const poly = document.createElementNS("http://www.w3.org/2000/svg", path.length > 2 ? "polyline" : "line");
      const coords = path.map(p => lngLatToScreen(p));
      if (path.length > 2) {
        poly.setAttribute("points", coords.map(([x, y]) => `${x * 1000},${y * 700}`).join(" "));
      } else {
        poly.setAttribute("x1", coords[0][0] * 1000); poly.setAttribute("y1", coords[0][1] * 700);
        poly.setAttribute("x2", coords[1][0] * 1000); poly.setAttribute("y2", coords[1][1] * 700);
      }
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", "#2563eb");
      poly.setAttribute("stroke-width", "5");
      poly.setAttribute("stroke-dasharray", "10 8");
      svg.appendChild(poly);
      document.getElementById("map").appendChild(svg);
    }
  }

  function makeAmapNavigationUrl(a, b) {
    return `https://uri.amap.com/navigation?from=${a[0]},${a[1]},起点&to=${b[0]},${b[1]},终点&mode=car&src=${encodeURIComponent(CONFIG.appName || "moto-map")}&coordinate=gaode&callnative=1`;
  }

  function routePathTouchesBanZone(path) {
    const zone = zones.find(z => z.type === "ban_area" && z.geometryType === "polygon" && z.path?.length);
    if (!zone || !path.length) return false;
    const step = Math.max(1, Math.floor(path.length / 160));
    for (let i = 0; i < path.length; i += step) {
      if (pointInPolygon(path[i], zone.path)) return true;
    }
    return false;
  }

  function pointInPolygon(point, vs) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distancePointToPolylineMeters(p, path) {
    if (!path.length) return Infinity;
    if (path.length === 1) return distanceMeters(p, path[0]);
    let min = Infinity;
    for (let i = 1; i < path.length; i++) min = Math.min(min, distancePointToSegmentMeters(p, path[i - 1], path[i]));
    return min;
  }

  function distancePointToSegmentMeters(p, a, b) {
    const lat0 = (p[1] + a[1] + b[1]) / 3 * Math.PI / 180;
    const kx = 111320 * Math.cos(lat0), ky = 110540;
    const P = [p[0] * kx, p[1] * ky], A = [a[0] * kx, a[1] * ky], B = [b[0] * kx, b[1] * ky];
    const AB = [B[0] - A[0], B[1] - A[1]], AP = [P[0] - A[0], P[1] - A[1]];
    const ab2 = AB[0] * AB[0] + AB[1] * AB[1];
    const t = Math.max(0, Math.min(1, (AP[0] * AB[0] + AP[1] * AB[1]) / (ab2 || 1)));
    const C = [A[0] + AB[0] * t, A[1] + AB[1] * t];
    return Math.hypot(P[0] - C[0], P[1] - C[1]);
  }

  function distanceMeters(a, b) {
    return distancePointToSegmentMeters(a, b, b);
  }

  function normalizeLngLat(p) {
    if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
    if (p && typeof p.lng === "number" && typeof p.lat === "number") return [p.lng, p.lat];
    if (p && typeof p.getLng === "function" && typeof p.getLat === "function") return [p.getLng(), p.getLat()];
    return [Number(p?.lng), Number(p?.lat)];
  }

  function bounds() {
    const all = [];
    zones.forEach(z => (z.path || []).forEach(p => all.push(p)));
    points.forEach(p => all.push([p.lng, p.lat]));
    const lngs = all.map(p => p[0]), lats = all.map(p => p[1]);
    return { minLng: Math.min(...lngs) - 0.015, maxLng: Math.max(...lngs) + 0.015, minLat: Math.min(...lats) - 0.015, maxLat: Math.max(...lats) + 0.015 };
  }

  let B = null;
  function lngLatToScreen(ll) {
    if (!B) B = bounds();
    const x = (ll[0] - B.minLng) / (B.maxLng - B.minLng);
    const y = 1 - (ll[1] - B.minLat) / (B.maxLat - B.minLat);
    return [x, y];
  }

  function screenToLngLat(xy) {
    if (!B) B = bounds();
    return [B.minLng + xy[0] * (B.maxLng - B.minLng), B.minLat + (1 - xy[1]) * (B.maxLat - B.minLat)];
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[s]));
  }

  async function main() {
    bindUI();
    try {
      const inline = window.__INLINE_DATA__ || null;
      let pointData, zoneData, sourceData;
      if (inline) {
        pointData = inline.points || { points: [] };
        zoneData = inline.zones || { zones: [] };
        sourceData = inline.sources || { sources: [] };
      } else {
        [pointData, zoneData, sourceData] = await Promise.all([
          fetchJSON("data/points.json"),
          fetchJSON("data/zones.json"),
          fetchJSON("data/sources.json")
        ]);
      }
      points = pointData.points || [];
      zones = zoneData.zones || [];
      sources = sourceData.sources || [];
      if (els.dataVersion) els.dataVersion.textContent = pointData.meta?.updatedAt || "-";
      if (els.totalCount) els.totalCount.textContent = points.length;
      if (els.riskRadius) els.riskRadius.textContent = `${CONFIG.riskRadiusMeters || 250}m`;
      try {
        await loadAMapScript();
        initAMap();
        if (els.engineMode) els.engineMode.textContent = "高德";
        setNotice("已加载高德地图。路线检测为通行风险提醒，不代表官方导航规则。", "warn");
      } catch (err) {
        if (!CONFIG.demoModeWhenNoKey) throw err;
        initDemoMap();
        if (els.engineMode) els.engineMode.textContent = "预览";
        setNotice("当前为无Key原型预览模式：能看布局和数据，但不是正式地图瓦片。填高德Key后自动切换真实地图。", "warn");
      }
      renderZones();
      renderFilters();
      renderPoints();
      hideLoading();
    } catch (err) {
      console.error(err);
      hideLoading();
      setNotice(err.message, "error");
      document.getElementById("map").innerHTML = `<div class="error-box"><h2>项目加载失败</h2><p>${esc(err.message)}</p><p>处理方式：用本地服务器或GitHub Pages打开，不要直接双击HTML；并检查data目录文件是否存在。</p></div>`;
    }
  }

  main();
})();
