// Мини-CDP драйвер для тестов игры в headless Chrome (порт 9333).
// Использование из node_repl:
//   import { cdp, shot, evalJs, mouse } from "D:/ZCode/project2/cdp.mjs"
//   await cdp([["Page.navigate", { url: "http://127.0.0.1:8124/index.html" }]])

const PORT = 9333

async function getTargetWs() {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const page = list.find(t => t.type === "page" && !t.url.startsWith("devtools"))
    if (!page) throw new Error("нет page-таргета")
    return page.webSocketDebuggerUrl
}

// открыть ОДНО соединение на пачку команд; возвращает {send, on, close}
export async function connect() {
    const wsUrl = await getTargetWs()
    const ws = new WebSocket(wsUrl)
    //E-аудит 2026-09-18: если хэндшейк не прошёл (target закрылся между /json/list и
    //handshake), onerror может не прийти — промис висел вечно и подвешивал весь сьют.
    //Таймаут 15с роняет connect() с понятной ошибкой
    await new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error("ws connect timeout (15s): " + wsUrl)), 15000)
        ws.onopen = () => { clearTimeout(timer); res() }
        ws.onerror = () => { clearTimeout(timer); rej(new Error("ws error")) }
    })
    let id = 0
    const pending = new Map()
    const events = []
    ws.onmessage = ev => {
        const m = JSON.parse(ev.data)
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
        else if (m.method) events.push(m)
    }
    const send = (method, params = {}, timeoutMs = 45000) => new Promise((res, rej) => {
        const i = ++id
        //E-аудит 2026-09-18: тихо умерший ws (half-open) оставлял send висеть навсегда —
        //сьют зависал на часы. Каждый вызов ограничен таймаутом (по умолчанию 45с;
        //заведомо долгие — например Page.reload тяжёлой страницы — передают свой больше)
        const timer = setTimeout(() => {
            pending.delete(i)
            rej(new Error(method + ": send timeout (" + timeoutMs + "мс) — ws мертв или цель не отвечает"))
        }, timeoutMs)
        pending.set(i, m => {
            clearTimeout(timer)
            m.error ? rej(new Error(method + ": " + JSON.stringify(m.error))) : res(m.result)
        })
        ws.send(JSON.stringify({ id: i, method, params }))
    })
    return { ws, send, events, close: () => ws.close() }
}

// пачка команд одним соединением
export async function cdp(pairs) {
    const c = await connect()
    const out = []
    try {
        for (const [m, p] of pairs) out.push(await c.send(m, p))
    } finally { c.close() }
    return out
}

// Runtime.evaluate с автожиданием промиса; expr — строка
export async function evalJs(expr, awaitPromise = false) {
    const [r] = await cdp([["Runtime.evaluate", {
        expression: expr, awaitPromise, returnByValue: true, allowUnsafeEvalBlocking: true,
    }]])
    if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 600))
    return r.result.value
}

// скриншот → Uint8Array (для nodeRepl.emitImage)
export async function shot(clip) {
    const params = { format: "png" }
    if (clip) params.clip = { scale: 1, ...clip }
    const [r] = await cdp([["Page.captureScreenshot", params]])
    return new Uint8Array(Buffer.from(r.data, "base64"))
}

// доверенные события мыши (как настоящая мышь: pointer+mouse серия от браузера)
export const mouse = {
    async move(x, y, buttons = 0) {
        await cdp([["Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: buttons ? "left" : "none", buttons, pointerType: "mouse" }]])
    },
    async down(x, y) {
        await cdp([["Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse" }]])
    },
    async up(x, y) {
        await cdp([["Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse" }]])
    },
    async click(x, y) { await this.move(x, y); await this.down(x, y); await this.up(x, y) },
    async drag(x1, y1, x2, y2, steps = 8) {
        await this.move(x1, y1)
        await this.down(x1, y1)
        for (let i = 1; i <= steps; i++) {
            await this.move(Math.round(x1 + (x2 - x1) * i / steps), Math.round(y1 + (y2 - y1) * i / steps), 1)
        }
        await this.up(x2, y2)
    },
}
