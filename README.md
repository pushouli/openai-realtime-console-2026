# OpenAI Realtime Console

*[中文说明](./README.zh-CN.md)*

This is an example application showing how to use the [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) with [WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc).

## Installation and usage

This fork has no server of its own. Connection setup, session configuration, dynamic tools and session records all come from your own backend, so there is no OpenAI API key in this repo. Create a `.env` from the example file and read the comments in there — the only variable you normally need locally is `API_PROXY_TARGET`:

```bash
cp .env.example .env
```

Running this application locally requires [Node.js](https://nodejs.org/) to be installed. Install dependencies for the application with:

```bash
npm install
```

Start the dev server with:

```bash
npm run dev
```

This should start the console application on [http://localhost:5173](http://localhost:5173). In development the page and the backend live on different origins and every call sends cookies, so [`vite.config.js`](./vite.config.js) proxies `/api` to `API_PROXY_TARGET` instead of relying on CORS.

```bash
npm run build
```

builds the React frontend in [`/client`](./client) into `dist/` as a plain static bundle — drop it wherever it is served from the same origin as `/api`, and no proxy is needed.

This application shows how to send and receive Realtime API events over the WebRTC data channel and configure client-side function calling. You can also view the JSON payloads for client and server events using the logging panel in the UI.

For a more comprehensive example, see the [OpenAI Realtime Agents](https://github.com/openai/openai-realtime-agents) demo built with Next.js, using an agentic architecture inspired by [OpenAI Swarm](https://github.com/openai/swarm).

## Previous WebSockets version

The previous version of this application that used WebSockets on the client (not recommended in browsers) [can be found here](https://github.com/openai/openai-realtime-console/tree/websockets).

## License

MIT
