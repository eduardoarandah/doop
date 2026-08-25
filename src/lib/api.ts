import type { ActivityItem, Canvas, CanvasMeta, Frame } from '../../shared/types'

export type HomeActivity = ActivityItem & { canvasId: string; canvasName: string }

export interface CanvasMember {
  userId: string
  name: string
  email: string
  owner: boolean
}

export interface DiscoveredPage {
  url: string
  title: string
}

export interface DiscoveredSite {
  siteUrl: string
  pages: DiscoveredPage[]
  truncated: boolean
}

export interface WebsiteImportResult {
  frames: Frame[]
  failures: { url: string; error: string }[]
}
import { getIdentity } from './identity'

function actor() {
  const { clientId, name } = getIdentity()
  return { clientId, name, kind: 'user' as const }
}

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, text: string) {
    super(`${status} ${text}`)
    this.status = status
    try {
      this.body = JSON.parse(text)
    } catch {
      this.body = {}
    }
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json()
}

export const api = {
  listCanvases: () => req<CanvasMeta[]>('/api/canvases'),
  deleteCanvas: (id: string) => req(`/api/canvases/${id}`, { method: 'DELETE' }),
  homeActivity: () => req<HomeActivity[]>('/api/home/activity'),
  createCanvas: (name: string) => req<Canvas>('/api/canvases', { method: 'POST', body: JSON.stringify({ name }) }),
  claimCanvas: (id: string) => req(`/api/canvases/${id}/claim`, { method: 'POST' }),
  renameCanvas: (id: string, name: string) =>
    req('/api/canvases/' + id, { method: 'PATCH', body: JSON.stringify({ name, actor: actor() }) }),
  /* owner-only: what the share link grants people who aren't invited */
  setLinkAccess: (id: string, linkAccess: 'edit' | 'none') =>
    req('/api/canvases/' + id, { method: 'PATCH', body: JSON.stringify({ linkAccess }) }),
  /* collaborators: the owner plus invited members */
  listMembers: (canvasId: string) => req<CanvasMember[]>(`/api/canvases/${canvasId}/members`),
  inviteMember: (canvasId: string, email: string) =>
    req<CanvasMember>(`/api/canvases/${canvasId}/members`, { method: 'POST', body: JSON.stringify({ email }) }),
  removeMember: (canvasId: string, userId: string) =>
    req(`/api/canvases/${canvasId}/members/${userId}`, { method: 'DELETE' }),
  guidelineHistory: (canvasId: string, name: string) =>
    req<{ markdown: string; savedAt: number; savedBy: string }[]>(
      `/api/canvases/${canvasId}/guidelines/${encodeURIComponent(name)}/history`,
    ),
  /* empty markdown deletes the guide; title is the pretty display name */
  setGuideline: (canvasId: string, name: string, markdown: string, title?: string) =>
    req(`/api/canvases/${canvasId}/guidelines/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ markdown, ...(title !== undefined ? { title } : {}) }),
    }),
  /* design memory */
  pinReference: (canvasId: string, frameId: string) =>
    req(`/api/canvases/${canvasId}/references`, { method: 'POST', body: JSON.stringify({ frameId }) }),
  unpinReference: (canvasId: string, refId: string) =>
    req(`/api/canvases/${canvasId}/references/${refId}`, { method: 'DELETE' }),
  resolveProposal: (canvasId: string, proposalId: string, accept: boolean) =>
    req(`/api/canvases/${canvasId}/proposals/${proposalId}`, { method: 'POST', body: JSON.stringify({ accept }) }),
  /* raw image bytes -> permanent /a/ URL (5 MB cap, type sniffed server-side) */
  uploadAsset: async (canvasId: string, blob: Blob) => {
    const res = await fetch(`/api/canvases/${canvasId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    })
    if (!res.ok) {
      if (res.status === 413) throw new Error('image exceeds the 5 MB limit')
      const text = await res.text()
      let msg = `${res.status} ${text}`
      try {
        msg = JSON.parse(text).error || msg
      } catch {
        /* non-JSON error body */
      }
      throw new Error(msg)
    }
    return res.json() as Promise<{ url: string; mime: string; size: number }>
  },
  createFrame: (canvasId: string, input: Partial<Frame> & { name: string }) =>
    req<Frame>(`/api/canvases/${canvasId}/frames`, {
      method: 'POST',
      body: JSON.stringify({ ...input, actor: actor() }),
    }),
  updateFrame: (frameId: string, patch: Partial<Frame>) =>
    req<Frame>('/api/frames/' + frameId, { method: 'PATCH', body: JSON.stringify({ ...patch, actor: actor() }) }),
  deleteFrame: (frameId: string) =>
    req('/api/frames/' + frameId, { method: 'DELETE', body: JSON.stringify({ actor: actor() }) }),
  sendTaskFeedback: (taskId: string, text: string) =>
    req(`/api/tasks/${taskId}/feedback`, { method: 'POST', body: JSON.stringify({ text, from: getIdentity().name }) }),
  importPage: (canvasId: string, url: string) =>
    req<Frame>(`/api/canvases/${canvasId}/import`, { method: 'POST', body: JSON.stringify({ url }) }),
  discoverSitePages: (canvasId: string, url: string) =>
    req<DiscoveredSite>(`/api/canvases/${canvasId}/import/discover`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  importSitePages: (canvasId: string, urls: string[]) =>
    req<WebsiteImportResult>(`/api/canvases/${canvasId}/import`, {
      method: 'POST',
      body: JSON.stringify({ urls }),
    }),
  agentAllowance: () => req<{ used: number; limit: number; connected: boolean }>('/api/agent-allowance'),
  addCard: (canvasId: string, title: string, agents: string[], attachments?: string[]) =>
    req(`/api/canvases/${canvasId}/cards`, { method: 'POST', body: JSON.stringify({ title, agents, attachments }) }),
  completeCard: (canvasId: string, cardId: string) =>
    req(`/api/canvases/${canvasId}/cards/${cardId}/done`, { method: 'POST' }),
  retryCard: (canvasId: string, cardId: string) =>
    req(`/api/canvases/${canvasId}/cards/${cardId}/retry`, { method: 'POST' }),
  addComment: (frameId: string, input: { selector: string; snippet: string; text: string }) =>
    req(`/api/frames/${frameId}/comments`, { method: 'POST', body: JSON.stringify(input) }),
  resolveComment: (commentId: string) => req(`/api/comments/${commentId}/resolve`, { method: 'POST' }),
  retryComment: (commentId: string) => req(`/api/comments/${commentId}/retry`, { method: 'POST' }),
  retryTaskFeedback: (feedbackId: string) => req(`/api/feedback/${feedbackId}/retry`, { method: 'POST' }),
}

export interface AdminCanvas extends CanvasMeta {
  linkAccess: 'edit' | 'none'
  memberCount: number
  owner?: { id: string; name: string; email: string }
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: string | null
  banned: boolean | null
  createdAt: number
  canvasCount: number
}

/** Instance-admin surface. Every route 404s for non-admins, so a failure here
 *  is indistinguishable from the feature not existing — which is the point. */
export const adminApi = {
  canvases: () => req<{ total: number; canvases: AdminCanvas[] }>('/api/admin/canvases'),
  stats: () => req<{ users: number; canvases: number; frames: number }>('/api/admin/stats'),
  users: () => req<AdminUser[]>('/api/admin/users'),

  /* better-auth's own endpoints, not ours: they swap the session cookie, so
     every caller reloads afterwards rather than trying to reconcile state. */
  impersonate: (userId: string) =>
    req('/api/auth/admin/impersonate-user', { method: 'POST', body: JSON.stringify({ userId }) }),
  stopImpersonating: () => req('/api/auth/admin/stop-impersonating', { method: 'POST' }),
}
