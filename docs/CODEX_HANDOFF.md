# Codex接手说明｜骑不快的ZZ长沙摩托通行提醒地图

## 当前版本状态

这是一个纯前端静态项目，已升级到“真实路线规划 + 风险检测”的接入前状态。

核心文件：

- `index.html`：正式地图页面，高德Key接入后使用真实高德地图。
- `preview.html`：无高德Key的品牌预览页。
- `admin.html`：点位录入工作台，支持地图点击取点、搜索路口取点、单条JSON生成、批量文本转JSON。
- `assets/styles.css`：骑不快的ZZ品牌视觉；点位脉冲已缩小，适合多点位密集显示。
- `js/config.js`：高德Web端JSAPI Key、安全密钥、风险半径等配置。
- `js/app.js`：地图、筛选、弹窗、定位、目的地搜索、驾车路线规划、路线风险检测、尝试避让逻辑。
- `data/points.json`：点位数据。
- `data/zones.json`：禁摩合围区域和边界道路近似线。
- `data/sources.json`：数据来源。

## 必须保持的产品口径

这是“通行风险提醒/合规提醒”，不是“躲电子眼”。

不要在页面、注释、README、标题里写：

- 躲电子眼
- 逃避抓拍
- 规避执法
- 扣分地图

建议表达：

- 禁摩区域提醒
- 边界道路提醒
- 通行风险提醒
- 待核实点位
- 以官方通告和现场标志为准

## 已经实现的路线功能

### 1. 用户流程

1. 用户点“定位”，把当前位置设为起点。
2. 用户输入目的地，例如“长沙南站”。
3. 页面使用 `AMap.PlaceSearch` 搜索目的地。
4. 用户点“规划并检测”。
5. 页面使用 `AMap.Driving` 规划驾车路线。
6. 从高德返回结果里提取 route polyline。
7. 检测路线是否：
   - 进入/穿过 `data/zones.json` 里的禁摩合围 polygon；
   - 靠近 `data/points.json` 里的风险点，默认半径为 `250m`。
8. 页面输出风险列表，并提供“打开高德导航”按钮。

### 2. 尝试避让

页面已加“尝试避让禁摩合围区”开关。

当前逻辑：

- 如果 `AMap.Driving` 暴露 `setAvoidPolygons` 方法，则将 `data/zones.json` 中的主禁摩合围区域简化为最多16个边界点，并尝试传给高德路线规划。
- 如果插件未暴露该方法或失败，则退回普通路线规划 + 风险检测。

注意：不要承诺“百分百自动绕开”。高德App打开后可能重新算路。本项目只能提示风险。

## 高德Key配置

打开：

```js
js/config.js
```

填写：

```js
window.MOTO_MAP_CONFIG = {
  amapKey: "你的高德Web端JSAPI Key",
  securityJsCode: "你的securityJsCode"
};
```

高德后台域名白名单本地测试先加：

```text
localhost
127.0.0.1
```

上线后再加GitHub Pages域名或正式域名。

## 本地运行

不要直接双击HTML。使用本地服务器：

```bash
python -m http.server 8080
```

浏览器打开：

```text
http://localhost:8080
```

## 当前仍需完善的地方

## 2026-07-05 本次增强

1. 已接入用户现有高德 Web JSAPI Key 和 `securityJsCode`，只放在 `js/config.js`。
2. 首页点位已接入 `AMap.MarkerCluster` 聚合；缩小时显示聚合数字，放大后展开单个点位。
3. 点位图标已进一步缩小，适合后续添加大量截图点位。
4. 点位类型已兼容新旧两套命名：
   - 新类型：`camera_verified`、`camera_unverified`、`ban_boundary`、`risky_road`、`bridge_tunnel_entry`
   - 旧类型：`official_boundary`、`risk_road`、`bridge_tunnel`、`user_report`
5. `admin.html` 已升级为点位录入工作台：
   - 地图点击取点，自动填入 `lng/lat`
   - 搜索路口/地标并显示候选结果
   - 点选候选结果后自动填坐标并移动地图
   - 单条点位表单生成 `points.json` 片段
   - 批量文本转表格，逐行搜索坐标或地图选点
   - 一键生成多个 `points.json` 片段
6. 路线规划保留“尝试避让禁摩合围区”开关；如果避让规划失败，会自动改用普通高德路线检测，再失败才退回直线粗测。

### P0：用真实Key测试路线规划

1. 填入Web端JSAPI Key和securityJsCode。
2. 本地运行 `http://localhost:8080`。
3. 测试：定位 → 输入“长沙南站” → 查找 → 规划并检测。
4. 检查控制台是否报错。
5. 若 `AMap.Driving` 在JSAPI 2.0里某个方法名称不同，以高德官方文档为准微调。

### P1：修准禁摩边界

`data/zones.json` 当前是近似边界。需要用高德坐标拾取器、官方道路名和实地截图修正。

要求：

- 主合围区域 polygon 尽量贴合道路。
- 边界道路拆成更细 polyline。
- 坐标系统统一GCJ-02/高德坐标。

### P2：批量导入点位

用户会上传地图截图/点位截图。现在优先使用 `admin.html` 工作台将其整理进：

```text
data/points.json
```

新点位默认不要写“已核实电子眼”，除非有实拍/公告/多源验证。

推荐类型：

- `camera_unverified`：疑似抓拍点，待核实。
- `user_report`：用户反馈点。
- `official_boundary`：官方通告边界点。
- `bridge_tunnel`：桥隧/跨江入口。
- `risk_road`：重点边界道路。

### P3：进一步减少点位拥挤

本版已经缩小点位脉冲并接入 MarkerCluster。如果点位超过500个，建议继续加：

1. 缩放级别小于12时只显示分类聚合数量。
2. 缩放级别大于13再显示单个点位。
3. 使用MarkerCluster点聚合插件。
4. 支持“只看已核实/只看附近3公里”。

### P4：部署

GitHub Pages即可，不需要服务器。若后续改用Web服务API，建议加Cloudflare Worker/Vercel代理，避免Web服务Key直接暴露。

## 验收标准

- 无Key时，`preview.html`能正常看风格。
- 填Key后，`index.html`能显示真实高德地图。
- 点位筛选、搜索、弹窗、复制坐标、打开高德均正常。
- 定位起点、输入终点、路线规划、风险检测正常。
- 点位视觉不过度放大，密集点位不糊成一片。
- 页面所有口径都是“通行风险提醒”，不是“躲避执法”。

## 品牌视觉说明

保持“骑不快的ZZ”风格：

- 深蓝描边：`#17243f`
- 橙色夕阳：`#ff8a3d`
- 风险红色：`#e5484d`
- 玻璃拟态卡片
- 普通摩友工具感
- 文字直白，不要政务风，也不要过度科技风

真实高德地图只负责地图瓦片，外层UI继续保留本项目风格。
