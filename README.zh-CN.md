# OpenAI Realtime Console

*[English](./README.md)*

基于 [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) 和 [WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc) 的实时语音控制台。

## 安装与运行

本分支没有自己的服务端。建连、会话配置、动态工具、会话记录全部来自你们自己的后端，所以仓库里不需要 OpenAI API key。复制示例文件生成 `.env`，具体变量看文件里的注释——本地开发一般只需要配 `API_PROXY_TARGET` 一项：

```bash
cp .env.example .env
```

本地运行需要安装 [Node.js](https://nodejs.org/)。安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

控制台会跑在 [http://localhost:5173](http://localhost:5173)。开发时页面和后端不同源，而所有请求都要带 cookie，所以 [`vite.config.js`](./vite.config.js) 把 `/api` 转发到 `API_PROXY_TARGET`，而不是依赖 CORS。

```bash
npm run build
```

会把 [`/client`](./client) 下的 React 前端构建成 `dist/` 里的纯静态包——部署到与 `/api` 同源的地方即可，不需要转发。

这个应用演示了如何通过 WebRTC 数据通道收发 Realtime API 事件、以及如何配置客户端函数调用。界面上的日志面板可以查看客户端和服务端事件的 JSON 内容。

更完整的示例可以参考 [OpenAI Realtime Agents](https://github.com/openai/openai-realtime-agents)，它用 Next.js 构建，采用了受 [OpenAI Swarm](https://github.com/openai/swarm) 启发的 agent 架构。

## 旧的 WebSockets 版本

本应用早期在客户端使用 WebSockets 的版本（不推荐在浏览器中使用）[在这里](https://github.com/openai/openai-realtime-console/tree/websockets)。

## License

MIT
