import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import FaultyTerminal from './FaultyTerminal.jsx';
import ScrollVelocity from './ScrollVelocity.jsx';
import RotatingText from './RotatingText.jsx';
import ShinyText from './ShinyText.jsx';

const REPO = 'https://github.com/MShreyash09/TermiCursor';
const LATEST = `${REPO}/releases/latest`;
const PIP = `pip install git+${REPO}.git`;
// Module-level so FaultyTerminal's effect doesn't rebuild the WebGL context on every render.
const GRID_MUL = [2, 1];
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const trackDownload = () => {
  if (typeof window.va === 'function') window.va('event', 'Download_TermiCursor');
};

const GLYPHS = '!<>-_\\/[]{}=+*^?#01';

// Marquee rows under the hero; module-level so ScrollVelocity never remounts them.
const VELOCITY_ROWS = [
  <><b className="c-ask">Ask</b> <i>✦</i> <b className="c-plan">Plan</b> <i>✦</i> <b className="c-build">Build</b> <i>✦</i></>,
  <>Runs on Ollama ✦ Your code stays local ✦ Free &amp; MIT ✦</>,
];
const CTA_WORDS = ['task', 'bug', 'refactor', 'feature', 'test suite'];

// Thin green bar at the top that tracks page scroll.
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

// Hero screenshot starts tilted back and flattens as you scroll (Aceternity's "container scroll" idea).
function HeroShot() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 20%'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  return (
    <figure className="hero-shot" ref={ref}>
      <div className="glow" aria-hidden="true"></div>
      <motion.img src="asset/cli-welcome.png" width="2560" height="738" style={REDUCED_MOTION ? undefined : { rotateX, scale }}
        alt="The TermiCursor terminal app: block-letter logo, key hints and a tip on a black background" />
    </figure>
  );
}

// Heading that scrambles into place when scrolled into view (after React Bits' DecryptedText).
function Decrypt({ text }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (REDUCED_MOTION) return;
    let timer;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      let frame = 0;
      const total = 18;
      timer = setInterval(() => {
        frame++;
        const done = Math.floor((frame / total) * text.length);
        setShown(text.split('').map((c, i) =>
          i < done || c === ' ' ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(''));
        if (frame >= total) clearInterval(timer);
      }, 40);
    }, { threshold: 0.6 });
    io.observe(ref.current);
    return () => { io.disconnect(); clearInterval(timer); };
  }, [text]);
  // aria-label keeps screen readers on the real text while the glyphs churn.
  return <h2 ref={ref} aria-label={text}><span aria-hidden="true">{shown}</span></h2>;
}

function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <nav className={`nav${scrolled ? ' scrolled' : ''}`} aria-label="Main">
      <div className="container nav-inner">
        <a href="#" className="brand" aria-label="TermiCursor home">
          <span className="brand-termi">termi</span><span className="brand-cursor">cursor</span><span className="caret" aria-hidden="true"></span>
        </a>
        <div className={`nav-links${open ? ' open' : ''}`} id="navLinks" onClick={(e) => e.target.closest('a') && setOpen(false)}>
          <a href="#modes">Modes</a>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="docs.html">Docs</a>
          <a href="#privacy">Privacy</a>
          <a href="#faq">FAQ</a>
          <a href={REPO} className="nav-github" target="_blank" rel="noopener">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" />
            </svg>
            GitHub
          </a>
          <a href={LATEST} className="btn btn-primary btn-sm" onClick={trackDownload}>Download</a>
        </div>
        <button className="menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}
          aria-controls="navLinks" onClick={() => setOpen(!open)}>
          <span></span><span></span>
        </button>
      </div>
    </nav>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked: the command is still selectable */ }
  };
  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={copy} aria-label="Copy install command">
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// Frame that swaps to "Screenshot coming soon" when the image is missing.
function Shot({ src, width, height, alt, className = '' }) {
  const [missing, setMissing] = useState(false);
  return (
    <figure className={`shot ${className}${missing ? ' shot-missing' : ''}`}>
      <img src={src} width={width} height={height} loading="lazy" alt={alt} onError={() => setMissing(true)} />
      <figcaption>Screenshot coming soon</figcaption>
    </figure>
  );
}

