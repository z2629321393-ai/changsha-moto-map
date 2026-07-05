# 骑不快的ZZ｜长沙摩托通行提醒地图

这是一个面向普通摩友的“通行风险提醒地图”静态网页项目。

项目定位：

- 看禁摩合围区域；
- 看边界道路、桥隧入口、待核实风险点；
- 输入目的地后规划路线，并检测是否经过已录入风险点；
- 一键打开高德导航；
- 不做“躲摄像头/逃避执法”表达。

## 文件结构

```text
index.html                 正式地图页
preview.html               无高德Key预览页
admin.html                 点位录入助手
assets/styles.css          品牌视觉样式
js/config.js               高德Key配置
js/app.js                  地图和路线风险检测逻辑
data/points.json           点位数据
data/zones.json            禁摩区域/边界线
data/sources.json          数据来源
docs/CODEX_HANDOFF.md      给Codex继续开发的说明
```

## 高德Key配置

打开：

```text
js/config.js
```

填写：

```js
window.MOTO_MAP_CONFIG = {
  amapKey: "你的高德Web端JSAPI Key",
  securityJsCode: "你的securityJsCode"
};
```

本地测试时，高德后台域名白名单建议添加：

```text
localhost
127.0.0.1
```

上线后再添加GitHub Pages域名或你的正式域名。

## 本地运行

不要直接双击 `index.html`。请在项目目录运行：

```bash
python -m http.server 8080
```

浏览器打开：

```text
http://localhost:8080
```

## 主要功能

- 高德地图真实地图加载；
- 禁摩合围区域绘制；
- 点位筛选和搜索；
- 点位弹窗、复制坐标、打开高德；
- 用户定位起点；
- 终点搜索；
- 高德驾车路线规划；
- 路线风险检测；
- 尝试避让禁摩合围区；
- 手机端适配。

## 数据说明

当前种子数据依据公开通告和公开报道整理，坐标仍需复核。网友截图/用户反馈类点位默认只能标记为“待核实”。

正式上线前建议：

1. 修准 `data/zones.json` 边界；
2. 把截图点位整理到 `data/points.json`；
3. 对所有电子眼/抓拍点标注可信度；
4. 页面保留免责声明。

## 免责声明

本地图仅作长沙摩托车通行风险提醒。点位来源于公开通告整理、自采和用户反馈，不代表官方数据；请遵守当地交通法规，以现场交通标志、交警部门公告和实际管制为准。


## 2026-07-05截图点位导入

已根据用户上传的沙湾公园/白沙湾/长沙大道片区截图，粗略加入9个待核实点位。记录见 `docs/USER_SCREENSHOT_IMPORT_2026-07-05.md`。
