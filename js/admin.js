(function () {
  const CONFIG = window.MOTO_MAP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const DEFAULT_CONFIDENCE = "截图粗定位，待实地复核";
  const DEFAULT_SOURCE = "user_screenshot";
  const DEFAULT_NOTE = "来自用户截图/地图截图粗定位，不代表官方数据，请以现场交通标志和官方信息为准。";

  let map, previewMarker, placeSearch;
  let batchRows = [];
  let pickTargetRow = null;

  const fields = ["id", "name", "type", "lng", "lat", "direction", "confidence", "source", "note", "updatedAt"];

  initDefaults();
  bindEvents();
  loadAMap().then(initMap).catch(err => setStatus(`高德地图未加载：${err.message}。仍可手动录入JSON。`));

  function initDefaults() {
    $("updatedAt").value = new Date().toISOString().slice(0, 10);
    $("confidence").value = DEFAULT_CONFIDENCE;
    $("source").value = DEFAULT_SOURCE;
    $("note").value = DEFAULT_NOTE;
  }

  function bindEvents() {
    $("generate").onclick = () => $("output").value = `${JSON.stringify(readFormPoint(), null, 2)},`;
    $("copy").onclick = () => copyText($("output").value, $("copy"));
    $("clearForm").onclick = clearForm;
    $("searchPlace").onclick = () => searchPlace($("searchQuery").value.trim(), null);
    $("searchQuery").addEventListener("keydown", e => { if (e.key === "Enter") searchPlace($("searchQuery").value.trim(), null); });
    $("parseBatch").onclick = parseBatch;
    $("generateBatch").onclick = generateBatchJson;
    $("copyBatch").onclick = () => copyText($("batchOutput").value, $("copyBatch"));
  }

  function loadAMap() {
    return new Promise((resolve, reject) => {
      if (window.AMap) return resolve(window.AMap);
      if (!CONFIG.amapKey || CONFIG.amapKey === "YOUR_AMAP_JS_KEY") return reject(new Error("请先在js/config.js填写Web端JSAPI Key"));
      if (CONFIG.securityJsCode) window._AMapSecurityConfig = { securityJsCode: CONFIG.securityJsCode };
      const cbName = `__adminAmapReady${Date.now()}`;
      window[cbName] = () => { resolve(window.AMap); delete window[cbName]; };
      const plugins = ["AMap.Scale", "AMap.ToolBar", "AMap.PlaceSearch", "AMap.Geocoder"].join(",");
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(CONFIG.amapKey)}&plugin=${plugins}&callback=${cbName}`;
      script.onerror = () => reject(new Error("高德脚本加载失败"));
      document.head.appendChild(script);
    });
  }

  function initMap() {
    map = new AMap.Map("adminMap", {
      center: CONFIG.mapCenter || [112.9388, 28.2282],
      zoom: 12,
      resizeEnable: true,
      viewMode: "2D",
      mapStyle: CONFIG.mapStyle || "amap://styles/normal"
    });
    map.addControl(new AMap.Scale());
    map.addControl(new AMap.ToolBar({ position: { right: "12px", top: "12px" } }));
    placeSearch = new AMap.PlaceSearch({ city: "长沙", citylimit: false, pageSize: 8, extensions: "base" });
    map.on("click", e => setPickedPoint([e.lnglat.lng, e.lnglat.lat], "地图点选"));
    setStatus("地图已加载。点击地图可取点，也可以搜索路口。");
  }

  function setPickedPoint(lngLat, label) {
    if (pickTargetRow) {
      pickTargetRow.lng = Number(lngLat[0].toFixed(6));
      pickTargetRow.lat = Number(lngLat[1].toFixed(6));
      pickTargetRow.status = `${label}已填入`;
      pickTargetRow = null;
      renderBatchTable();
    } else {
      $("lng").value = lngLat[0].toFixed(6);
      $("lat").value = lngLat[1].toFixed(6);
      if (!$("name").value.trim()) $("name").value = `${$("searchQuery").value.trim() || "地图点选"}附近待核实点`;
      if (!$("direction").value.trim()) $("direction").value = "路口附近，方向待核实";
    }
    showPreviewMarker(lngLat);
    map?.setZoomAndCenter(Math.max(map.getZoom(), 15), lngLat);
    setStatus(`${label}：${lngLat[0].toFixed(6)}, ${lngLat[1].toFixed(6)}`);
  }

  function showPreviewMarker(lngLat) {
    if (!map) return;
    if (!previewMarker) {
      previewMarker = new AMap.Marker({
        content: '<div class="marker" style="--marker-color:#f97316"></div>',
        offset: new AMap.Pixel(-6, -6),
        zIndex: 999
      });
      map.add(previewMarker);
    }
    previewMarker.setPosition(lngLat);
  }

  function searchPlace(query, row) {
    if (!query) return setStatus("请输入路名、路口或地标。");
    if (!placeSearch) return setStatus("地图搜索还没准备好，请稍等。");
    setStatus(`正在搜索：${query}`);
    placeSearch.search(query, (status, result) => {
      const pois = result?.poiList?.pois || [];
      if (status !== "complete" || !pois.length) {
        if (row) { row.status = "未找到候选"; renderBatchTable(); }
        return setStatus(`未找到：${query}`);
      }
      if (row) {
        const poi = pois[0];
        row.lng = Number(poi.location.lng.toFixed(6));
        row.lat = Number(poi.location.lat.toFixed(6));
        row.status = `已取第1个候选：${poi.name}`;
        renderBatchTable();
        showPreviewMarker([row.lng, row.lat]);
        map?.setZoomAndCenter(15, [row.lng, row.lat]);
        return;
      }
      renderCandidates(pois);
      setStatus(`找到${pois.length}个候选，请点选最接近截图的位置。`);
    });
  }

  function renderCandidates(pois) {
    $("candidateList").innerHTML = "";
    pois.forEach(poi => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "candidate";
      btn.innerHTML = `<b>${esc(poi.name)}</b><small>${esc(poi.address || "")}</small>`;
      btn.onclick = () => {
        const ll = [poi.location.lng, poi.location.lat];
        $("name").value = $("name").value.trim() || `${poi.name}附近待核实点`;
        $("direction").value = $("direction").value.trim() || `${poi.name}附近，方向待核实`;
        setPickedPoint(ll, "搜索候选");
      };
      $("candidateList").appendChild(btn);
    });
  }

  function readFormPoint() {
    const point = {};
    fields.forEach(key => {
      const value = $(key).value.trim();
      if (key === "lng" || key === "lat") point[key] = Number(value);
      else point[key] = value;
    });
    if (!point.id) point.id = nextScreenId();
    point.confidence ||= DEFAULT_CONFIDENCE;
    point.source ||= DEFAULT_SOURCE;
    point.note ||= DEFAULT_NOTE;
    point.updatedAt ||= new Date().toISOString().slice(0, 10);
    return point;
  }

  function clearForm() {
    ["id", "name", "lng", "lat", "direction"].forEach(id => $(id).value = "");
    $("type").value = "camera_unverified";
    initDefaults();
    $("output").value = "";
    setStatus("表单已清空。");
  }

  function parseBatch() {
    const lines = $("batchInput").value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    batchRows = lines.map((line, index) => {
      const clean = line.replace(/[，,]\s*待核实$/, "").trim();
      return {
        id: nextScreenId(index + 1),
        name: `${clean}待核实点`,
        type: "camera_unverified",
        direction: `${clean}附近，方向待核实`,
        source: DEFAULT_SOURCE,
        confidence: DEFAULT_CONFIDENCE,
        note: DEFAULT_NOTE,
        lng: "",
        lat: "",
        query: clean,
        status: "待搜索"
      };
    });
    renderBatchTable();
    setStatus(`已生成${batchRows.length}行，逐行搜索或地图选点后再生成JSON。`);
  }

  function renderBatchTable() {
    const box = $("batchTable");
    box.innerHTML = "";
    batchRows.forEach((row, index) => {
      const div = document.createElement("div");
      div.className = "batch-row";
      div.innerHTML = `
        <label>名称<input data-field="name" value="${attr(row.name)}"></label>
        <label>类型<select data-field="type">
          ${["camera_unverified","camera_verified","ban_boundary","risky_road","bridge_tunnel_entry"].map(t => `<option value="${t}" ${row.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select></label>
        <label>经度<input data-field="lng" value="${attr(row.lng)}"></label>
        <label>纬度<input data-field="lat" value="${attr(row.lat)}"></label>
        <div class="row-actions">
          <button type="button" data-action="search">搜索坐标</button>
          <button type="button" data-action="pick">地图选点</button>
        </div>
        <label>方向<input data-field="direction" value="${attr(row.direction)}"></label>
        <label>来源<input data-field="source" value="${attr(row.source)}"></label>
        <label>备注<input data-field="note" value="${attr(row.note)}"></label>
        <div class="status-line">${esc(row.status || "")}</div>`;
      div.querySelectorAll("[data-field]").forEach(input => {
        input.oninput = () => { row[input.dataset.field] = input.value; };
      });
      div.querySelector('[data-action="search"]').onclick = () => searchPlace(row.query || row.name, row);
      div.querySelector('[data-action="pick"]').onclick = () => {
        pickTargetRow = row;
        setStatus(`请在地图上点击第${index + 1}行的位置：${row.name}`);
      };
      box.appendChild(div);
    });
  }

  function generateBatchJson() {
    const today = new Date().toISOString().slice(0, 10);
    const points = [];
    batchRows.forEach((row, index) => {
      const lng = Number(row.lng);
      const lat = Number(row.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) < 1 || Math.abs(lat) < 1) {
        row.status = "缺坐标：请先搜索坐标或地图选点";
        return;
      }
      points.push({
        id: row.id || nextScreenId(index + 1),
        name: row.name,
        type: row.type || "camera_unverified",
        lng,
        lat,
        direction: row.direction || "路口附近，方向待核实",
        confidence: row.confidence || DEFAULT_CONFIDENCE,
        source: row.source || DEFAULT_SOURCE,
        note: row.note || DEFAULT_NOTE,
        updatedAt: today
      });
    });
    renderBatchTable();
    if (!points.length) {
      $("batchOutput").value = "没有可生成的点位：请先给至少一行填入经纬度。";
      return;
    }
    $("batchOutput").value = points.map(p => `${JSON.stringify(p, null, 2)},`).join("\n");
  }

  function nextScreenId(offset = 0) {
    if (offset > 0) return `CS-SCREEN-${String(offset).padStart(3, "0")}`;
    const stamp = Date.now().toString().slice(-5);
    return `CS-SCREEN-${stamp}`;
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const old = button.textContent;
      button.textContent = "已复制";
      setTimeout(() => button.textContent = old, 1200);
    } catch {
      button.textContent = "复制失败";
    }
  }

  function setStatus(text) { $("adminStatus").textContent = text; }
  function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[s])); }
  function attr(value) { return esc(value).replace(/"/g, "&quot;"); }
})();