function Spotlight({ eyebrow, eyebrowClass, title, children, shot }) {
  return (
    <div className="spotlight reveal">
      <div className="spotlight-copy">
        <div className="sc-head">
          <span className={`eyebrow ${eyebrowClass}`}>{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        <div className="sc-body">{children}</div>
      </div>
      {shot}
    </div>
  );
}

function Icon({ color, children }) {
  return <div className={`icon icon-${color}`} aria-hidden="true"><svg viewBox="0 0 24 24">{children}</svg></div>;
}

function Card({ icon, title, children, wide }) {
  return (
    <article className={`spot card${wide ? ' card-wide' : ''} reveal`}>
      {icon}
      <h3>{title}</h3>
      {children}
    </article>
  );
}

const STEPS = [
  ['Understand', 'Is this a question or a task? Questions get answered right away.'],
  ['Plan', 'Bigger tasks become a short list of steps. In Plan mode, you review it first.'],
  ['Act', 'One tool call at a time: read, write, search, run a command, open a page.'],
  ['Verify', 'It checks the result and leaves a trail: command logs, changed files, browser recordings.'],
];

const FAQ = [
  ['Is it free?', <>Yes. TermiCursor is open source under the MIT license. With Ollama there's nothing to pay for.</>],
  ['What do I need to run it?', <>Windows 10 or 11 and <a href="https://ollama.com/download" target="_blank" rel="noopener">Ollama</a>.
    On first run the app offers to download its default models (about 2.2 GB). 8 GB of RAM is a comfortable minimum.</>],
  ['Which models does it use?', <><code>qwen2.5-coder:3b</code> for the agent and <code>nomic-embed-text</code> for search by default.
    You can pick any Ollama model in Settings, or switch to Groq.</>],
  ['Does my code leave my computer?', <>Not when you use Ollama. The only network traffic is update checks, model downloads, and pages the
    agent opens. Choose Groq and your prompts and the code the agent reads go to Groq.</>],
  ['Could it break my project?', <>It asks before running commands, deleting files, or writing outside the project folder, so you
    review each risky step. Keep your project in git so every change is easy to undo.</>],
  ['Mac or Linux?', <>The desktop app is Windows-only for now. The terminal version is plain Python
    (<code>pip install</code> above), so it may work elsewhere, but Windows is what's tested.</>],
];

export default function App() {
  // Reveal on scroll
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    // Stagger siblings so grids cascade in instead of popping as one block.
    els.forEach((el) => {
      const i = [...el.parentElement.children].filter((c) => c.classList.contains('reveal')).indexOf(el);
      el.style.setProperty('--d', `${Math.min(i, 6) * 90}ms`);
    });
    if (!('IntersectionObserver' in window)) return els.forEach((el) => el.classList.add('in'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });
    els.forEach((el) => io.observe(el));

    // Mouse-follow glow on cards (after React Bits' SpotlightCard): one listener, CSS does the drawing.
    const onMove = (e) => {
      const card = e.target.closest?.('.spot');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => { io.disconnect(); document.removeEventListener('pointermove', onMove); };
  }, []);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <ScrollProgress />
      <Nav />

      <main id="main">
        {/* ═══════════ HERO ═══════════ */}
        <header className="hero">
          <div className="hero-bg" aria-hidden="true">
            <FaultyTerminal
              dpr={1}
              tint="#39ff14"
              gridMul={GRID_MUL}
              scale={1.5}
              digitSize={1.2}
              timeScale={0.5}
              scanlineIntensity={0.5}
              curvature={0.1}
              brightness={0.6}
              mouseStrength={0.3}
              pause={REDUCED_MOTION}
              pageLoadAnimation={!REDUCED_MOTION}
            />
          </div>
          <div className="container hero-inner">
            <div className="hero-copy">
              <a className="pill" href={LATEST}>
                <span className="pill-dot"></span>
                <ShinyText text="v0.1 · Free & open source (MIT)" color="#a3a3a3" shineColor="#39ff14"
                  speed={2.5} delay={1.5} disabled={REDUCED_MOTION} />
              </a>
              <h1>The coding agent that runs on <span className="hl">your machine</span><span className="caret caret-lg" aria-hidden="true"></span></h1>
              <p className="lede">
                TermiCursor plans the work, edits files, runs commands and checks the result, powered by
                local models through Ollama. It asks before anything risky, and your code stays on your PC.
              </p>
              <div className="cta-row">
                <a href={LATEST} className="btn btn-primary" onClick={trackDownload}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download for Windows
                </a>
                <a href={REPO} className="btn btn-ghost" target="_blank" rel="noopener">View source</a>
              </div>
              <div className="install">
                <span className="install-label">Prefer the terminal?</span>
                <div className="install-cmd">
                  <code>{PIP}</code>
                  <CopyButton text={PIP} />
                </div>
              </div>
              <p className="meta">Windows 10/11 &middot; Needs <a href="https://ollama.com/download" target="_blank"
                rel="noopener">Ollama</a> &middot; About 2.2 GB of models on first run</p>
            </div>

            <HeroShot />
          </div>
        </header>

        <div className="velocity" aria-hidden="true">
          <ScrollVelocity texts={VELOCITY_ROWS} velocity={REDUCED_MOTION ? 0 : 60} numCopies={4} />
        </div>

        {/* ═══════════ MODES ═══════════ */}
        <section id="modes" className="section">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Three modes</span>
              <Decrypt text="You decide how much it does." />
              <p>Press <kbd>tab</kbd> in the terminal, or use the switch in the app.</p>
            </div>

            <div className="modes">
              <article className="spot mode mode-ask reveal">
                <div className="mode-chip"><b>Ask</b> &middot; read-only</div>
                <h3>Ask about your code</h3>
                <p>Questions get direct answers. It can open files and search the index, but it can't edit
                  anything or run commands.</p>
              </article>
              <article className="spot mode mode-plan reveal">
                <div className="mode-chip"><b>Plan</b> &middot; you review first</div>
                <h3>See the plan before any code</h3>
                <p>It writes a step-by-step plan and stops. Edit the steps, ask for changes, or approve it. Only then
                  does it start coding.</p>
              </article>
              <article className="spot mode mode-build reveal">
                <div className="mode-chip"><b>Build</b> &middot; gets it done</div>
                <h3>Hand it the whole task</h3>
                <p>It plans when the task needs it, then edits files, runs your tests and checks the result, asking
                  before anything risky.</p>
              </article>
            </div>

            <Spotlight eyebrow="Plan mode" eyebrowClass="eyebrow-plan" title="Nothing gets written until you say so."
              shot={<Shot src="asset/cli-plan.png" width="2560" height="634" alt="A plan in TermiCursor's terminal app, shown for review before coding" />}>
              <p>A plan you can change is better than a diff you have to undo. Remove steps, add steps, or type
                "use pytest, not unittest" and it plans again.</p>
              <ul className="ticks">
                <li>Edit, add or remove steps</li>
                <li>Ask for changes as many times as you like</li>
                <li>Approve and it starts coding, or reject and nothing happens</li>
              </ul>
            </Spotlight>

            <Spotlight eyebrow="Ask mode" eyebrowClass="eyebrow-ask" title="Ask about your project."
              shot={<Shot src="asset/cli-ask.png" width="2560" height="580" alt="TermiCursor in Ask mode listing a folder with the list_dir tool, then answering" />}>
              <p>It can open files and search a local index of your project before it answers, and every file it
                opens shows up as it happens. Ask mode only has read-only tools, so a question can't turn into an
                edit.</p>
              <ul className="ticks">
                <li>Tool calls shown as they happen</li>
                <li>Read-only: it can't edit files or run commands</li>
                <li>No planning step, so answers come back fast</li>
              </ul>
            </Spotlight>
          </div>
        </section>

        {/* ═══════════ FEATURES ═══════════ */}
        <section id="features" className="section section-alt">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Features</span>
              <Decrypt text="An agent, not autocomplete." />
              <p>It works through a task one tool call at a time, and you can watch every step.</p>
            </div>

            <div className="bento">
              <Card wide title="Knows your codebase"
                icon={<Icon color="green"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>}>
                <p>When you open a folder, it indexes the project on your machine: language-aware chunks, local
                  embeddings, and a vector store on disk. The agent can search it by meaning to find the right files.</p>
                <div className="term-lines" aria-hidden="true">
                  <span><i className="c-orange">⚙</i> <b>search_codebase</b> <em>query=auth middleware</em></span>
                  <span><i className="c-orange">⚙</i> <b>read_file</b> <em>path=server/auth.py</em></span>
                  <span><i className="c-green">┃ done</i> <em>4.2s</em></span>
                </div>
              </Card>
              <Card title="Checks its own work"
                icon={<Icon color="orange"><path d="M4 17l6-6-6-6" /><path d="M12 19h8" /></Icon>}>
                <p>Runs your builds and tests, reads the output, and fixes what failed.</p>
              </Card>
              <Card title="Asks before risky steps"
                icon={<Icon color="red"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></Icon>}>
                <p>Every shell command asks first. So do deletes and writes outside the project.</p>
              </Card>
              <Card title="Tests web apps in a browser"
                icon={<Icon color="blue"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18" /><path d="M8 21h8" /></Icon>}>
                <p>Opens your app in Edge, reads the page and console errors, and records a video of the whole
                  session for you to watch.</p>
              </Card>
              <Card title="Remembers each project"
                icon={<Icon color="purple"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></Icon>}>
                <p>Reopen a folder and it knows what earlier sessions did there, so it picks up where you left off.</p>
              </Card>
              <Card title="Your models"
                icon={<Icon color="white"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></Icon>}>
                <p>Any Ollama model, switchable in Settings. Groq is there if you want cloud speed, and it's off
                  unless you turn it on.</p>
              </Card>
            </div>
          </div>
        </section>

        {/* ═══════════ HOW IT WORKS ═══════════ */}
        <section id="how" className="section">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">How it works</span>
              <Decrypt text="From a sentence to a finished change." />
            </div>
            <ol className="steps">
              {STEPS.map(([title, text], i) => (
                <li className="spot step reveal" key={title}>
                  <span className="step-n">0{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>

            <Spotlight eyebrow="Desktop app" eyebrowClass="eyebrow-build" title="Editor, terminal and agent in one window."
              shot={<Shot className="shot-app" src="asset/app.png" width="1918" height="1017" alt="The TermiCursor desktop app with file tree, editor, terminal and agent panel" />}>
              <p>Open a folder, and the file tree, editor, terminal and agent panel are all there. You see the
                live plan, approve actions as they come up, and every artifact the agent leaves behind.</p>
            </Spotlight>
          </div>
        </section>

        {/* ═══════════ PRIVACY ═══════════ */}
        <section id="privacy" className="section section-alt">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Privacy &amp; safety</span>
              <Decrypt text="Local by default. Clear about the rest." />
            </div>
            <div className="privacy">
              <div className="spot privacy-col reveal">
                <h3><span className="dot dot-green"></span>Stays on your PC</h3>
                <ul>
                  <li>Your code and its search index</li>
                  <li>Model inference, with Ollama</li>
                  <li>Sessions and project memory</li>
                  <li>No telemetry in the app</li>
                </ul>
              </div>
              <div className="spot privacy-col reveal">
                <h3><span className="dot dot-orange"></span>Uses the network</h3>
                <ul>
                  <li>Checking GitHub for app updates</li>
                  <li>Downloading models, when you click Install</li>
                  <li>Web pages the agent opens</li>
                  <li>Groq, only if you choose it (it sends your prompts and code)</li>
                </ul>
              </div>
            </div>
            <div className="safety-strip reveal">
              <div><b>Locked-down local API.</b> A secret made at each launch, so other programs and websites can't drive
                the agent.</div>
              <div><b>You approve commands.</b> Destructive ones always ask, even with auto-approve on.</div>
              <div><b>Read every line.</b> MIT-licensed. <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank"
                rel="noopener">Security policy</a></div>
            </div>
          </div>
        </section>

        {/* ═══════════ MODEL GUIDE ═══════════ */}
        <section id="model-guide" className="section">
          <div className="container container-narrow">
            <div className="section-head">
              <span className="eyebrow">Which model?</span>
              <Decrypt text="Know which model to pick for your machine?" />
              <p>Too big and it crawls, too small and it misses. Our docs match model size to your RAM and GPU.</p>
              <a className="btn btn-ghost" href="docs.html#pick-model">Read the model guide</a>
            </div>
          </div>
        </section>

        {/* ═══════════ FAQ ═══════════ */}
        <section id="faq" className="section">
          <div className="container container-narrow">
            <div className="section-head">
              <span className="eyebrow">FAQ</span>
              <Decrypt text="Questions" />
            </div>
            <div className="faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════ FINAL CTA ═══════════ */}
        <section className="section final">
          <div className="container final-inner reveal">
            <h2>Give it a{' '}
              <RotatingText texts={CTA_WORDS} auto={!REDUCED_MOTION} rotationInterval={2200}
                staggerFrom="last" staggerDuration={0.025} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '-120%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                mainClassName="cta-rotate" splitLevelClassName="cta-rotate-split" />
              <span className="caret caret-lg" aria-hidden="true"></span></h2>
            <p>Install Ollama, download TermiCursor, open a folder.</p>
            <div className="cta-row cta-center">
              <a href={LATEST} className="btn btn-primary" onClick={trackDownload}>Download for Windows</a>
              <a href="https://ollama.com/download" className="btn btn-ghost" target="_blank" rel="noopener">Get Ollama</a>
            </div>
          </div>
        </section>
      </main>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <a href="#" className="brand" aria-label="TermiCursor home">
              <span className="brand-termi">termi</span><span className="brand-cursor">cursor</span>
            </a>
            <p className="footer-tag">A local AI coding agent. Free and open source.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <a href={REPO} target="_blank" rel="noopener">GitHub</a>
            <a href="docs.html">Docs</a>
            <a href={`${REPO}/releases`} target="_blank" rel="noopener">Releases</a>
            <a href={`${REPO}/blob/main/SECURITY.md`} target="_blank" rel="noopener">Security</a>
            <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener">MIT License</a>
            <a href="https://mail.google.com/mail/?view=cm&fs=1&to=shreyashmandlapure09@gmail.com" target="_blank"
              rel="noopener noreferrer">Contact</a>
          </nav>
        </div>
        <div className="container footer-bottom">&copy; 2026 TermiCursor</div>
      </footer>
    </>
  );
}
