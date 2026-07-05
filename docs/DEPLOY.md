# 部署说明

## GitHub Pages

1. 新建仓库，例如 `changsha-moto-map`。
2. 上传项目根目录全部文件。
3. 进入 Settings → Pages。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 等待部署完成。

## 高德Key

在 `js/config.js` 填写：

```js
amapKey: "你的Web端JS API Key"
```

如果高德控制台开启安全密钥校验，则同时填写：

```js
securityJsCode: "你的安全密钥"
```

## 本地测试

```bash
python -m http.server 8080
```

不要直接双击 `index.html`，否则浏览器可能拦截JSON读取。
