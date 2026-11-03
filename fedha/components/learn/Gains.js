import { levelOf, rankOf, liveStreak, focusByDay, masteryFor, MEDALS, isMastered } from '../../lib/study';
import { todayISO } from '../../lib/utils';
import { Medal, StreakFlame, ART } from './Medal';

// Gains: level and XP, streak, focus over the last 14 days, mastery per course (evidence only) and medals.
export default function Gains({ study, courses }) {
  const { stats, log, cards } = study;
  const lv = levelOf(stats.xp);
  const days = focusByDay(log, 14);
  const max = Math.max(30, ...days.map((d) => d.min));
  const week = days.slice(-7).reduce((s, d) => s + d.min, 0), lastWeek = days.slice(0, 7).reduce((s, d) => s + d.min, 0);
  const earned = MEDALS.filter((m) => stats.medals[m.id]);
  const overall = masteryFor(study, null);
  // What the medals measure, for the progress rings on locked ones.
  const ctx = { mastered: cards.filter(isMastered).length, coursesDone: courses.filter((c) => c.status === 'completed').length, bestMastery: Math.max(0, ...courses.map((c) => masteryFor(study, c.id).score || 0)), level: lv.level };
  const streakNow = liveStreak(stats);

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 12, background: 'linear-gradient(135deg,rgba(233,216,166,.12),rgba(16,185,129,.06))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="lvl-badge"><span className="font-num">{lv.level}</span></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{rankOf(lv.level)} · Level {lv.level}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }} className="font-num">{stats.xp.toLocaleString()} XP · {lv.need - lv.into} XP to level {lv.level + 1}</div>
            <div style={{ height: 7, background: 'var(--card-2)', borderRadius: 7, overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: `${lv.pct}%`, background: 'linear-gradient(90deg,var(--green),var(--gold))' }} /></div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 14, textAlign: 'center' }}>
          {[[<span key="f" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2 }}><StreakFlame days={streakNow} lit={stats.last_day === todayISO()} size={18} />{streakNow}</span>, 'day streak'], [`${stats.best_streak}`, 'best streak'], [`${Math.round(stats.counts.focus_min / 60)}h`, 'focused'], [`${cards.filter(isMastered).length}`, 'cards mastered']].map(([v, l]) => (
            <div key={l}><div style={{ fontWeight: 800, fontSize: 17 }} className="font-num">{v}</div><div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{l}</div></div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <b style={{ fontSize: 13.5 }}>Focus, last 14 days</b>
          <span style={{ fontSize: 12, color: week >= lastWeek ? 'var(--green)' : 'var(--text-3)' }} className="font-num">{week} min this week{lastWeek ? ` · ${week >= lastWeek ? '▲' : '▼'} ${Math.abs(week - lastWeek)} vs last` : ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90, marginTop: 10 }}>
          {days.map((d) => (
            <div key={d.day} title={`${d.day}: ${d.min} min`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ width: '100%', height: `${Math.max(3, (d.min / max) * 72)}px`, borderRadius: 4, background: d.min ? 'var(--green)' : 'var(--border)', opacity: d.min ? 1 : 0.6 }} />
              <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>{'SMTWTFS'[new Date(d.day + 'T12:00:00').getDay()]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <b style={{ fontSize: 13.5 }}>Mastery</b>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 10px', lineHeight: 1.45 }}>Earned only from flashcard recall and quiz scores. Time spent doesn't count here: you have to show you know it.</div>
        {[{ id: null, title: 'Overall' }, ...courses].map((c) => {
          const m = c.id ? masteryFor(study, c.id) : overall;
          if (c.id && m.score == null && !m.cards) return null;
          return (
            <div key={c.id || 'all'} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ fontWeight: c.id ? 600 : 800 }}>{c.title}</span>
                <span style={{ color: m.color, fontWeight: 700 }}>{m.label}{m.score != null ? ` · ${m.score}` : ''}</span>
              </div>
              <div style={{ height: 6, background: 'var(--card-2)', borderRadius: 6, overflow: 'hidden', marginTop: 4 }}><div style={{ height: '100%', width: `${m.score || 0}%`, background: m.color }} /></div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{m.cards} cards ({m.mastered} mastered) · {m.quizzes} quizzes{m.quizAvg != null ? ` averaging ${m.quizAvg}%` : ''}</div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: 14 }}>
        <b style={{ fontSize: 13.5 }}>Medals · {earned.length}/{MEDALS.length}</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8, marginTop: 10 }}>
          {MEDALS.map((m) => {
            const got = stats.medals[m.id];
            const [have, need] = ART[m.id]?.of(stats, ctx) || [0, 1];
            return (
              <div key={m.id} className={`medal ${got ? 'medal-got' : ''}`} title={m.desc}>
                <Medal id={m.id} earned={!!got} size={58} progress={got ? 1 : (Number(have) || 0) / need} />
                <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 2, color: got ? 'var(--text)' : 'var(--text-3)' }}>{m.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.3 }}>{got ? `Earned ${new Date(got + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : `${m.desc} · ${Math.min(Number(have) || 0, need)}/${need}`}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
