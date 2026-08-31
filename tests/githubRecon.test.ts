import { describe, expect, it } from 'vitest'
import { extractHtml, resolveImport, treeExcerpt } from '../server/githubRecon.ts'

/** The reconstruction pass's pure core: import resolution against a repo
 *  tree, and pulling the HTML document (+ declared height) out of a model
 *  reply. The model call itself is exercised in production, not here. */

describe('resolveImport', () => {
  const paths = new Set([
    'src/pages/index.tsx',
    'src/components/Hero.tsx',
    'src/components/ui/index.ts',
    'src/styles/globals.css',
    'apps/web/src/lib/util.ts',
  ])

  it('resolves relative specifiers with extension and index probing', () => {
    expect(resolveImport('../components/Hero', 'src/pages/index.tsx', paths)).toBe('src/components/Hero.tsx')
    expect(resolveImport('../components/ui', 'src/pages/index.tsx', paths)).toBe('src/components/ui/index.ts')
    expect(resolveImport('../styles/globals.css', 'src/pages/index.tsx', paths)).toBe('src/styles/globals.css')
  })

  it('maps @/ aliases to the nearest src root', () => {
    expect(resolveImport('@/components/Hero', 'src/pages/index.tsx', paths)).toBe('src/components/Hero.tsx')
    expect(resolveImport('@/lib/util', 'apps/web/src/pages/x.tsx', paths)).toBe('apps/web/src/lib/util.ts')
  })

  it('ignores package imports and unresolvable paths', () => {
    expect(resolveImport('react', 'src/pages/index.tsx', paths)).toBeUndefined()
    expect(resolveImport('./missing', 'src/pages/index.tsx', paths)).toBeUndefined()
  })
})

describe('extractHtml', () => {
  it('takes the document from plain text and reads the height comment', () => {
    const { html, height } = extractHtml([
      { type: 'text', text: 'Here it is:\n<!doctype html><html><body>x</body></html>\n<!-- doop-height: 1240 -->' },
    ])
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(height).toBe(1240)
  })

  it('unwraps markdown fences, clamps silly heights, defaults sans comment', () => {
    const fenced = extractHtml([
      { type: 'text', text: '```html\n<!doctype html><p>x</p>\n<!-- doop-height: 99999 -->\n```' },
    ])
    expect(fenced.height).toBe(8000)
    expect(extractHtml([{ type: 'text', text: '<!doctype html><p>x</p>' }]).height).toBe(900)
    expect(() => extractHtml([{ type: 'text', text: 'sorry, no' }])).toThrow(/no HTML/)
  })
})

describe('treeExcerpt', () => {
  it('surfaces styling and locale paths, drops binaries and node_modules', () => {
    const tree = treeExcerpt(
      [
        'src/pages/backup.tsx',
        'src/styles/theme.ts',
        'public/locales/en/backup.json',
        'src/components/Nav.tsx',
        'node_modules/react/index.js',
        'public/logo.png',
        'README.md',
      ],
      'src/pages/backup.tsx',
    )
    expect(tree).toContain('src/styles/theme.ts')
    expect(tree).toContain('public/locales/en/backup.json')
    expect(tree).not.toContain('node_modules')
    /* images stay listed — they are transplantable assets now */
    expect(tree).toContain('public/logo.png')
  })
})

describe('repo asset references', () => {
  it('keeps image paths in the tree so the model can transplant them', () => {
    const tree = treeExcerpt(['public/logos/ibm.svg', 'src/pages/index.tsx'], 'src/pages/index.tsx')
    expect(tree).toContain('public/logos/ibm.svg')
  })

  it('extractHtml raises the height ceiling for full pages', () => {
    const { height } = extractHtml([{ type: 'text', text: '<!doctype html><p>x</p>\n<!-- doop-height: 6600 -->' }])
    expect(height).toBe(6600)
  })
})
