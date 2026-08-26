import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client, startServer, type Server } from './harness.ts'

/**
 * Design-sync ingest: the doop-sync snippet's endpoint and the key-management
 * REST, exercised against the real server. The page-interval throttle is
 * disabled via env so consecutive writes to the same page can be asserted.
 */

const PORT = 4980

let server: Server
let BASE: string

beforeAll(async () => {
  server = await startServer(PORT, { SYNC_PAGE_INTERVAL_MS: '0' })
  BASE = server.base
}, 70_000)

afterAll(() => server?.stop())

const SNAPSHOT = (marker: string) =>
  `<html><head><title>t</title><meta http-equiv="refresh" content="1"><base href="https://evil.example/"></head>` +
  `<body onload="alert(1)"><script>alert(1)</script><h1 onclick="x()">${marker}</h1>` +
  `<a href="javascript:alert(1)">x</a><iframe src="https://x.example"></iframe></body></html>`

describe('design sync ingest', () => {
  let owner: Client
  let stranger: Client
  let canvasId: string
  let secret: string
  let keyId: string

  beforeAll(async () => {
    owner = new Client(server)
    stranger = new Client(server)
    await owner.signUp('sync-owner@test.dev', 'Owner')
    await stranger.signUp('sync-stranger@test.dev', 'Stranger')
    const canvas = await (await owner.post('/api/canvases', { name: 'Synced' })).json()
    canvasId = canvas.id
  })

  it('members can mint keys; strangers cannot', async () => {
    expect((await stranger.post(`/api/canvases/${canvasId}/sync-keys`, { name: 'nope' })).status).toBe(403)
    expect((await stranger.get(`/api/canvases/${canvasId}/sync-keys`)).status).toBe(403)

    const res = await owner.post(`/api/canvases/${canvasId}/sync-keys`, { name: 'Admin app' })
    expect(res.status).toBe(200)
    const key = await res.json()
    expect(key.secret).toMatch(/^dk_/)
    expect(key.name).toBe('Admin app')
    secret = key.secret
    keyId = key.id

    const list = await (await owner.get(`/api/canvases/${canvasId}/sync-keys`)).json()
    expect(list).toHaveLength(1)
    expect(list[0].frames).toBe(0)
  })

  it('answers CORS preflight and stamps CORS on responses', async () => {
    const preflight = await fetch(`${BASE}/ingest/${secret}`, { method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    const bad = await fetch(`${BASE}/ingest/dk_00000000000000000000000000`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: '/x', html: '<p>x</p>' }),
    })
    expect(bad.status).toBe(404)
    expect(bad.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('creates a frame from a snapshot and scrubs it', async () => {
    const res = await fetch(`${BASE}/ingest/${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: '/orders/:id',
        title: 'Orders',
        url: 'https://intranet.example/orders/1',
        width: 1440,
        height: 2000,
        html: SNAPSHOT('one'),
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBe(true)

    const canvas = await (await owner.get(`/api/canvases/${canvasId}`)).json()
    expect(canvas.frames).toHaveLength(1)
    const frame = canvas.frames[0]
    expect(frame.name).toBe('Orders')
    expect(frame.width).toBe(1440)
    expect(frame.html).toContain('one')
    expect(frame.html).toContain('doop-sync-page')
    expect(frame.html).toContain('Content-Security-Policy')
    /* the app's base is kept, the snapshot's own base and scripts are not */
    expect(frame.html).toContain('base href="https://intranet.example/orders/1"')
    expect(frame.html).not.toContain('evil.example')
    expect(frame.html).not.toContain('<script')
    expect(frame.html).not.toContain('<iframe')
    expect(frame.html).not.toContain('onload=')
    expect(frame.html).not.toContain('onclick=')
    expect(frame.html).not.toContain('javascript:')
    expect(frame.html).not.toContain('http-equiv="refresh"')
  })

  it('updates the same frame on re-sync and reports unchanged replays', async () => {
    const send = (html: string) =>
      fetch(`${BASE}/ingest/${secret}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: '/orders/:id', title: 'Orders v2', url: 'https://intranet.example/', html }),
      })
    const updated = await (await send(SNAPSHOT('two'))).json()
    expect(updated.updated).toBe(true)
    const replay = await (await send(SNAPSHOT('two'))).json()
    expect(replay.unchanged).toBe(true)

    const canvas = await (await owner.get(`/api/canvases/${canvasId}`)).json()
    expect(canvas.frames).toHaveLength(1)
    expect(canvas.frames[0].html).toContain('two')
    expect(canvas.frames[0].name).toBe('Orders v2')
  })

  it('a new page becomes a second frame in the same row', async () => {
    const res = await fetch(`${BASE}/ingest/${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // sendBeacon's content type
      body: JSON.stringify({ page: '/settings', html: '<html><body><h2>Settings</h2></body></html>' }),
    })
    expect((await res.json()).created).toBe(true)
    const canvas = await (await owner.get(`/api/canvases/${canvasId}`)).json()
    expect(canvas.frames).toHaveLength(2)
    const [a, b] = canvas.frames
    expect(b.y).toBe(a.y)
    expect(b.x).toBeGreaterThan(a.x + a.width)

    const list = await (await owner.get(`/api/canvases/${canvasId}/sync-keys`)).json()
    expect(list[0].frames).toBe(2)
    expect(list[0].lastUsedAt).toBeGreaterThan(0)
  })

  it('rejects malformed payloads', async () => {
    const post = (body: unknown) =>
      fetch(`${BASE}/ingest/${secret}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    expect((await post({ page: 'not-rooted', html: '<p>x</p>' })).status).toBe(400)
    expect((await post({ page: '/x' })).status).toBe(400)
    expect((await post({ page: '/big', html: '<p>' + 'x'.repeat(2_600_000) + '</p>' })).status).toBe(413)
  })

  it('link-edit visitors can edit frames but cannot touch sync keys', async () => {
    /* the P1 from review: a share-link visitor must not be able to read or
       mint a durable bearer secret that outlives the link being turned off */
    expect((await owner.patch(`/api/canvases/${canvasId}`, { linkAccess: 'edit' })).status).toBe(200)
    expect((await stranger.get(`/api/canvases/${canvasId}`)).status).toBe(200) // link access works…
    expect((await stranger.get(`/api/canvases/${canvasId}/sync-keys`)).status).toBe(403)
    expect((await stranger.post(`/api/canvases/${canvasId}/sync-keys`, { name: 'sneaky' })).status).toBe(403)
    expect((await stranger.delete(`/api/canvases/${canvasId}/sync-keys/${keyId}`)).status).toBe(403)
    expect((await owner.patch(`/api/canvases/${canvasId}`, { linkAccess: 'none' })).status).toBe(200)
  })

  it('revoked keys stop working immediately', async () => {
    expect((await owner.delete(`/api/canvases/${canvasId}/sync-keys/${keyId}`)).status).toBe(200)
    const res = await fetch(`${BASE}/ingest/${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: '/x', html: '<p>x</p>' }),
    })
    expect(res.status).toBe(404)
  })
})
