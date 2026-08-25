import { beforeEach, describe, expect, it, vi } from 'vitest'

const importerMocks = vi.hoisted(() => ({ importPage: vi.fn() }))

vi.mock('../server/importer.ts', () => ({ importPage: importerMocks.importPage }))

import { viewWebsite } from '../server/website.ts'
import { WebsiteCaptureUnavailableError } from '../server/websiteAccess.ts'

beforeEach(() => {
  importerMocks.importPage.mockReset()
})

describe('read-only website view', () => {
  it('returns a local preview of the same passive HTML used by webpage imports', async () => {
    const screenshot = Buffer.from('local-preview')
    importerMocks.importPage.mockResolvedValue({
      title: 'Captured page',
      width: 1280,
      height: 700,
      html: '<!doctype html><html><body>Captured</body></html>',
      preview: {
        screenshot,
        finalUrl: 'https://example.com/final',
        description: 'A product page',
        text: 'Visible page text',
        textTruncated: false,
        shotCropped: false,
        pageHeight: 700,
      },
    })

    await expect(viewWebsite('example.com')).resolves.toEqual({
      title: 'Captured page',
      screenshot,
      finalUrl: 'https://example.com/final',
      description: 'A product page',
      text: 'Visible page text',
      textTruncated: false,
      shotCropped: false,
      pageHeight: 700,
    })
    expect(importerMocks.importPage).toHaveBeenCalledWith('example.com', { includePreview: true })
  })

  it('rejects an acquired page that cannot produce a preview', async () => {
    importerMocks.importPage.mockResolvedValue({
      title: 'Captured page',
      width: 1280,
      height: 700,
      html: '<!doctype html><html><body>Captured</body></html>',
    })

    await expect(viewWebsite('https://example.com')).rejects.toBeInstanceOf(WebsiteCaptureUnavailableError)
  })
})
