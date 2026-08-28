import { useEffect, useState } from 'react'
import { navigate } from '../App'
import { Logo } from '../components/Logo'
import { AgentIcon } from '../components/AgentIcon'
import { Button } from '../components/ui/button'
import { Wordmark } from '../components/ui/wordmark'
import { cn } from '@/lib/utils'

/* ---- shared landing recipes (converted from the legacy stylesheet) ---- */

/* Scroll reveal: the IntersectionObserver toggles `rv-in` on [data-rv] nodes.
   The `!` mirrors the legacy `.rv-in { … !important }` rule, which also pinned
   transform (so card hover-lifts never moved revealed elements). */
const rv =
  'opacity-0 [transform:translateY(22px)] [transition:opacity_0.7s_ease,transform_0.7s_cubic-bezier(0.2,0.7,0.2,1)] [&.rv-in]:opacity-100! [&.rv-in]:[transform:none]!'

const sectionHead = 'mx-auto max-w-[1180px] px-10 pb-[34px]'
const sectionH2 = 'font-display text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.02em]'
const eyebrow =
  "mb-3 block font-mono text-[12px] uppercase tracking-[0.24em] text-accent-ink before:text-line before:content-['—_']"

/* landing buttons: the page-wide `.lp .btn` transition override */
const lpBtnFx = 'transition-[transform,box-shadow] duration-[180ms] ease-[ease]'
const lpCta = 'inline-flex px-[22px] py-3 text-[15px] no-underline'

/* hero + footer drifting cursors (.lp-cursor) */
const cursor =
  'pointer-events-none absolute z-[3] flex items-start gap-0.5 max-md:[&_svg]:h-[15px] max-md:[&_svg]:w-[15px]'
const cursorTag =
  'mt-3 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white [&_svg]:inline-block [&_svg]:align-[-1px] max-md:mt-2.5 max-md:px-[7px] max-md:py-[1.5px] max-md:text-[10px]'

/* hero self-designing frame elements (.lp-el) */
const lpEl = 'rounded-[5px] bg-paper-deep opacity-0 [animation:lp-appear_9s_ease-out_infinite]'
const lpElCard =
  'h-[74px] flex-1 rounded-[7px] border border-line-soft bg-paper opacity-0 [animation:lp-appear_9s_ease-out_infinite]'

/**
 * Marketing landing for signed-out visitors. The hero is a canvas mid-session
 * (staggered viewport-filling letterforms + real product artifacts); below it,
 * a full page: app showcase mock, manifesto band, how-it-works with a real
 * terminal, feature grid, FAQ and a closing CTA. Sections fade in on scroll.
 */
