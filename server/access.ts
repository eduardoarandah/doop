import type { Canvas } from '../shared/types.ts'

/**
 * Canvas access, Figma-style: private by default. The owner always has
 * access; invited members (canvas_members) always have access; everyone
 * else gets in only when the owner has turned the share link on
 * (linkAccess 'edit' — unset means 'none').
 * Ownerless (pre-auth/legacy) canvases stay open so they can be claimed.
 *
 * Every canvas-scoped surface — REST, the WS join, MCP tools — must gate
 * through this one helper.
 */
/**
 * Instance admins. Deliberately NOT consulted by canAccessCanvas: that gate
 * is shared with MCP, so an admin branch there would hand every agent holding
 * an admin's OAuth token read/write on every canvas in the instance. Admins
 * get their own routes (server/admin.ts), and reach a specific canvas by
 * impersonating its owner — which goes through the gate below as that owner,
 * leaving session.impersonatedBy behind as the audit trail.
 */
export function isAdmin(user: { role?: string | null } | undefined): boolean {
  return user?.role === 'admin'
}

export function canAccessCanvas(userId: string | undefined, canvas: Canvas): boolean {
  if (!canvas.ownerId) return true
  if (!userId) return false
  if (canvas.ownerId === userId) return true
  if (canvas.memberIds?.includes(userId)) return true
  return canvas.linkAccess === 'edit'
}
