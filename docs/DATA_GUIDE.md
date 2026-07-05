# 数据维护说明

## 点位类型

- `official_boundary`：官方边界提示点。
- `risk_road`：重点边界道路代表点。
- `bridge_tunnel`：桥隧/跨江入口复核点。
- `camera_verified`：已核实电子眼。正式发布前必须有可靠来源。
- `camera_unverified`：待核实电子眼。
- `user_report`：用户反馈待核实。

## 字段

```json
{
  "id": "CS-U-001",
  "name": "点位名称",
  "type": "user_report",
  "lng": 112.99,
  "lat": 28.21,
  "direction": "方向/位置",
  "confidence": "待核实",
  "source": "来源",
  "note": "备注",
  "updatedAt": "2026-07-03"
}
```

## 复核建议

1. 用高德坐标，避免百度坐标混入。
2. 点位必须保留来源。
3. 网友投稿不要直接升级为已核实。
4. 电子眼类点位至少要有实拍、公开公告、多名用户交叉反馈之一。