export function Landing() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('rv-in')),
      { threshold: 0.15 },
    )
    document.querySelectorAll('[data-rv]').forEach((el) => io.observe(el))
    /* the showcase mock keeps its desktop composition on phones by scaling —
       CSS can't divide lengths into a unitless scale, so compute it here */
    const setMockScale = () => {
      document.documentElement.style.setProperty('--mock-scale', String((window.innerWidth - 32) / 1600))
      /* desktop: designed at a native 1600px — fills ~90% of the viewport,
         never upscaled past 1:1, so it stays pixel-sharp */
      document.documentElement.style.setProperty(
        '--mock-scale-lg',
        String(Math.min((window.innerWidth * 0.9) / 1600, 1)),
      )
    }
    setMockScale()
    window.addEventListener('resize', setMockScale)
    /* canvas-zoom: scrolling the hero pushes the camera into the dot grid */
    const lp = document.querySelector('.lp')
    const onScroll = () => {
      const t = Math.min((lp?.scrollTop ?? 0) / (window.innerHeight * 1.2), 1)
      document.documentElement.style.setProperty('--dot-zoom', String(1 + t * 0.9))
    }
    lp?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('resize', setMockScale)
      lp?.removeEventListener('scroll', onScroll)
    }
  }, [])

  const mcpUrl = `${location.origin}/mcp`

  return (
    /* `lp` is a JS hook (querySelector above) — keep the literal class.
       The motion-reduce variants reproduce the legacy landing-wide kill switch. */
    <div className="h-screen overflow-x-hidden overflow-y-auto scroll-smooth bg-white max-md:h-dvh motion-reduce:[&_*]:[animation:none]! motion-reduce:[&_*]:[transition:none]! motion-reduce:[&_[data-rv]]:opacity-100 motion-reduce:[&_[data-rv]]:[transform:none]">
      <nav className="sticky top-0 z-50 flex items-center gap-2.5 border-b border-[rgba(18,18,23,0.06)] bg-[rgba(255,255,255,0.82)] px-10 py-3.5 backdrop-blur-[10px] max-md:px-4 max-md:py-3">
        <Wordmark />
        <div className="ml-7 flex gap-[22px] max-md:hidden">
          <a className="text-[13.5px] font-medium text-ink-soft no-underline hover:text-ink" href="#app">
            Product
          </a>
          <a className="text-[13.5px] font-medium text-ink-soft no-underline hover:text-ink" href="#how">
            How it works
          </a>
          <a className="text-[13.5px] font-medium text-ink-soft no-underline hover:text-ink" href="#faq">
            FAQ
          </a>
          {/* server-rendered page — plain anchor, full load on purpose */}
          <a className="text-[13.5px] font-medium text-ink-soft no-underline hover:text-ink" href="/blog">
            Blog
          </a>
        </div>
        <span className="flex-1" />
        <Button variant="ghost" className={lpBtnFx} onClick={() => navigate('/auth')}>
          Sign in
        </Button>
        <Button variant="primary" className={lpBtnFx} onClick={() => navigate('/auth')}>
          Get started
        </Button>
      </nav>

      {/* hero = a Doop canvas mid-session: dot grid scaled by --dot-zoom */}
      <header className="relative overflow-hidden border-b border-line px-6 pb-24 pt-[46px] text-center [background-image:radial-gradient(var(--dot)_calc(1px_*_var(--dot-zoom,1)),transparent_calc(1px_*_var(--dot-zoom,1)_+_0.5px))] [background-position:center_20%] [background-size:calc(28px_*_var(--dot-zoom,1))_calc(28px_*_var(--dot-zoom,1))] max-md:flex max-md:flex-col max-md:items-center max-md:px-4 max-md:pb-14 max-md:pt-8">
        <div className="ml-[max(24px,3vw)] text-left font-display text-[clamp(28px,5vw,64px)] font-extrabold uppercase tracking-[-0.02em] text-transparent [-webkit-text-stroke:2px_var(--ink)] [transform:rotate(-1.5deg)] [animation:lp-rise_0.8s_cubic-bezier(0.2,0.7,0.2,1)_both] max-md:ml-0 max-md:text-center">
          Design by
        </div>
        <h1
          className="relative z-[1] mx-[calc(-1_*_max(24px,2vw))] mb-[30px] mt-3.5 flex flex-col font-display font-extrabold leading-[0.88] tracking-[-0.05em]"
          aria-label="Agents and Humans"
        >
          <span className="block self-start whitespace-nowrap bg-[image:repeating-linear-gradient(0deg,rgba(18,18,23,0.28)_0_2px,transparent_2px_7px),linear-gradient(100deg,#e5533c_0%,#7a3fe0_30%,#d62a7e_55%,#ff8a3d_80%,#e5533c_100%)] bg-[length:100%_100%,320%_100%] bg-clip-text text-[23vw] text-transparent ml-[max(20px,2vw)] [animation:lp-rise_0.9s_cubic-bezier(0.2,0.7,0.2,1)_both] max-md:ml-0 max-md:self-center max-md:text-[26vw]">
            Agents
          </span>
          {/* legacy note: the `.lp-giant span` animation shorthand outranked the
              `.g-humans` 0.12s delay, so both lines rise together — kept as-is */}
          <span className="block self-end whitespace-nowrap text-[17vw] text-ink mr-[max(20px,2vw)] mt-[-2.5vw] [animation:lp-rise_0.9s_cubic-bezier(0.2,0.7,0.2,1)_both] max-md:mr-0 max-md:mt-[1vw] max-md:self-center max-md:text-[19vw]">
            &amp;&nbsp;Humans
          </span>
        </h1>
        <div className="relative z-[2] mx-auto max-w-[620px]">
          <p className="mx-auto max-w-[36em] text-[17px] leading-[1.6] text-ink-soft max-md:text-[15.5px]">
            Doop is a multiplayer canvas where people and AI agents design side by side. Agents join through MCP — as{' '}
            <strong>yours</strong>, via OAuth — and every frame streams in live, with their status, tasks and your
            feedback flowing both ways.
          </p>
          <div className="mt-[26px] flex items-center justify-center gap-3 max-md:w-full max-md:flex-col">
            <Button
              variant="primary"
              className={cn(lpBtnFx, lpCta, 'w-full justify-center sm:w-auto')}
              onClick={() => navigate('/auth')}
            >
              Start designing — it's free
            </Button>
            <Button asChild variant="ghost" className={cn(lpBtnFx, lpCta, 'w-full justify-center sm:w-auto')}>
              <a href="#how">How it works</a>
            </Button>
          </div>
        </div>

        {/* the frame that designs itself — staged reveal on a 9s loop */}
        <div
          className="absolute right-[max(20px,3vw)] top-[72%] z-[1] w-[300px] rounded-[10px] border border-line bg-surface outline-2 outline-dashed outline-offset-[5px] outline-[rgba(229,83,60,0.55)] [transform:rotate(2deg)] max-md:hidden"
          aria-hidden
        >
          <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
            <span className="text-[12px] font-semibold text-ink-soft">Pricing page</span>
            <span className="font-mono text-[10.5px] text-accent-ink [animation:lp-blink_1.6s_ease-in-out_infinite]">
              ✦ streaming
            </span>
          </div>
          <div className="flex flex-col gap-2.5 px-4 pb-5 pt-[18px]">
            <div className={cn(lpEl, 'h-3.5 w-full [animation-delay:0.4s]')} />
            <div className={cn(lpEl, 'h-[26px] w-[78%] bg-[#dcdce2] [animation-delay:1.2s]')} />
            <div className={cn(lpEl, 'h-2.5 w-[92%] [animation-delay:2s]')} />
            <div className={cn(lpEl, 'h-2.5 w-[60%] [animation-delay:2.5s]')} />
            <div className="flex gap-2.5">
              <div className={cn(lpElCard, '[animation-delay:3.4s]')} />
              <div className={cn(lpElCard, 'border-[rgba(229,83,60,0.5)] [animation-delay:3.9s]')} />
              <div className={cn(lpElCard, '[animation-delay:4.4s]')} />
            </div>
            <div className={cn(lpEl, 'h-[22px] w-[110px] bg-brand [animation-delay:5.4s]')} />
          </div>
        </div>

        {/* drifting cursors */}
        <div
          className={cn(
            cursor,
            'right-[24%] top-[55%] [animation:lp-drift-a_11s_ease-in-out_infinite] max-md:left-[18%] max-md:right-auto max-md:top-[47%]',
          )}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#2D5FE0" stroke="#fff" strokeWidth="1.4" />
          </svg>
          <span className={cn(cursorTag, 'bg-[#2d5fe0]')}>Kevin</span>
        </div>
        <div
          className={cn(
            cursor,
            'left-[22%] top-[22%] [animation:lp-drift-b_9s_ease-in-out_infinite] max-md:left-auto max-md:right-[12%] max-md:top-[12%]',
          )}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#D97757" stroke="#fff" strokeWidth="1.4" />
          </svg>
          <span className={cn(cursorTag, 'bg-[#d97757] [&_svg_path]:fill-white!')}>
            <AgentIcon name="claude" size={11} /> Claude
          </span>
        </div>

        {/* working-now chip + task card + sticky note */}
        <div
          className="absolute left-[max(24px,5vw)] top-[46%] z-[2] flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-ink-soft [transform:rotate(-2deg)] max-md:static max-md:mt-[26px] max-md:inline-flex max-md:[transform:none]"
          aria-hidden
        >
          <span style={{ background: '#D97757' }} />
          <strong className="inline-flex items-center gap-1 font-semibold text-ink [&_svg]:inline-block [&_svg]:align-[-1px]">
            <AgentIcon name="claude" size={12} /> Claude
          </strong>{' '}
          Sketching the pricing grid…
        </div>

        <div
          className="absolute bottom-[110px] left-[max(24px,6vw)] z-[2] flex w-[230px] flex-col gap-[7px] rounded-[10px] border border-line bg-surface px-3.5 py-2.5 [transform:rotate(1.5deg)] max-md:hidden"
          aria-hidden
        >
          <div className="flex items-center gap-2 text-[12.5px] text-ink-faint line-through [text-decoration-thickness:1px]">
            <span className="text-[#1e7a4c]">✓</span> Hero section{' '}
            <i className="ml-auto text-[11px] not-italic text-ink-faint">1m</i>
          </div>
          <div className="flex items-center gap-2 text-[12.5px] text-ink-faint line-through [text-decoration-thickness:1px]">
            <span className="text-[#1e7a4c]">✓</span> Pricing grid{' '}
            <i className="ml-auto text-[11px] not-italic text-ink-faint">2m</i>
          </div>
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
            <span style={{ background: '#E5533C' }} /> Reviewing screenshot{' '}
            <i className="ml-auto text-[11px] not-italic text-ink-faint">now</i>
          </div>
        </div>

        <div
          className="absolute right-[12%] top-[12%] z-[2] bg-[#f5e6a8] px-4 py-3.5 font-mono text-[12px] leading-[1.5] text-[#6b5d1e] [transform:rotate(-3deg)] max-md:hidden"
          aria-hidden
        >
          any MCP agent
          <br />
          can join →
        </div>
      </header>

      {/* ---- app showcase ---- */}
      <section className="pb-10 pt-[110px]" id="app">
        <div className={cn(sectionHead, rv)} data-rv>
          <span className={eyebrow}>The canvas</span>
          <h2 className={sectionH2}>See what every agent is working on — live</h2>
          <p className="mt-2.5 max-w-[40em] text-[15.5px] leading-[1.55] text-ink-soft">
            Agents sync their tasks to the canvas as they work, so you can watch anyone's agent mid-design — not just
            your own. And they share the canvas's memory: what's been designed, decided and commented stays visible to
            the next agent that joins.
          </p>
        </div>
        <div
          className={cn(
            'mx-auto max-md:h-[calc((100vw_-_32px)_*_0.39)] min-[901px]:h-[calc(618px_*_var(--mock-scale-lg,1))] min-[901px]:w-[calc(1600px_*_var(--mock-scale-lg,1))]',
            rv,
          )}
          data-rv
        >
          <ShowcaseMock />
        </div>
      </section>

      {/* ---- manifesto ---- */}
      <section
        className={cn(
          'mt-[100px] border-t-[3px] border-brand bg-ink px-10 py-[90px] text-center text-paper [background-image:radial-gradient(rgba(240,240,245,0.1)_1px,transparent_1px)] [background-size:26px_26px]',
          rv,
        )}
        data-rv
      >
        <p className="mx-auto max-w-[26em] font-display text-[clamp(24px,3.4vw,40px)] font-semibold leading-[1.25] tracking-[-0.02em]">
          Design tools bolted AI on as a <s className="text-[rgba(240,240,245,0.4)]">feature</s>. Doop starts from the
          other end: agents are{' '}
          <em className="bg-[image:linear-gradient(100deg,#ff8a5c,#e5533c_50%,#d62a7e)] bg-clip-text not-italic text-transparent">
            collaborators
          </em>{' '}
          — with presence, tasks and accountability — on the same canvas as the people they work for.
        </p>
        <div className="mt-[34px] flex flex-wrap justify-center gap-3">
          <span className="inline-flex items-center gap-2 py-2 font-mono text-[12px] font-normal uppercase tracking-[0.18em] text-[rgba(240,240,245,0.5)]">
            Works with
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(240,240,245,0.25)] px-[18px] py-2 text-[13.5px] font-semibold text-[rgba(240,240,245,0.85)]">
            <AgentIcon name="claude" size={14} /> Claude Code
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(240,240,245,0.25)] px-[18px] py-2 text-[13.5px] font-semibold text-[rgba(240,240,245,0.85)]">
            <AgentIcon name="codex" size={14} /> Codex
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(240,240,245,0.25)] px-[18px] py-2 text-[13.5px] font-semibold text-[rgba(240,240,245,0.85)]">
            ✦ any MCP client
          </span>
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section className="mx-auto max-w-[1180px] px-10 pb-[30px] pt-[96px] max-md:px-5 max-md:pb-5" id="how">
        <div className={cn(sectionHead, rv)} data-rv>
          <span className={eyebrow}>Workflow</span>
          <h2 className={cn(sectionH2, 'mb-9')}>Three steps to a shared studio</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-7">
          <div
            className={cn(
              'rounded-[14px] border border-line bg-surface px-7 py-[26px] shadow-card hover:shadow-pop hover:[transform:translateY(-4px)]',
              rv,
              '[transition:transform_0.25s_ease,box-shadow_0.25s_ease]',
            )}
            data-rv
          >
            <span className="font-mono text-[13px] tracking-[0.12em] text-accent-ink">01</span>
            <h3 className="mb-2 mt-2.5 font-display text-[20px] font-semibold">Open a canvas</h3>
            <p className="text-[14px] leading-[1.6] text-ink-soft">
              Frames are live HTML artboards. Sketch in the browser, or leave them blank — your agents will fill them.
            </p>
          </div>
          <div
            className={cn(
              'rounded-[14px] border border-line bg-surface px-7 py-[26px] shadow-card hover:shadow-pop hover:[transform:translateY(-4px)]',
              rv,
              '[transition:transform_0.25s_ease,box-shadow_0.25s_ease]',
            )}
            data-rv
          >
            <span className="font-mono text-[13px] tracking-[0.12em] text-accent-ink">02</span>
            <h3 className="mb-2 mt-2.5 font-display text-[20px] font-semibold">Connect your agent</h3>
            <p className="text-[14px] leading-[1.6] text-ink-soft">
              One command, one browser approval — the agent works on the canvas <em className="italic">as you</em>,
              attributed and accountable.
            </p>
          </div>
          <div
            className={cn(
              'rounded-[14px] border border-line bg-surface px-7 py-[26px] shadow-card hover:shadow-pop hover:[transform:translateY(-4px)]',
              rv,
              '[transition:transform_0.25s_ease,box-shadow_0.25s_ease]',
            )}
            data-rv
          >
            <span className="font-mono text-[13px] tracking-[0.12em] text-accent-ink">03</span>
            <h3 className="mb-2 mt-2.5 font-display text-[20px] font-semibold">Design together, live</h3>
            <p className="text-[14px] leading-[1.6] text-ink-soft">
              Designs stream in keystroke by keystroke. Agents narrate tasks, review their work with screenshots, and
              pick up your feedback mid-flight.
            </p>
          </div>
        </div>
        <div
          className={cn('mx-auto mt-11 max-w-[780px] overflow-hidden rounded-[12px] bg-[#131317] shadow-pop', rv)}
          data-rv
        >
          <div className="flex items-center gap-1.5 bg-[#1e1e24] px-3.5 py-2.5">
            <i className="h-2.5 w-2.5 rounded-full bg-[#3a3a44]" />
            <i className="h-2.5 w-2.5 rounded-full bg-[#3a3a44]" />
            <i className="h-2.5 w-2.5 rounded-full bg-[#3a3a44]" />
            <span className="ml-2 font-mono text-[11px] text-[#85858f]">terminal</span>
          </div>
          <pre className="whitespace-pre-wrap break-all px-[22px] pb-6 pt-5 font-mono text-[13px] leading-[1.9] text-[#e6e6eb] max-md:p-4 max-md:text-[11.5px] max-md:leading-[1.8]">
            <span className="text-[#85858f]">$</span> claude mcp add --transport http doop {mcpUrl}
            {'\n'}
            <span className="text-[#85858f]">→</span> browser opens · sign in to Doop · approve
            {'\n'}
            <span className="text-[#8fbf9f]">✓</span> doop connected — your agent now designs{' '}
            <b className="font-semibold text-[#ffb38a]">as you</b>
            <span className="ml-1.5 inline-block h-[15px] w-2 bg-[#8fbf9f] align-[-2px] [animation:lp-blink_1.1s_steps(1)_infinite]" />
          </pre>
        </div>
      </section>

      {/* ---- features ---- */}
      <section className="mt-[100px] border-y border-line bg-paper pb-[70px] pt-[90px]">
        <div className={cn(sectionHead, rv)} data-rv>
          <span className={eyebrow}>Capabilities</span>
          <h2 className={sectionH2}>Built for the pair, not the person</h2>
        </div>
        <div className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6 px-10 pb-5 pt-10 max-md:px-5 max-md:pb-2.5 max-md:pt-6 min-[1000px]:grid-cols-3 min-[1000px]:gap-y-11">
          <div
            className={cn(
              'border-t-2 border-ink pt-[18px] hover:[transform:translateY(-3px)]',
              rv,
              '[transition:transform_0.25s_ease]',
            )}
            data-rv
          >
            <svg className="mb-3 block h-[22px] w-[22px] text-ink" viewBox="0 0 24 24">
              <rect x="3" y="6" width="18" height="3" rx="1.5" fill="currentColor" />
              <rect x="3" y="12" width="12" height="3" rx="1.5" fill="currentColor" />
              <rect x="3" y="18" width="6" height="3" rx="1.5" fill="#e5533c" />
            </svg>
            <h3 className="mb-2 font-display text-[16.5px] font-semibold">Live streaming reveal</h3>
            <p className="text-[13.5px] leading-[1.6] text-ink-soft">
              Agent HTML plays back as a smooth typewriter stream — even one-shot designs feel like watching someone
              work.
            </p>
          </div>
          <div
            className={cn(
              'border-t-2 border-ink pt-[18px] hover:[transform:translateY(-3px)]',
              rv,
              '[transition:transform_0.25s_ease]',
            )}
            data-rv
          >
            <svg className="mb-3 block h-[22px] w-[22px] text-ink" viewBox="0 0 24 24">
              <circle cx="5" cy="6" r="2.4" fill="#e5533c" />
              <rect x="10" y="4.5" width="11" height="3" rx="1.5" fill="currentColor" />
              <circle cx="5" cy="14" r="2.4" fill="currentColor" />
              <rect x="10" y="12.5" width="8" height="3" rx="1.5" fill="currentColor" />
            </svg>
            <h3 className="mb-2 font-display text-[16.5px] font-semibold">Tasks &amp; narration</h3>
            <p className="text-[13.5px] leading-[1.6] text-ink-soft">
              Agents announce what they're working on. The Tasks panel keeps a per-agent history — a standup that writes
              itself.
            </p>
          </div>
          <div
            className={cn(
              'border-t-2 border-ink pt-[18px] hover:[transform:translateY(-3px)]',
              rv,
              '[transition:transform_0.25s_ease]',
            )}
            data-rv
          >
            <svg className="mb-3 block h-[22px] w-[22px] text-ink" viewBox="0 0 24 24">
              <path d="M4 4 h16 v10 h-9 l-4.5 5 v-5 H4 Z" fill="currentColor" />
              <circle cx="17" cy="9" r="2.2" fill="#e5533c" />
            </svg>
            <h3 className="mb-2 font-display text-[16.5px] font-semibold">Feedback that lands</h3>
            <p className="text-[13.5px] leading-[1.6] text-ink-soft">
              Reply to any task and your note becomes an open request on the canvas — the next agent to call in picks it
              up.
            </p>
          </div>
          <div
            className={cn(
              'border-t-2 border-ink pt-[18px] hover:[transform:translateY(-3px)]',
              rv,
              '[transition:transform_0.25s_ease]',
            )}
            data-rv
          >
            <svg className="mb-3 block h-[22px] w-[22px] text-ink" viewBox="0 0 24 24">
              <path d="M4 3 L18 11 L11 12.5 L8 19 Z" fill="currentColor" />
              <circle cx="18" cy="18" r="4" fill="#e5533c" />
            </svg>
            <h3 className="mb-2 font-display text-[16.5px] font-semibold">Agents carry their owner</h3>
            <p className="text-[13.5px] leading-[1.6] text-ink-soft">
              MCP OAuth means every agent belongs to a person. No anonymous edits — presence and tasks name the human
              behind the bot.
            </p>
          </div>
          <div
            className={cn(
              'border-t-2 border-ink pt-[18px] hover:[transform:translateY(-3px)]',
              rv,
              '[transition:transform_0.25s_ease]',
            )}
            data-rv
          >
            <svg className="mb-3 block h-[22px] w-[22px] text-ink" viewBox="0 0 24 24">
              <rect x="3" y="5" width="18" height="14" rx="2.5" fill="currentColor" />
              <circle cx="12" cy="12" r="4" fill="#fcfcfb" />
              <circle cx="12" cy="12" r="1.8" fill="#e5533c" />
            </svg>
            <h3 className="mb-2 font-display text-[16.5px] font-semibold">Agents see their work</h3>
            <p className="text-[13.5px] leading-[1.6] text-ink-soft">
              A built-in headless renderer hands agents screenshots of their own frames, so they review and fix before
              you have to.
            </p>
          </div>
          <div
            className={cn(
              'border-t-2 border-ink pt-[18px] hover:[transform:translateY(-3px)]',
              rv,
              '[transition:transform_0.25s_ease]',
            )}
            data-rv
          >
            <svg className="mb-3 block h-[22px] w-[22px] text-ink" viewBox="0 0 24 24">
              <ellipse cx="12" cy="6" rx="8" ry="3" fill="currentColor" />
              <path
                d="M4 6 v12 c0 1.7 3.6 3 8 3 s8 -1.3 8 -3 V6"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
              />
              <ellipse cx="12" cy="18" rx="3" ry="1.4" fill="#e5533c" />
            </svg>
            <h3 className="mb-2 font-display text-[16.5px] font-semibold">Everything persists</h3>
            <p className="text-[13.5px] leading-[1.6] text-ink-soft">
              Canvases, tasks and feedback live in Postgres, owned by your account. Share a canvas with a link,
              Figma-style.
            </p>
          </div>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section className="pb-10 pt-[96px]" id="faq">
        <div className={cn(sectionHead, rv)} data-rv>
          <span className={eyebrow}>Questions</span>
          <h2 className={sectionH2}>Asked and answered</h2>
        </div>
        <div className={cn('mx-auto flex max-w-[780px] flex-col px-10', rv)} data-rv>
          <details className="border-t border-line py-1 last:border-b">
            <summary className="flex cursor-pointer list-none items-center py-4 font-display text-[17px] font-semibold after:ml-auto after:text-[20px] after:font-normal after:text-ink-faint after:content-['+'] [[open]>&]:after:content-['–']">
              Which agents can join?
            </summary>
            <p className="max-w-[44em] pb-[18px] text-[14.5px] leading-[1.65] text-ink-soft">
              Anything that speaks MCP over streamable HTTP with OAuth — Claude Code and Codex out of the box, and any
              other MCP client pointed at your canvas's{' '}
              <code className="rounded-[4px] bg-paper-deep px-1.5 py-[1px] font-mono text-[12.5px]">/mcp</code>{' '}
              endpoint.
            </p>
          </details>
          <details className="border-t border-line py-1 last:border-b">
            <summary className="flex cursor-pointer list-none items-center py-4 font-display text-[17px] font-semibold after:ml-auto after:text-[20px] after:font-normal after:text-ink-faint after:content-['+'] [[open]>&]:after:content-['–']">
              Do agents need my API keys?
            </summary>
            <p className="max-w-[44em] pb-[18px] text-[14.5px] leading-[1.65] text-ink-soft">
              No. Your agent keeps running wherever it already runs, on whatever model you already pay for. Doop is the
              canvas it connects to — not another AI subscription.
            </p>
          </details>
          <details className="border-t border-line py-1 last:border-b">
            <summary className="flex cursor-pointer list-none items-center py-4 font-display text-[17px] font-semibold after:ml-auto after:text-[20px] after:font-normal after:text-ink-faint after:content-['+'] [[open]>&]:after:content-['–']">
              How does an agent become "mine"?
            </summary>
            <p className="max-w-[44em] pb-[18px] text-[14.5px] leading-[1.65] text-ink-soft">
              When you add the MCP server, a browser window opens and you approve the connection while signed in. From
              then on its bearer token carries your identity — its tasks literally read "for you".
            </p>
          </details>
          <details className="border-t border-line py-1 last:border-b">
            <summary className="flex cursor-pointer list-none items-center py-4 font-display text-[17px] font-semibold after:ml-auto after:text-[20px] after:font-normal after:text-ink-faint after:content-['+'] [[open]>&]:after:content-['–']">
              Can I self-host it?
            </summary>
            <p className="max-w-[44em] pb-[18px] text-[14.5px] leading-[1.65] text-ink-soft">
              Yes — Doop is a single Docker container plus Postgres, open on GitHub. Point{' '}
              <code className="rounded-[4px] bg-paper-deep px-1.5 py-[1px] font-mono text-[12.5px]">
                BETTER_AUTH_URL
              </code>{' '}
              at your domain and you're running the whole thing, agents and all.
            </p>
          </details>
        </div>
      </section>

      {/* ---- final CTA ---- */}
      <section className={cn('px-10 pb-[120px] pt-[110px] text-center', rv)} data-rv>
        <h2 className="font-display text-[clamp(48px,9vw,120px)] font-extrabold leading-none tracking-[-0.04em]">
          Start{' '}
          <em className="bg-[image:linear-gradient(100deg,#e5533c,#7a3fe0_45%,#d62a7e_75%,#e5533c)] bg-[length:300%_100%] bg-clip-text not-italic text-transparent [animation:lp-ink-flow_8s_linear_infinite]">
            designing.
          </em>
        </h2>
        <p className="mb-7 mt-[18px] text-[16px] text-ink-soft">
          Free while in beta. Bring your people — and your agents.
        </p>
        <div className="group relative inline-flex items-center gap-[18px]">
          <svg
            className="[transform:translate(6px,-4px)_rotate(12deg)] [transition:transform_0.3s_ease] group-hover:[transform:translate(12px,0)_rotate(12deg)]"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden
          >
            <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#D97757" stroke="#fff" strokeWidth="1.4" />
          </svg>
          <Button variant="primary" className={cn(lpBtnFx, lpCta)} onClick={() => navigate('/auth')}>
            Create your canvas
          </Button>
          <svg
            className="[transform:translate(-6px,6px)_rotate(255deg)] [transition:transform_0.3s_ease] group-hover:[transform:translate(-12px,0)_rotate(255deg)]"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden
          >
            <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#2D5FE0" stroke="#fff" strokeWidth="1.4" />
          </svg>
        </div>
      </section>

      {/* impression footer: dark band, link columns, then a colossal cropped
          wordmark in the hero's scanline ink with the brand cursors drifting over */}
      <footer className="overflow-hidden bg-ink text-paper">
        <div className="mx-auto flex max-w-[1180px] flex-wrap gap-[60px] px-10 pb-[30px] pt-16 max-md:gap-[34px] max-md:px-5 max-md:pb-5 max-md:pt-11">
          <div className="flex min-w-[220px] flex-1 flex-col gap-2.5">
            <Wordmark className="text-paper" />
            <span className="text-[13.5px] italic text-[rgba(240,240,245,0.55)]">Humans &amp; agents, one canvas.</span>
          </div>
          <div className="flex flex-col gap-[9px]">
            <b className="mb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-[rgba(240,240,245,0.45)]">
              Product
            </b>
            <a
              className="cursor-pointer text-[14px] text-[rgba(240,240,245,0.75)] no-underline hover:text-white"
              href="#app"
            >
              The canvas
            </a>
            <a
              className="cursor-pointer text-[14px] text-[rgba(240,240,245,0.75)] no-underline hover:text-white"
              href="#how"
            >
              How it works
            </a>
            <a
              className="cursor-pointer text-[14px] text-[rgba(240,240,245,0.75)] no-underline hover:text-white"
              href="#faq"
            >
              FAQ
            </a>
            <a
              className="cursor-pointer text-[14px] text-[rgba(240,240,245,0.75)] no-underline hover:text-white"
              href="/blog"
            >
              Blog
            </a>
          </div>
          <div className="flex flex-col gap-[9px]">
            <b className="mb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-[rgba(240,240,245,0.45)]">
              Get going
            </b>
            <a
              className="cursor-pointer text-[14px] text-[rgba(240,240,245,0.75)] no-underline hover:text-white"
              onClick={() => navigate('/auth')}
            >
              Sign in
            </a>
            <a
              className="cursor-pointer text-[14px] text-[rgba(240,240,245,0.75)] no-underline hover:text-white"
              onClick={() => navigate('/auth')}
            >
              Create an account
            </a>
            <a
              className="cursor-pointer text-[14px] text-[rgba(240,240,245,0.75)] no-underline hover:text-white"
              href="https://github.com/kgoedecke/design-multiplayer"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
          </div>
        </div>
        <div className="relative mt-[26px]" aria-hidden>
          <span className="block select-none whitespace-nowrap bg-[image:repeating-linear-gradient(0deg,rgba(23,23,28,0.5)_0_2px,transparent_2px_7px),linear-gradient(100deg,#e5533c_0%,#7a3fe0_30%,#d62a7e_55%,#ff8a3d_80%,#e5533c_100%)] bg-[length:100%_100%,320%_100%] bg-clip-text text-center font-display text-[17.5vw] font-extrabold leading-[0.72] tracking-[-0.03em] text-transparent [animation:lp-ink-flow_10s_linear_infinite] [transform:translateY(0.14em)] max-md:text-[24vw]">
            DOOP
          </span>
          <div className={cn(cursor, 'left-[22%] top-[8%] [animation:lp-drift-b_9s_ease-in-out_infinite]')}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#D97757" stroke="#17150f" strokeWidth="1.4" />
            </svg>
            <span className={cn(cursorTag, 'bg-[#d97757] [&_svg_path]:fill-white!')}>
              <AgentIcon name="claude" size={11} /> Claude
            </span>
          </div>
          <div className={cn(cursor, 'right-[24%] top-[40%] [animation:lp-drift-a_12s_ease-in-out_infinite]')}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#2D5FE0" stroke="#17150f" strokeWidth="1.4" />
            </svg>
            <span className={cn(cursorTag, 'bg-[#2d5fe0]')}>Kevin</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* Beat durations (ms): idle → task starts → frame streams in → screenshot review → feedback lands → done */
