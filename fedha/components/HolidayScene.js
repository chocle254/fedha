import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Full drawn holiday scenes behind the app (SVG, no emoji), only built on that holiday:
//  • Halloween, gothic and dark: night sky, a moon with clouds sliding over it, a cemetery (tombstones, crosses,
//    an iron fence, a twisted dead tree), a skeleton hand clawing out of a grave, a skull peeking from behind a
//    stone, ghoul eyes blinking in the tree, sheet ghosts drifting, bats crossing, mist rolling on the ground and
//    lightning that flashes the whole screen.
//  • Christmas night: stars, moon, a string of twinkling lights, snowy hills, a lit tree with a glowing star and
//    gifts underneath, a snowman, little houses with warm windows, and Santa's sleigh flying across the sky.
// Animations are transform/opacity on small parts (styles/globals.css .hs-*). Snow comes from TierMotion.
function Halloween() {
  return (
    <div className="hs hs-halloween" aria-hidden="true">
      <div className="hs-sky" />
      {/* moon and clouds */}
      <svg className="hs-moon" viewBox="0 0 120 120">
        <defs><radialGradient id="hsMoonGlow"><stop offset="0" stopColor="#E8E6D9" stopOpacity=".35" /><stop offset="1" stopColor="#E8E6D9" stopOpacity="0" /></radialGradient></defs>
        <circle cx="60" cy="60" r="58" fill="url(#hsMoonGlow)" />
        <circle cx="60" cy="60" r="30" fill="#DCD9CB" />
        <circle cx="50" cy="52" r="5" fill="#C6C2B1" /><circle cx="68" cy="66" r="7" fill="#C9C5B4" /><circle cx="66" cy="47" r="3" fill="#C6C2B1" />
      </svg>
      <div className="hs-cloud hs-cloud-a" /><div className="hs-cloud hs-cloud-b" />
      {/* bats */}
      {[0, 1, 2].map((i) => (
        <svg key={i} className={`hs-bat hs-bat-${i}`} viewBox="0 0 60 30"><g className="hs-wings"><path d="M30 14 C26 6 18 4 8 8 C12 10 12 14 10 18 C15 15 20 16 24 20 C26 17 28 16 30 18 C32 16 34 17 36 20 C40 16 45 15 50 18 C48 14 48 10 52 8 C42 4 34 6 30 14Z" fill="#05050A" /></g><circle cx="28.5" cy="13" r=".8" fill="#B91C1C" /><circle cx="31.5" cy="13" r=".8" fill="#B91C1C" /></svg>
      ))}
      {/* ghosts */}
      {[0, 1].map((i) => (
        <svg key={i} className={`hs-ghost hs-ghost-${i}`} viewBox="0 0 80 110">
          <defs><linearGradient id={`hsG${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E5E7EB" stopOpacity=".42" /><stop offset="1" stopColor="#E5E7EB" stopOpacity="0" /></linearGradient></defs>
          <path d="M40 4 C18 4 8 22 8 44 L8 96 C14 90 18 104 24 96 C30 88 34 106 40 96 C46 86 50 106 56 96 C62 88 66 104 72 96 L72 44 C72 22 62 4 40 4Z" fill={`url(#hsG${i})`} />
          <ellipse cx="30" cy="40" rx="6" ry="9" fill="#020205" opacity=".85" /><ellipse cx="50" cy="40" rx="6" ry="9" fill="#020205" opacity=".85" />
          <ellipse cx="40" cy="62" rx="7" ry="10" fill="#020205" opacity=".7" />
        </svg>
      ))}
      {/* lightning */}
      <svg className="hs-bolt" viewBox="0 0 100 300" preserveAspectRatio="none"><polyline points="62,0 48,80 60,84 40,170 54,172 30,300" fill="none" stroke="#EDE9FE" strokeWidth="3" strokeLinejoin="round" /><polyline points="48,80 30,120 36,124 24,160" fill="none" stroke="#DDD6FE" strokeWidth="1.5" /></svg>
      {/* the cemetery */}
      <svg className="hs-ground" viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice">
        <path d="M0 150 C60 120 120 140 180 128 C250 114 320 136 400 120 L400 260 L0 260Z" fill="#0B0A12" />
        {/* dead tree */}
        <g fill="#040407">
          <path d="M52 230 C56 190 50 160 58 120 C62 100 56 86 64 70 L70 72 C64 90 72 104 68 124 C64 160 74 196 72 230Z" />
          <path d="M60 120 C44 108 34 110 20 96 L22 92 C36 102 46 100 62 112Z" /><path d="M64 92 C78 80 92 84 102 66 L106 70 C96 90 82 88 68 100Z" />
          <path d="M66 72 C60 56 64 44 56 30 L60 28 C70 42 66 54 72 70Z" /><path d="M20 96 C14 88 8 90 2 82 L4 78 C10 86 16 84 24 92Z" />
          <path d="M100 68 C108 60 114 62 120 52 L123 55 C116 66 110 64 104 72Z" />
        </g>
        <circle className="hs-eye" cx="61" cy="104" r="1.6" fill="#F59E0B" /><circle className="hs-eye" cx="66" cy="104" r="1.6" fill="#F59E0B" />
        {/* fence */}
        <g stroke="#0E0D16" strokeWidth="2.2" fill="#0E0D16">
          <line x1="250" y1="186" x2="400" y2="176" strokeWidth="2" /><line x1="250" y1="204" x2="400" y2="196" strokeWidth="2" />
          {Array.from({ length: 12 }, (_, i) => { const x = 254 + i * 13; return <g key={i}><line x1={x} y1={214} x2={x} y2={170 - i * 0.6} /><path d={`M${x - 3} ${172 - i * 0.6} L${x} ${164 - i * 0.6} L${x + 3} ${172 - i * 0.6}Z`} /></g>; })}
        </g>
        {/* skeleton hand rising from a grave (drawn before the soil, so it comes out of the ground) */}
        <g className="hs-hand" fill="#D6D3C4">
          <rect x="186" y="200" width="8" height="30" rx="3" />
          <rect x="180" y="184" width="3.2" height="18" rx="1.5" transform="rotate(-14 182 200)" /><rect x="185" y="179" width="3.2" height="22" rx="1.5" transform="rotate(-4 186 200)" />
          <rect x="190" y="178" width="3.2" height="23" rx="1.5" transform="rotate(5 191 200)" /><rect x="195" y="182" width="3.2" height="19" rx="1.5" transform="rotate(14 196 200)" />
          <rect x="176" y="198" width="3" height="12" rx="1.5" transform="rotate(-50 178 204)" />
        </g>
        {/* tombstones */}
        <g fill="#1A1922" stroke="#2C2A38" strokeWidth="1">
          <path d="M120 222 L120 176 C120 158 150 158 150 176 L150 222Z" /><path d="M214 224 L214 190 C214 176 238 176 238 190 L238 224Z" transform="rotate(-6 226 224)" />
          <path d="M300 226 L300 196 L292 196 L292 188 L300 188 L300 178 L308 178 L308 188 L316 188 L316 196 L308 196 L308 226Z" />
          <path d="M346 228 L346 200 C346 188 366 188 366 200 L366 228Z" transform="rotate(5 356 228)" />
          <rect x="88" y="200" width="22" height="26" rx="2" transform="rotate(-9 99 226)" />
        </g>
        <text x="135" y="192" textAnchor="middle" fontSize="8" fill="#0B0A10" fontFamily="serif" fontWeight="700">R.I.P</text>
        {/* skull peeking from behind the middle stone */}
        <g className="hs-skull">
          <ellipse cx="248" cy="196" rx="9" ry="8" fill="#D6D3C4" /><rect x="243" y="200" width="10" height="6" rx="2" fill="#D6D3C4" />
          <ellipse cx="244.5" cy="195" rx="2.4" ry="2.8" fill="#050507" /><ellipse cx="251.5" cy="195" rx="2.4" ry="2.8" fill="#050507" />
        </g>
        <path d="M0 214 C50 206 90 218 140 212 C200 204 250 220 300 212 C340 206 370 214 400 208 L400 260 L0 260Z" fill="#050508" />
      </svg>
      {/* mist rolling along the ground */}
      <div className="hs-mist hs-mist-a" /><div className="hs-mist hs-mist-b" /><div className="hs-mist hs-mist-c" />
    </div>
  );
}

function Christmas() {
  const bulbs = ['#EF4444', '#22C55E', '#FBBF24', '#60A5FA', '#F472B6'];
  return (
    <div className="hs hs-christmas" aria-hidden="true">
      <div className="hs-sky" />
      {Array.from({ length: 22 }, (_, i) => <i key={i} className="hs-star" style={{ left: `${(i * 47) % 100}%`, top: `${(i * 23) % 42}%`, animationDelay: `${-(i % 7) * 0.6}s` }} />)}
      <svg className="hs-moon hs-moon-x" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="#FEF9C3" opacity=".08" /><circle cx="60" cy="60" r="24" fill="#FEF3C7" /><circle cx="70" cy="54" r="22" fill="#0B1530" opacity=".9" /></svg>
      {/* string of lights across the top */}
      <svg className="hs-lights" viewBox="0 0 400 50" preserveAspectRatio="xMidYMin slice">
        <path d="M-5 6 Q50 34 100 10 Q150 36 200 10 Q250 36 300 10 Q350 34 405 6" fill="none" stroke="#1F2937" strokeWidth="1.6" />
        {Array.from({ length: 16 }, (_, i) => {
          const t = (i + 0.5) / 16, x = t * 400, seg = (t * 4) % 1, y = 10 + Math.sin(seg * Math.PI) * 20;
          return <g key={i}><rect x={x - 2} y={y - 1} width="4" height="4" fill="#374151" /><ellipse className="hs-bulb" cx={x} cy={y + 7} rx="3.4" ry="5" fill={bulbs[i % 5]} style={{ animationDelay: `${-(i % 5) * 0.35}s`, '--c': bulbs[i % 5] }} /></g>;
        })}
      </svg>
      {/* Santa's sleigh */}
      <svg className="hs-sleigh" viewBox="0 0 220 60">
        <g className="hs-sleigh-bob">
          <path d="M150 34 L190 34 C200 34 204 30 206 24 L210 26 C208 36 200 42 188 42 L150 42 C146 42 144 38 150 34Z" fill="#B45309" />
          <rect x="156" y="20" width="34" height="16" rx="4" fill="#B91C1C" /><rect x="156" y="20" width="34" height="3" fill="#FFF" />
          <circle cx="170" cy="14" r="6" fill="#FCD9B6" /><path d="M163 13 C164 4 176 4 177 13Z" fill="#B91C1C" /><circle cx="178" cy="6" r="2" fill="#FFF" />
          <path d="M164 16 C166 24 174 24 176 16Z" fill="#FFF" />
          <rect x="182" y="16" width="10" height="8" rx="2" fill="#15803D" /><rect x="186" y="14" width="2" height="12" fill="#FBBF24" />
          <line x1="150" y1="30" x2="118" y2="30" stroke="#78350F" strokeWidth="1" />
          {[0, 1, 2].map((k) => { const x = 110 - k * 40; return (
            <g key={k} fill="#7C4A21">
              <ellipse cx={x} cy="30" rx="14" ry="6" /><rect x={x - 10} y="34" width="2" height="10" /><rect x={x + 7} y="34" width="2" height="10" />
              <circle cx={x - 15} cy="22" r="4.5" /><path d={`M${x - 16} 18 l-4 -8 M${x - 16} 18 l2 -9 M${x - 19} 12 l-4 -1`} stroke="#5B3412" strokeWidth="1.2" fill="none" />
              {k === 2 && <circle className="hs-nose" cx={x - 19.5} cy="23" r="1.8" fill="#EF4444" />}
            </g>); })}
        </g>
      </svg>
      {/* hills, houses, tree, gifts, snowman */}
      <svg className="hs-ground" viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="hsSnow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F8FAFC" /><stop offset="1" stopColor="#CBD5E1" /></linearGradient>
          <radialGradient id="hsStar"><stop offset="0" stopColor="#FEF08A" /><stop offset="1" stopColor="#FEF08A" stopOpacity="0" /></radialGradient>
        </defs>
        <path d="M0 160 C70 130 140 150 210 136 C280 122 340 146 400 132 L400 260 L0 260Z" fill="#94A3B8" opacity=".55" />
        {/* houses with warm windows */}
        <g>
          <path d="M150 178 L170 160 L190 178 L190 206 L150 206Z" fill="#1E293B" /><path d="M146 180 L170 156 L194 180" fill="none" stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" />
          <rect x="158" y="184" width="9" height="9" fill="#FBBF24" /><rect x="174" y="184" width="9" height="9" fill="#FCD34D" />
          <path d="M196 186 L212 172 L228 186 L228 208 L196 208Z" fill="#273449" /><path d="M193 188 L212 169 L231 188" fill="none" stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" />
          <rect x="206" y="192" width="10" height="8" fill="#FBBF24" />
        </g>
        {/* snowman */}
        <g>
          <circle cx="70" cy="214" r="20" fill="url(#hsSnow)" /><circle cx="70" cy="184" r="14" fill="url(#hsSnow)" /><circle cx="70" cy="162" r="10" fill="url(#hsSnow)" />
          <rect x="61" y="146" width="18" height="4" fill="#111827" /><rect x="64" y="134" width="12" height="13" fill="#111827" /><rect x="64" y="143" width="12" height="2.5" fill="#B91C1C" />
          <circle cx="66.5" cy="160" r="1.4" fill="#111827" /><circle cx="73.5" cy="160" r="1.4" fill="#111827" /><path d="M70 163 L80 165 L70 166Z" fill="#F97316" />
          <path d="M60 172 C66 176 74 176 80 172 L80 176 C74 180 66 180 60 176Z" fill="#DC2626" /><rect x="74" y="174" width="5" height="12" fill="#DC2626" transform="rotate(10 76 174)" />
          <circle cx="70" cy="182" r="1.6" fill="#111827" /><circle cx="70" cy="190" r="1.6" fill="#111827" />
          <path d="M56 184 L38 172 M44 176 L40 168 M84 184 L102 174 M96 178 L100 170" stroke="#5B3412" strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* tree */}
        <g>
          <circle cx="320" cy="92" r="16" fill="url(#hsStar)" />
          <path d="M320 84 L323 92 L331 92 L325 97 L327 105 L320 100 L313 105 L315 97 L309 92 L317 92Z" fill="#FDE047" />
          <path d="M320 100 L292 150 L348 150Z" fill="#14532D" /><path d="M320 120 L282 180 L358 180Z" fill="#166534" /><path d="M320 146 L272 212 L368 212Z" fill="#15803D" />
          <path d="M296 148 Q320 156 344 148 M286 178 Q320 188 354 178 M276 210 Q320 220 364 210" stroke="#F8FAFC" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".9" />
          <rect x="314" y="212" width="12" height="14" fill="#5B3412" />
          {[[306, 136, 0], [334, 132, 1], [298, 166, 2], [340, 164, 3], [320, 156, 4], [290, 198, 0], [352, 196, 1], [318, 190, 2], [334, 202, 3]].map(([x, y, c], k) => <circle key={k} cx={x} cy={y} r="3" fill={bulbs[c]} />)}
        </g>
        {/* gifts */}
        <g>
          <rect x="270" y="212" width="26" height="20" fill="#DC2626" /><rect x="281" y="212" width="4" height="20" fill="#FDE047" /><rect x="270" y="219" width="26" height="4" fill="#FDE047" />
          <path d="M283 212 C276 204 272 210 283 212 C294 204 290 210 283 212Z" fill="#FDE047" />
          <rect x="344" y="216" width="22" height="16" fill="#1D4ED8" /><rect x="353" y="216" width="4" height="16" fill="#F8FAFC" />
          <rect x="300" y="222" width="18" height="12" fill="#15803D" /><rect x="307" y="222" width="4" height="12" fill="#FCA5A5" />
        </g>
        <path d="M0 220 C60 212 110 226 170 218 C240 208 300 226 360 216 C380 213 392 216 400 214 L400 260 L0 260Z" fill="url(#hsSnow)" />
      </svg>
    </div>
  );
}

// Vice Nights (original art, a retro neon sunset while we wait for GTA VI): a striped synthwave sun sinking into
// the sea, a neon skyline with twinkling windows and a blinking tower, a flickering LUXE sign, palms swaying,
// sun reflections shimmering on the water, a helicopter sweeping its searchlight and a car with pink underglow
// cruising the beach road.
function Vice() {
  const win = [];
  const towers = [[8, 120, 22], [34, 96, 18], [56, 132, 26], [86, 104, 20], [110, 84, 16], [130, 116, 24], [158, 140, 20], [182, 100, 14], [218, 112, 22], [244, 92, 18], [266, 128, 26], [296, 86, 16], [316, 108, 22], [342, 124, 20], [366, 98, 18], [386, 114, 16]];
  towers.forEach(([x, top, w], i) => { for (let y = top + 6; y < 166; y += 7) for (let xx = x + 3; xx < x + w - 2; xx += 5) { const r = Math.sin(i * 31 + y * 7 + xx * 13); if (r > 0.35) win.push([xx, y, r > 0.75 ? '#22D3EE' : r > 0.55 ? '#FF2E88' : '#FDE68A', i]); } });
  return (
    <div className="hs hs-vice" aria-hidden="true">
      <div className="hs-sky" />
      {Array.from({ length: 14 }, (_, i) => <i key={i} className="hs-star" style={{ left: `${(i * 53) % 100}%`, top: `${(i * 17) % 26}%`, animationDelay: `${-(i % 6) * 0.7}s` }} />)}
      {/* helicopter and its searchlight */}
      <div className="hs-heli">
        <div className="hs-beam" />
        <svg viewBox="0 0 70 30" width="70" height="30"><rect x="18" y="10" width="26" height="11" rx="5.5" fill="#0B0218" /><rect x="40" y="13" width="26" height="3" fill="#0B0218" /><rect x="63" y="9" width="3" height="9" fill="#0B0218" /><line className="hs-rotor" x1="6" y1="7" x2="56" y2="7" stroke="#0B0218" strokeWidth="2" /><rect x="29" y="7" width="3" height="4" fill="#0B0218" /><circle className="hs-nose" cx="20" cy="18" r="1.6" fill="#EF4444" /><circle cx="64" cy="10" r="1.2" fill="#22D3EE" /></svg>
      </div>
      <svg className="hs-ground hs-vice-ground" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="hvSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FDE047" /><stop offset=".55" stopColor="#FF7A45" /><stop offset="1" stopColor="#FF2E88" /></linearGradient>
          <linearGradient id="hvSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B0A5C" /><stop offset="1" stopColor="#0A0216" /></linearGradient>
          <mask id="hvStripes"><rect x="0" y="0" width="400" height="300" fill="#fff" />{[130, 140, 149, 157, 164].map((y, i) => <rect key={y} x="0" y={y} width="400" height={1.5 + i * 0.9} fill="#000" />)}</mask>
          <filter id="hvGlow"><feGaussianBlur stdDeviation="1.6" /></filter>
        </defs>
        <circle cx="200" cy="170" r="74" fill="url(#hvSun)" mask="url(#hvStripes)" />
        {/* skyline */}
        <g fill="#14022B">{towers.map(([x, top, w], i) => <rect key={i} x={x} y={top} width={w} height={170 - top} />)}<rect x="113" y="70" width="2" height="16" /></g>
        <circle cx="114" cy="69" r="1.8" fill="#EF4444" />
        {win.map(([x, y, c], k) => <rect key={k} x={x} y={y} width="2.4" height="3" fill={c} opacity=".85" />)}
        {/* neon sign */}
        <g><text x="282" y="122" fontSize="11" fontWeight="800" fill="#FF2E88" fontFamily="sans-serif" letterSpacing="2" filter="url(#hvGlow)">LUXE</text><text x="282" y="122" fontSize="11" fontWeight="800" fill="#FFE4F1" fontFamily="sans-serif" letterSpacing="2">LUXE</text></g>
        {/* sea and the sun's reflection */}
        <rect x="0" y="170" width="400" height="130" fill="url(#hvSea)" />
        {[176, 184, 193, 203, 214, 226].map((y, i) => <rect key={y} x={200 - (60 - i * 7)} y={y} width={(60 - i * 7) * 2} height={1.6} rx=".8" fill="#FF7A45" opacity={0.8 - i * 0.1} />)}
        <line x1="0" y1="170" x2="400" y2="170" stroke="#FF9EC7" strokeWidth=".8" opacity=".7" />
        {/* beach road and the car */}
        <rect x="0" y="262" width="400" height="38" fill="#07010F" /><line x1="0" y1="281" x2="400" y2="281" stroke="#FDE68A" strokeWidth="1" strokeDasharray="10 12" opacity=".5" />
      </svg>
      <svg className="hs-car-svg" viewBox="0 262 104 20">
        <g>
          <ellipse cx="30" cy="278" rx="30" ry="4" fill="#FF2E88" opacity=".55" filter="url(#hvGlow)" />
          <path d="M2 274 L10 266 L24 263 L36 263 L48 268 L58 270 L60 275 L2 276Z" fill="#160428" stroke="#22D3EE" strokeWidth=".8" />
          <path d="M14 266 L24 264 L34 264 L42 268 L16 268Z" fill="#22D3EE" opacity=".35" />
          <circle cx="14" cy="276" r="3.4" fill="#05010A" /><circle cx="48" cy="276" r="3.4" fill="#05010A" />
          <rect x="58" y="270" width="3" height="2" fill="#FDE68A" /><rect x="1" y="270" width="3" height="2" fill="#EF4444" />
          <path d="M61 271 L100 266 L100 278Z" fill="#FDE68A" opacity=".18" />
        </g>
      </svg>
      {[0, 1].map((k) => (
        <svg key={k} className={`hs-palm hs-palm-${k}`} viewBox="0 100 100 200" style={{ animationDelay: `${-k * 1.7}s` }}>
          {(() => { const x = k ? 70 : 30, dir = k ? -1 : 1; return (<>
            <path d={`M${x - 4} 300 C${x - 2 + dir * 4} 240 ${x + dir * 12} 170 ${x + dir * 26} 112 L${x + dir * 30} 114 C${x + dir * 18} 172 ${x + 6 + dir * 4} 240 ${x + 5} 300Z`} fill="#0A0114" />
            {[-60, -25, 10, 45, 80, 120].map((a, i) => { const cx = x + dir * 28, cy = 112, rad = ((a - 90) * Math.PI) / 180, ex = cx + Math.cos(rad) * 52 * dir, ey = cy + Math.sin(rad) * 30 + 22; return <path key={i} d={`M${cx} ${cy} Q${(cx + ex) / 2} ${Math.min(cy, ey) - 18} ${ex} ${ey} Q${(cx + ex) / 2} ${Math.min(cy, ey) - 8} ${cx} ${cy + 3}Z`} fill="#0A0114" />; })}
          </>); })()}
        </svg>
      ))}
    </div>
  );
}

export default function HolidayScene({ kind }) {
  const [host, setHost] = useState(null);
  useEffect(() => { setHost(document.body); }, []);
  if (!host || !['halloween', 'christmas', 'vice'].includes(kind)) return null;
  return createPortal(kind === 'halloween' ? <><Halloween /><div className="hs-flash" aria-hidden="true" /></> : kind === 'vice' ? <Vice /> : <Christmas />, host);
}
