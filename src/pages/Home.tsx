/**
 * Home.tsx — the portfolio shell: terminal boot sequence, matrix backdrop, asymmetric
 * editorial sections, and the ICE BREAKER arcade cabinet with a DOM HUD.
 * The game itself lives in src/game/ and never re-renders through React.
 */
import { useEffect, useRef, useState } from "react";
import { startGame, stopGame, control, setInputActive } from "@/game/boot";
import { hudEvents, type HudSnapshot } from "@/game/hud";

const BOOT_LINES = [
  "> run portfolio.sys",
  "> load core.module .............. 100%",
  "> decrypt whoami.dat ............ OK",
  "> mount /vault/games/icebreaker .. OK",
  "> access granted — welcome, visitor",
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* Boot overlay — type-out sequence, auto-dismisses, skippable         */
/* ------------------------------------------------------------------ */

function Boot({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [line, setLine] = useState(0);
  const [char, setChar] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(onDone, 300);
      return () => clearTimeout(t);
    }
    if (line >= BOOT_LINES.length) {
      const t = setTimeout(() => setLeaving(true), 500);
      return () => clearTimeout(t);
    }
    const text = BOOT_LINES[line];
    if (char < text.length) {
      const t = setTimeout(() => setChar((c) => c + 1), 16);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setLine((l) => l + 1);
      setChar(0);
    }, 260);
    return () => clearTimeout(t);
  }, [line, char, reduced, onDone]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, 420);
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  const skip = () => onDone();

  return (
    <div
      className={`boot ${leaving ? "boot--leaving" : ""}`}
      onClick={skip}
      role="button"
      tabIndex={0}
      aria-label="Skip boot sequence"
      onKeyDown={skip}
    >
      <div className="boot__term" aria-hidden="true">
        {BOOT_LINES.slice(0, line + 1).map((l, i) => (
          <p key={i} className="boot__line">
            {i < line ? l : l.slice(0, char)}
            {i === line && <span className="boot__cursor">▊</span>}
          </p>
        ))}
        {line >= BOOT_LINES.length && <p className="boot__line boot__granted">ACCESS GRANTED</p>}
      </div>
      <p className="boot__skip">click or press any key to skip</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix rain backdrop (decorative canvas, aria-hidden)              */
/* ------------------------------------------------------------------ */

const RAIN_CHARS = "01<>/\\{}[]$#%&=+*アイウエオカキクケコサシスセソ";

function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cols = 0;
    let drops: number[] = [];
    const fontSize = 15;
    let raf = 0;
    let last = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.ceil(canvas.width / fontSize);
      drops = Array.from({ length: cols }, () => Math.random() * -40);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 70) return; // ~14fps is plenty for a backdrop
      last = now;
      ctx.fillStyle = "rgba(4, 8, 7, 0.16)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(0, 244, 142, 0.28)";
      ctx.font = `${fontSize}px "Space Mono", monospace`;
      for (let i = 0; i < cols; i++) {
        const ch = RAIN_CHARS[(Math.random() * RAIN_CHARS.length) | 0];
        ctx.fillText(ch, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.976) drops[i] = 0;
        drops[i]++;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  return <canvas ref={ref} className="matrix" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Game cabinet + HUD                                                  */
/* ------------------------------------------------------------------ */

function GameHud({ hud }: { hud: HudSnapshot }) {
  const inRun = hud.state === "playing" || hud.state === "paused";
  return (
    <div className="hud">
      {/* top strip */}
      <div className="hud__row hud__top">
        <div className="hud__cluster">
          <span className="hud__label">SCORE</span>
          <span className="hud__value">{String(hud.score).padStart(6, "0")}</span>
          <span className="hud__label hud__dim">BEST {String(hud.hi).padStart(6, "0")}</span>
        </div>
        <div className="hud__cluster hud__cluster--right">
          <span className="hud__label">WAVE {hud.wave}/{hud.maxWave}</span>
          <span className="hud__value hud__value--cyan">
            DATA {hud.data}/{hud.target}
          </span>
        </div>
      </div>

      {/* banner */}
      {hud.banner && <div className="hud__banner">{hud.banner}</div>}

      {/* bottom strip */}
      {inRun && (
        <div className="hud__row hud__bottom">
          <div className="hud__cluster">
            <span className="hud__label">INTEGRITY</span>
            <span className="hud__bar">
              <span
                className={`hud__bar-fill ${hud.integrity < 35 ? "hud__bar-fill--low" : ""}`}
                style={{ width: `${hud.integrity}%` }}
              />
            </span>
            <span className={`hud__value ${hud.integrity < 35 ? "hud__value--danger" : ""}`}>
              {hud.integrity}%
            </span>
            {hud.shield && <span className="hud__chip hud__chip--cyan">SHIELD</span>}
            {hud.boost > 0 && (
              <span className="hud__chip hud__chip--amber">OVERCLOCK {hud.boost.toFixed(0)}s</span>
            )}
            {hud.combo > 1 && <span className="hud__chip">COMBO x{hud.combo}</span>}
          </div>
          <span className="hud__hint">WASD MOVE · DRAG LOOK · ESC PAUSE</span>
        </div>
      )}

      {/* state overlays */}
      {hud.state === "title" && (
        <div className="hud__overlay">
          <p className="hud__eyebrow">// arcade cabinet 01</p>
          <h3 className="hud__title">ICE&nbsp;BREAKER</h3>
          <p className="hud__sub">infiltrate the vault · grab the data · outrun the ICE</p>
          <button className="term-btn term-btn--primary" onClick={() => control("start")}>
            [ START RUN ]
          </button>
          <ul className="hud__controls">
            <li>WASD / ARROWS — move</li>
            <li>MOUSE DRAG — camera</li>
            <li>DATA CORES — score + combo</li>
            <li>RED WALLS &amp; SENTINELS — damage</li>
            <li>SPACE — start · ESC — pause</li>
          </ul>
        </div>
      )}

      {hud.state === "paused" && (
        <div className="hud__overlay">
          <h3 className="hud__title hud__title--small">PAUSED</h3>
          <p className="hud__sub">signal frozen — the vault waits</p>
          <div className="hud__actions">
            <button className="term-btn term-btn--primary" onClick={() => control("resume")}>
              [ RESUME ]
            </button>
            <button className="term-btn" onClick={() => control("restart")}>
              [ RESTART ]
            </button>
            <button className="term-btn" onClick={() => control("title")}>
              [ ABORT ]
            </button>
          </div>
        </div>
      )}

      {hud.state === "gameover" && (
        <div className="hud__overlay">
          <h3 className={`hud__title ${hud.won ? "" : "hud__title--danger"}`}>
            {hud.won ? "TRACE COMPLETE" : "SIGNAL LOST"}
          </h3>
          <p className="hud__sub">
            {hud.won
              ? "you extracted the vault data — clean exit"
              : "the ICE traced your signal — burn the alias"}
          </p>
          <p className="hud__stats">
            SCORE {hud.score} · DATA {hud.data} · WAVE {hud.wave}
            {hud.score >= hud.hi && hud.score > 0 && <span className="hud__new"> NEW BEST</span>}
          </p>
          <div className="hud__actions">
            <button className="term-btn term-btn--primary" onClick={() => control("restart")}>
              [ RUN IT BACK ]
            </button>
            <button className="term-btn" onClick={() => control("title")}>
              [ TITLE ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Cabinet() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    startGame(canvas);
    const unsub = hudEvents.subscribe(setHud);
    const io = new IntersectionObserver(
      (entries) => setInputActive(entries[0]?.isIntersecting ?? true),
      { threshold: 0.25 },
    );
    if (wrapRef.current) io.observe(wrapRef.current);
    return () => {
      io.disconnect();
      unsub();
      stopGame();
    };
  }, []);

  return (
    <div className="cabinet" ref={wrapRef}>
      <div className="cabinet__bar">
        <span className="cabinet__name">icebreaker — data vault run</span>
        <button
          className="cabinet__mute"
          onClick={() => control("mute")}
          aria-label="Toggle sound"
        >
          {hud?.muted ? "[ SOUND: OFF ]" : "[ SOUND: ON ]"}
        </button>
      </div>
      <div className="cabinet__screen">
        <canvas id="game-canvas" ref={canvasRef} />
        {hud && <GameHud hud={hud} />}
      </div>
      <div className="cabinet__foot">
        <span>hw: webgl2 · engine: three.js · net: isolated</span>
        <span>hi-score persists on this device</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

const NAV = [
  ["WHOAMI", "#whoami"],
  ["ARSENAL", "#arsenal"],
  ["MUN", "#mun"],
  ["VAULT", "#vault"],
  ["CONTACT", "#contact"],
] as const;

const SKILLS = [
  {
    idx: "01",
    name: "PYTHON",
    desc: "Primary weapon for penetration testing and automation.",
    tags: ["scripting", "automation", "tooling"],
  },
  {
    idx: "02",
    name: "NETWORK SECURITY",
    desc: "Expertise in network analysis and security protocols.",
    tags: ["traffic analysis", "protocols", "defense"],
  },
  {
    idx: "03",
    name: "WEB SECURITY",
    desc: "Finding and fixing vulnerabilities in web applications.",
    tags: ["pentesting", "hardening", "review"],
  },
] as const;

const CHAIR_TOOLKIT = [
  ["RULES OF PROCEDURE", "keeping a hundred delegates in order"],
  ["MODERATED CAUCUSES", "steering debate without suffocating it"],
  ["RESOLUTION DRAFTING", "turning disagreement into operative clauses"],
  ["CRISIS DIRECTIVES", "ruling fast when the arc collapses"],
  ["PUBLIC SPEAKING", "gavel in hand, room at attention"],
  ["NEGOTIATION & BLOCS", "building majorities across blocs"],
] as const;

export default function Home() {
  const [booted, setBooted] = useState(false);

  return (
    <div className={`site ${booted ? "site--booted" : "site--locked"}`}>
      {!booted && <Boot onDone={() => setBooted(true)} />}
      <MatrixRain />

      {/* viewport frame with notched corners */}
      <div className="frame" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <header className="topbar">
        <a className="topbar__brand" href="#whoami">
          shubhra@gautam<span className="topbar__prompt">:~$</span>
          <span className="topbar__cursor">▊</span>
        </a>
        <nav className="topbar__nav" aria-label="Sections">
          {NAV.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        {/* ---------- hero + arcade cabinet ---------- */}
        <section className="hero" id="whoami">
          <div className="hero__copy">
            <p className="hero__cmd">$ whoami</p>
            <h1 className="hero__name">
              SHUBHRA
              <br />
              GAUTAM
            </h1>
            <p className="hero__roles">
              <span>cyber_security</span>
              <span>developer</span>
              <span>mun_chair</span>
            </p>
            <p className="hero__intro">
              Young cyber security enthusiast &amp; developer — breaking systems open to understand
              them, chairing committees to build consensus. This site is the terminal; everything
              here is live, including the arcade cabinet on the right.
            </p>
            <div className="hero__ctas">
              <a className="term-btn term-btn--primary" href="#vault">
                [ ENTER THE VAULT ]
              </a>
              <a className="term-btn" href="#arsenal">
                [ VIEW ARSENAL ]
              </a>
            </div>
          </div>

          <div className="hero__cab" id="vault">
            <Cabinet />
          </div>

          <a className="hero__scrollcue" href="#arsenal">
            ▼ scroll
          </a>
        </section>

        {/* ---------- asymmetric rail + content ---------- */}
        <div className="layout">
          <aside className="rail">
            <div className="rail__box">
              <p className="rail__head">// session</p>
              <p className="rail__line">user: visitor</p>
              <p className="rail__line">clearance: public</p>
              <p className="rail__line">uptime: <RailUptime /></p>
            </div>
            <nav className="rail__nav" aria-label="Section index">
              {NAV.map(([label, href], i) => (
                <a key={href} href={href}>
                  <span className="rail__nav-idx">{String(i + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              ))}
            </nav>
            <PacketLog />
          </aside>

          <div className="content">
            {/* ---------- arsenal ---------- */}
            <section className="section" id="arsenal">
              <h2 className="section__title">
                <span className="section__cmd">$ cat arsenal.log</span>
                TECH ARSENAL
              </h2>
              <p className="section__sub">weapons of choice for digital warfare</p>
              <div className="arsenal">
                {SKILLS.map((s) => (
                  <article className="arsenal__row" key={s.idx}>
                    <span className="arsenal__idx">{s.idx}</span>
                    <div className="arsenal__body">
                      <h3>{s.name}</h3>
                      <p>{s.desc}</p>
                      <div className="arsenal__tags">
                        {s.tags.map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="arsenal__status">[ OK ]</span>
                  </article>
                ))}
              </div>
            </section>

            {/* ---------- MUN ---------- */}
            <section className="section section--mun" id="mun">
              <h2 className="section__title">
                <span className="section__cmd">$ diplomacy --strict</span>
                MUN ENTHUSIAST <span className="section__amp">&amp;</span> CHAIR
              </h2>
              <div className="mun">
                <div className="mun__narrative">
                  <p>
                    The same mind that maps attack surfaces maps committee floors. In Model United
                    Nations, Shubhra moves between two modes — <em>delegate</em>, arguing blocs and
                    building majorities, and <em>chair</em>, standing at the podium keeping a room
                    of rivals inside the rules of procedure.
                  </p>
                  <p>
                    As chair: opening the session, granting the floor, cutting speakers off exactly
                    on time, ruling on motions, steering moderated caucuses, and running crisis
                    updates where a committee can collapse in a single directive. Order is the
                    exploit.
                  </p>
                  <p className="mun__sig">&gt; the gavel is just root access for a room_</p>
                </div>
                <div className="mun__toolkit">
                  {CHAIR_TOOLKIT.map(([name, desc], i) => (
                    <div className="mun__tool" key={name}>
                      <span className="mun__tool-idx">{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <h3>{name}</h3>
                        <p>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ---------- contact ---------- */}
            <section className="section" id="contact">
              <h2 className="section__title">
                <span className="section__cmd">$ ping shubhra</span>
                OPEN CHANNEL
              </h2>
              <div className="contact">
                <p className="contact__line">64 bytes from visitor: icmp_seq=1 ttl=64 time=0.4 ms</p>
                <p className="contact__line">channel open — say hello through any relay you have.</p>
                <p className="contact__foot">
                  © {new Date().getFullYear()} SHUBHRA GAUTAM — built as a secure terminal.
                  no trackers. no cookies. just phosphor.
                </p>
                <a className="term-btn" href="#whoami">
                  [ BACK TO TOP ]
                </a>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Live packet-log ticker in the rail. */
const PACKETS = [
  "SYN → vault:443 · ACK",
  "ICE heartbeat · ok",
  "sha256(whoami) verified",
  "core #7 harvested · +100",
  "firewall lane 2 cycling",
  "mun.committee · quorum met",
  "no intrusions detected",
  "phosphor levels nominal",
];

function PacketLog() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => v + 1), 2200);
    return () => clearInterval(t);
  }, []);
  const recent = Array.from({ length: 4 }, (_, k) => PACKETS[(n + k) % PACKETS.length]);
  return (
    <div className="rail__log">
      <p className="rail__head">// packet log</p>
      {recent.map((p, i) => (
        <p key={`${n}-${i}`} className={`rail__line ${i === 0 ? "rail__line--fresh" : ""}`}>
          {p}
        </p>
      ))}
    </div>
  );
}

/** Session uptime ticker in the rail (setInterval in component = isolated). */
function RailUptime() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <>{mm}:{ss}</>;
}