const PLAY = [1600, 1800, 6200, 3000, 4200, 3400]

/* ---- showcase screenplay recipes ---- */
const editorChip = 'editor-chip px-[9px] py-[2.5px] text-[11px]'
const mkLabel =
  'absolute -top-[30px] left-0 flex items-center gap-2 whitespace-nowrap text-[13px] font-semibold text-ink-soft'
const mkBody = 'overflow-hidden rounded-[6px] border border-line bg-white shadow-card'
const mfCanvas = 'flex flex-col gap-2.5 p-4'
const mockAv =
  'inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface text-[12.5px] font-bold text-white'
const mockBtn = 'rounded-[8px] border border-line bg-surface px-[13px] py-1.5 text-[13px] font-semibold'
const mockAgentI = 'text-[11.5px] font-medium not-italic text-ink-faint'
const mockTask = 'flex items-center gap-1.5 pl-1 text-[12.5px] text-ink-soft'
const mockTaskTime = 'ml-auto text-[11px] not-italic text-ink-faint'
const pulseDot = 'h-2 w-2 flex-none rounded-full'
const wnPill =
  'flex w-fit items-center gap-2 rounded-full border border-line bg-surface py-[7px] pl-[11px] pr-3.5 text-[12.5px] text-ink-soft shadow-card'
const spSay = 'inline-block [animation:sp-say-in_0.45s_ease_both]'
const spTask =
  'opacity-0 [transform:translateX(5px)] [transition:opacity_0.4s_ease_0.3s,transform_0.4s_ease_0.3s] group-[.pb1]:opacity-100 group-[.pb1]:[transform:none]'
const mkCursor =
  'pointer-events-none absolute z-[6] flex gap-0.5 [transition:left_1.1s_cubic-bezier(0.3,0.7,0.2,1),top_1.1s_cubic-bezier(0.3,0.7,0.2,1),right_1.1s_cubic-bezier(0.3,0.7,0.2,1)]'
const mkCursorTag =
  'mt-[11px] inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold text-white [&_svg_path]:fill-white!'
const tbBtn = 'rounded-[8px] px-3 py-[5px] text-[13px] font-semibold text-ink'
const tbDiv = 'mx-1 h-[18px] w-px bg-line'
const sfEl = 'rounded-[5px] bg-paper-deep opacity-0'
const sfCard =
  'flex h-[118px] flex-1 flex-col gap-[5px] rounded-[8px] border border-line-soft bg-surface px-2 py-[9px] opacity-0'
const sfShotI = 'block rounded-[2px] bg-paper-deep'

/**
 * The app showcase as a looping scripted screenplay — real DOM, no video.
 * Beats accumulate as pb0…pbN classes on the root (state hooks for the
 * group-[.pbN] variants); CSS transitions with per-beat delays do the acting,
 * React only swaps the narrated text.
 */
function ShowcaseMock() {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [beat, setBeat] = useState(still ? PLAY.length - 1 : 0)
  useEffect(() => {
    if (still) return
    let t: number
    const step = (b: number) => {
      setBeat(b)
      t = window.setTimeout(() => step((b + 1) % PLAY.length), PLAY[b])
    }
    t = window.setTimeout(() => step(1), PLAY[0])
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const strip = [
    'Reading canvas memory…',
    'Sketching the pricing grid…',
    'Streaming the pricing grid…',
    'Reviewing my screenshot…',
    "Applying Kevin's feedback…",
    'Pricing grid finished',
  ][beat]
  const chip = [
    '',
    '✦ Claude is designing…',
    '✦ Claude is designing…',
    'reviewing screenshot…',
    'applying feedback…',
    '✓ done',
  ][beat]
  const task = [
    'Sketching the pricing grid',
    'Sketching the pricing grid',
    'Streaming the pricing grid',
    'Reviewing the screenshot',
    "Applying Kevin's feedback",
    'Pricing grid',
  ][beat]
  const done = beat === PLAY.length - 1

  return (
    <div
      className={cn(
        'group overflow-hidden rounded-[16px] border border-line bg-surface text-[13.5px] shadow-[0_2px_8px_rgba(18,18,23,0.06),0_40px_90px_-30px_rgba(18,18,23,0.4)]',
        'max-md:w-[1600px] max-md:origin-top-left max-md:[transform:scale(var(--mock-scale,0.34))]',
        'min-[901px]:w-[1600px] min-[901px]:origin-top-left min-[901px]:[transform:scale(var(--mock-scale-lg,1))]',
        ['pb0', 'pb1', 'pb2', 'pb3', 'pb4', 'pb5'].slice(0, beat + 1).join(' '),
      )}
      aria-hidden
    >
      <div className="flex items-center gap-3 border-b border-line bg-paper px-4 py-3">
        <span>
          <Logo className="block h-[26px] w-[26px]" />
        </span>
        <span className="text-[15px] font-bold">spring-launch</span>
        <span className="rounded-[5px] bg-paper-deep px-2 py-[3px] font-mono text-[12px] text-ink-faint">
          Xq3wThV9pK
        </span>
        <span className="flex-1" />
        <span className={cn(mockAv, 'bg-[#2d5fe0]')}>K</span>
        <span className={cn(mockAv, '-ml-2.5 bg-[#1e7a4c]')}>A</span>
        <span className={cn(mockAv, '-ml-2.5 rounded-[8px] bg-[#d97757] [&_svg]:fill-white')}>
          <AgentIcon name="claude" size={15} />
        </span>
        <span className={mockBtn}>Share</span>
        <span className={cn(mockBtn, 'border-accent-ink bg-brand text-white')}>✦ Connect AI</span>
      </div>
      <div className="relative">
        <div className="relative min-h-[566px] overflow-hidden bg-paper [background-image:radial-gradient(var(--dot)_1.2px,transparent_1.2px)] [background-size:24px_24px]">
          <div className="absolute left-[56px] top-[56px] w-[400px]">
            <div className={mkLabel}>Hero — Terrarium</div>
            <span className="absolute -right-[11px] top-[46px] z-[3] flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white bg-[#2d5fe0] text-[12px] shadow-card">
              💬
            </span>
            <div className={cn(mkBody, mfCanvas, 'relative min-h-[212px] overflow-hidden bg-[#0f1e17]')}>
              <div className="absolute -right-10 -top-10 h-[130px] w-[130px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#2e4a38,#13291e)]" />
              <div className="h-[7px] w-[110px] rounded-[3px] bg-[#8fbf9f] opacity-80" />
              <div className="mt-2.5 h-5 w-[78%] rounded-[4px] bg-[#f1f1f4]" />
              <div className="mt-0 h-5 w-[45%] rounded-[4px] bg-[#c9e4a5]" />
              <div className="mt-2 h-[9px] w-[85%] rounded-[3px] bg-[#b9c4b2] opacity-50" />
              <div className="mt-3.5 h-6 w-[100px] rounded-full bg-[#c9e4a5]" />
            </div>
          </div>
          {/* Ana keeps working the poster the whole time */}
          <div className="absolute left-[570px] top-[285px] w-[260px] [transition:transform_0.9s_cubic-bezier(0.3,0.7,0.2,1)] group-[.pb3]:[transform:translate(-12px,-10px)]">
            <div className={mkLabel}>
              Poster — Doop launch
              <span className={editorChip} style={{ background: '#1E7A4C' }}>
                ✎ Ana
              </span>
            </div>
            <div
              className={cn(
                mkBody,
                mfCanvas,
                'relative min-h-[158px] bg-[image:linear-gradient(140deg,#7a3fe0,#d62a7e_60%,#ff8a3d)]',
              )}
            >
              <div className="font-display text-[42px] font-extrabold tracking-[-0.03em] text-white [transition:letter-spacing_0.9s_ease] group-[.pb2]:tracking-[0.05em]">
                DOOP
              </div>
              <div className="h-2 w-[60%] rounded-[4px] bg-[rgba(255,255,255,0.65)] [transition:width_0.8s_cubic-bezier(0.3,0.7,0.2,1),background_0.8s_ease] group-[.pb3]:w-[86%] group-[.pb3]:bg-[rgba(255,255,255,0.92)]" />
              <div className="mt-3 flex gap-1.5">
                <i className="h-[11px] w-[11px] rounded-full bg-[rgba(255,255,255,0.8)] [transition:transform_0.7s_cubic-bezier(0.3,0.7,0.2,1.3)]" />
                <i className="h-[11px] w-[11px] rounded-full bg-[rgba(255,255,255,0.8)] [transition:transform_0.7s_cubic-bezier(0.3,0.7,0.2,1.3)] group-[.pb4]:[transform:translateX(17px)]" />
                <i className="h-[11px] w-[11px] rounded-full bg-[rgba(255,255,255,0.8)] [transition:transform_0.7s_cubic-bezier(0.3,0.7,0.2,1.3)] group-[.pb4]:[transform:translateX(-17px)]" />
              </div>
            </div>
          </div>
          {/* the working frame: outline arms on beat 1 (actor color), green settle glow at the end */}
          <div className="absolute right-[350px] top-[56px] w-[400px]">
            <div className={mkLabel}>
              Pricing{' '}
              {chip && (
                <span key={chip} className={editorChip} style={{ background: done ? '#1E7A4C' : '#D97757' }}>
                  {chip}
                </span>
              )}
            </div>
            <div
              className={cn(
                mkBody,
                mfCanvas,
                'relative min-h-[294px] overflow-hidden outline-2 outline-offset-2 outline-transparent [transition:outline-color_0.4s_ease] group-[.pb1:not(.pb5)]:outline-[#d97757] group-[.pb5]:[animation:sp-reveal_1.6s_ease-out_forwards]',
              )}
            >
              <div
                className={cn(
                  sfEl,
                  'flex h-4 w-full items-center justify-end gap-[5px] pr-1.5',
                  'group-[.pb2]:[animation:sp-land_0.55s_cubic-bezier(0.2,0.9,0.25,1.2)_0.15s_both]',
                )}
              >
                <i className="h-1.5 w-5 rounded-[3px] bg-[#cfcfd6]" />
                <i className="h-1.5 w-5 rounded-[3px] bg-[#cfcfd6]" />
                <i className="h-1.5 w-5 rounded-[3px] bg-[#cfcfd6]" />
              </div>
              <div
                className={cn(
                  sfEl,
                  'h-[26px] w-[72%] bg-[#d4d4db]',
                  'group-[.pb2]:[animation:sp-land_0.55s_cubic-bezier(0.2,0.9,0.25,1.2)_0.8s_both]',
                )}
              />
              <div
                className={cn(
                  sfEl,
                  'h-2.5 w-[92%]',
                  'group-[.pb2]:[animation:sp-land_0.55s_cubic-bezier(0.2,0.9,0.25,1.2)_1.5s_both]',
                )}
              />
              <div className="flex gap-2">
                <div
                  className={cn(
                    sfCard,
                    'group-[.pb2]:[animation:sp-land_0.55s_cubic-bezier(0.2,0.9,0.25,1.2)_2.1s_both]',
                  )}
                >
                  <i className="block h-[7px] w-[60%] rounded-[3px] bg-paper-deep" />
                  <i className="block h-3.5 w-[45%] rounded-[3px] bg-[#d4d4db]" />
                  <i className="block h-[5px] w-[90%] rounded-[3px] bg-paper-deep" />
                  <i className="block h-[5px] w-[70%] rounded-[3px] bg-paper-deep" />
                  <i className="mt-auto block h-3.5 w-full rounded-[5px] bg-paper-deep" />
                </div>
                {/* the middle card lands crooked on purpose — the review beat catches it */}
                <div
                  className={cn(
                    sfCard,
                    'border-[rgba(229,83,60,0.45)]',
                    'group-[.pb2:not(.pb3)]:[animation:sp-land-crooked_0.55s_cubic-bezier(0.2,0.9,0.25,1.2)_2.8s_both]',
                    'group-[.pb3]:[animation:sp-snap_0.7s_cubic-bezier(0.2,0.9,0.25,1.2)_1.6s_both]',
                  )}
                >
                  <i className="block h-[7px] w-[60%] rounded-[3px] bg-paper-deep" />
                  <i className="block h-3.5 w-[45%] rounded-[3px] bg-[#d4d4db]" />
                  <i className="block h-[5px] w-[90%] rounded-[3px] bg-paper-deep" />
                  <i className="block h-[5px] w-[70%] rounded-[3px] bg-paper-deep" />
                  <i className="mt-auto block h-3.5 w-full rounded-[5px] bg-brand" />
                </div>
                <div
                  className={cn(
                    sfCard,
                    'group-[.pb2]:[animation:sp-land_0.55s_cubic-bezier(0.2,0.9,0.25,1.2)_3.5s_both]',
                  )}
                >
                  <i className="block h-[7px] w-[60%] rounded-[3px] bg-paper-deep" />
                  <i className="block h-3.5 w-[45%] rounded-[3px] bg-[#d4d4db]" />
                  <i className="block h-[5px] w-[90%] rounded-[3px] bg-paper-deep" />
                  <i className="block h-[5px] w-[70%] rounded-[3px] bg-paper-deep" />
                  <i className="mt-auto block h-3.5 w-full rounded-[5px] bg-paper-deep" />
                </div>
              </div>
              <div
                className={cn(
                  sfEl,
                  'h-[22px] w-[120px] bg-brand',
                  'group-[.pb2]:[animation:sp-land_0.55s_cubic-bezier(0.2,0.9,0.25,1.2)_4.3s_both]',
                )}
              />
              <div
                className={cn(
                  sfEl,
                  'h-5 w-full [transition:background_0.6s_ease]',
                  'group-[.pb2:not(.pb4)]:[animation:sp-land_0.55s_cubic-bezier(0.2,0.9,0.25,1.2)_4.9s_both]',
                  'group-[.pb4]:bg-[#17150f] group-[.pb4]:[animation:sp-land_0.55s_ease_2.2s_both]',
                )}
              />
              {/* the stream caret rides just below whatever was last written */}
              <div className="absolute left-4 right-4 top-[18px] h-[3px] rounded-[2px] bg-brand opacity-0 shadow-[0_0_10px_rgba(229,83,60,0.55)] group-[.pb2:not(.pb3)]:[animation:sp-caret_5.6s_ease-in-out_0.1s_both]" />
              {/* beat 3 — screenshot flash + polaroid pop */}
              <div className="pointer-events-none absolute inset-0 bg-white opacity-0 group-[.pb3]:[animation:sp-flash_0.9s_ease_0.25s]" />
              <div className="pointer-events-none absolute right-2.5 top-[30px] flex h-[72px] w-24 flex-col gap-[5px] rounded-[6px] border border-line bg-white px-[7px] py-2 opacity-0 shadow-[0_10px_24px_-8px_rgba(18,18,23,0.5)] [transform:rotate(3deg)] group-[.pb3:not(.pb4)]:[animation:sp-shot_2.7s_ease_0.5s_both]">
                <i className={cn(sfShotI, 'h-1.5 w-[70%]')} />
                <i className={cn(sfShotI, 'h-5 w-[90%]')} />
                <i className={cn(sfShotI, 'h-1.5 w-[55%]')} />
              </div>
            </div>
          </div>
          {/* a new frame pops onto the canvas and Codex claims it */}
          <div className="absolute right-[354px] top-[400px] w-[340px] opacity-0 [transform:translateY(16px)_scale(0.95)] group-[.pb4]:[animation:sp-pop_0.7s_cubic-bezier(0.2,0.9,0.3,1.25)_0.6s_both]">
            <div className={mkLabel}>
              Footer
              <span className={editorChip} style={{ background: '#17150F' }}>
                ✦ Codex
              </span>
            </div>
            <div className={cn(mkBody, mfCanvas, 'min-h-[64px]')}>
              <div className={cn(sfEl, 'h-2.5 w-[88%]', 'group-[.pb5]:[animation:sp-land_0.5s_ease_0.5s_both]')} />
              <div className={cn(sfEl, 'h-2.5 w-[64%]', 'group-[.pb5]:[animation:sp-land_0.5s_ease_1.1s_both]')} />
              <div
                className={cn(
                  sfEl,
                  'h-3.5 w-[40%] bg-[#17150f]',
                  'group-[.pb5]:[animation:sp-land_0.5s_ease_1.7s_both]',
                )}
              />
            </div>
          </div>
          {/* cursors follow the work instead of drifting */}
          <div
            className={cn(
              mkCursor,
              'left-[620px] top-[345px]',
              'group-[.pb1:not(.pb2)]:left-[710px] group-[.pb1:not(.pb2)]:top-[365px]',
              'group-[.pb2:not(.pb3)]:left-[640px] group-[.pb2:not(.pb3)]:top-[400px]',
              'group-[.pb3:not(.pb4)]:left-[680px] group-[.pb3:not(.pb4)]:top-[430px]',
              'group-[.pb4:not(.pb5)]:left-[725px] group-[.pb4:not(.pb5)]:top-[465px]',
              'group-[.pb5]:left-[770px] group-[.pb5]:top-[390px]',
            )}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#1E7A4C" stroke="#fff" strokeWidth="1.6" />
            </svg>
            <span className={cn(mkCursorTag, 'bg-[#1e7a4c]')}>Ana</span>
          </div>
          <div
            className={cn(mkCursor, 'right-[360px] top-[370px] group-[.pb4]:right-[400px] group-[.pb4]:top-[470px]')}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#0F0F0F" stroke="#fff" strokeWidth="1.6" />
            </svg>
            <span className={cn(mkCursorTag, 'bg-[#0f0f0f]')}>
              <AgentIcon name="codex" size={10} /> Codex
            </span>
          </div>
          <div
            className={cn(
              mkCursor,
              'left-[300px] top-[500px]',
              'group-[.pb1:not(.pb2)]:left-[900px] group-[.pb1:not(.pb2)]:top-[84px]',
              'group-[.pb2:not(.pb3)]:left-[1230px] group-[.pb2:not(.pb3)]:top-[180px] group-[.pb2:not(.pb3)]:[animation:sp-scan_5s_ease-in-out_1.1s]',
              'group-[.pb3:not(.pb4)]:left-[1000px] group-[.pb3:not(.pb4)]:top-[120px]',
              'group-[.pb4:not(.pb5)]:left-[1120px] group-[.pb4:not(.pb5)]:top-[330px]',
              'group-[.pb5]:left-[520px] group-[.pb5]:top-[520px]',
            )}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#D97757" stroke="#fff" strokeWidth="1.6" />
            </svg>
            <span className={cn(mkCursorTag, 'bg-[#d97757]')}>
              <AgentIcon name="claude" size={10} /> Claude
            </span>
          </div>
          <div className="absolute bottom-4 left-4 z-[5] flex flex-col gap-1.5">
            <div className={wnPill}>
              <span className={pulseDot} style={{ background: done ? '#1E7A4C' : '#D97757' }} />
              <b className="inline-flex items-center gap-1 text-ink">
                <AgentIcon name="claude" size={11} /> Claude
              </b>{' '}
              <span key={strip} className={spSay}>
                {strip}
              </span>
            </div>
            {beat >= 4 && (
              <div className={cn(wnPill, '[animation:sp-say-in_0.5s_ease_0.7s_both]')}>
                <span className={pulseDot} style={{ background: '#17150F' }} />
                <b className="inline-flex items-center gap-1 text-ink">
                  <AgentIcon name="codex" size={11} /> Codex
                </b>{' '}
                <span>Sketching the footer…</span>
              </div>
            )}
          </div>
          <div className="absolute bottom-4 left-1/2 z-[5] flex items-center gap-1 rounded-[12px] border border-line bg-surface px-1.5 py-[5px] shadow-pop [transform:translateX(-50%)]">
            <span className={tbBtn}>+ Frame</span>
            <i className={tbDiv} />
            <span className={tbBtn}>−</span>
            <span className="px-0.5 font-mono text-[12px] text-ink-soft">100%</span>
            <span className={tbBtn}>+</span>
            <i className={tbDiv} />
            <span className={tbBtn}>Fit</span>
          </div>
        </div>
        <div className="absolute bottom-3 right-3 top-3 z-[4] flex w-[280px] flex-col gap-3.5 rounded-[14px] border border-line bg-surface px-4 py-3.5 shadow-pop">
          <div className="flex gap-3.5 border-b border-line-soft pb-[9px] text-[13px] font-semibold text-ink-faint">
            <span className="-mb-2.5 border-b-2 border-brand pb-2 text-ink">Tasks</span>
            <span>Activity</span>
          </div>
          <div className="flex flex-col gap-[7px]">
            <div className="flex items-center gap-1.5 text-[13px] font-bold">
              <AgentIcon name="claude" size={12} /> Claude <i className={mockAgentI}>for Kevin</i>{' '}
              <em className="ml-auto rounded-full bg-[rgba(229,83,60,0.1)] px-2 py-0.5 text-[10.5px] not-italic text-accent-ink">
                {done ? 'idle' : 'working'}
              </em>
            </div>
            {done ? (
              <div className={cn(mockTask, 'text-ink-faint', spTask)}>
                ✓ Pricing grid <i className={mockTaskTime}>2m</i>
              </div>
            ) : (
              <div className={cn(mockTask, spTask)}>
                <span className={pulseDot} style={{ background: '#E5533C' }} />{' '}
                <span key={task} className={spSay}>
                  {task}
                </span>{' '}
                <i className={mockTaskTime}>now</i>
              </div>
            )}
            <div className={cn(mockTask, 'text-ink-faint')}>
              ✓ Hero section <i className={mockTaskTime}>4m</i>
            </div>
            {/* beat 4 — Kevin's note lands, Claude picks it up */}
            <div className="ml-1 rounded-[8px] border border-line-soft bg-paper px-2.5 py-2 text-[12px] text-ink-soft opacity-0 [transform:translateY(5px)] [transition:opacity_0.45s_ease,transform_0.45s_ease] group-[.pb4]:opacity-100 group-[.pb4]:[transform:none]">
              <b className="text-ink">Kevin:</b> try a darker footer
              <span className="mt-1 block text-[11.5px] text-[#1e7a4c] opacity-0 [transition:opacity_0.4s_ease] group-[.pb4]:opacity-100 group-[.pb4]:[transition-delay:1.6s]">
                ✓ picked up by Claude
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-[7px]">
            <div className="flex items-center gap-1.5 text-[13px] font-bold">
              <AgentIcon name="codex" size={12} /> Codex <i className={mockAgentI}>for Ana</i>{' '}
              {beat >= 4 && (
                <em className="ml-auto rounded-full bg-[rgba(229,83,60,0.1)] px-2 py-0.5 text-[10.5px] not-italic text-accent-ink">
                  working
                </em>
              )}
            </div>
            {beat >= 4 && (
              <div className={cn(mockTask, '[animation:sp-say-in_0.5s_ease_0.7s_both]')}>
                <span className={pulseDot} style={{ background: '#17150F' }} /> Sketching the footer{' '}
                <i className={mockTaskTime}>now</i>
              </div>
            )}
            <div className={cn(mockTask, 'text-ink-faint')}>
              ✓ Terrarium hero <i className={mockTaskTime}>12m</i>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
