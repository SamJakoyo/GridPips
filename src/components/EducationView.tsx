import React, { useState } from 'react';
import { ArrowUpRight, PlayCircle, BookOpen } from 'lucide-react';
import type { PublicConfig } from '../types';

interface EducationViewProps {
  config: PublicConfig;
}

interface LessonModule {
  id: string;
  track: 'ICT Core' | 'SMC Strategy' | 'Risk & Psychology';
  title: string;
  duration: string;
  summary: string;
  keyPoints: string[];
  youtubeSearchQuery: string;
}

const LESSONS: LessonModule[] = [
  {
    id: 'ict-1',
    track: 'ICT Core',
    title: 'ICT 2022 Mentorship: Liquidity Sweeps & Market Structure Shift (MSS)',
    duration: 'Core Framework',
    summary:
      'Learn how institutional algorithms engineer stop runs above Buy-Side Liquidity (BSL) or below Sell-Side Liquidity (SSL) before displacing aggressively to shift market structure.',
    keyPoints: [
      'Identify obvious equal highs (EQH) and equal lows (EQL) where retail stop losses rest.',
      'Wait for price to sweep liquidity during London (02:00-05:00 NY) or NY AM (07:00-10:00 NY) Killzones.',
      'Confirm an energetic displacement candle breaking the most recent opposing swing point (MSS).',
      'Avoid chasing the breakout; wait for price to retrace into the resulting Fair Value Gap.',
    ],
    youtubeSearchQuery: 'ICT 2022 Mentorship Episode 1',
  },
  {
    id: 'ict-2',
    track: 'ICT Core',
    title: 'Fair Value Gaps (BISI / SIBI) & Consequent Encroachment (50% CE)',
    duration: 'Entry Precision',
    summary:
      'Master the 3-candle institutional imbalance signature (Buy-Side Imbalance Sell-Side Inefficiency and Sell-Side Imbalance Buy-Side Inefficiency) for sniper limit entries.',
    keyPoints: [
      'Bullish FVG (BISI) forms when candle 3 low remains strictly above candle 1 high.',
      'Bearish FVG (SIBI) forms when candle 3 high remains strictly below candle 1 low.',
      'Mark the 50% midpoint (Consequent Encroachment) for refined stop placement.',
      'Highest probability setups align an FVG inside Discount (<50% range) for longs or Premium (>50%) for shorts.',
    ],
    youtubeSearchQuery: 'ICT Fair Value Gap Consequent Encroachment',
  },
  {
    id: 'ict-3',
    track: 'ICT Core',
    title: 'ICT Silver Bullet & Power of 3 (Accumulation, Manipulation, Distribution)',
    duration: 'Session Timing',
    summary:
      'Trade the high-probability 60-minute ICT Silver Bullet time windows (10:00-11:00 NY AM and 14:00-15:00 NY PM) aligned with daily Power of 3 expansion.',
    keyPoints: [
      'Accumulation: Asian session consolidates orders around the midnight opening price.',
      'Manipulation (Judas Swing): London or NY open engineers a false move opposite the true daily bias.',
      'Distribution: Price expands toward the opposing daily liquidity target (PDH / PDL).',
      'Execute inside the Silver Bullet FVG targeting a minimum 1:2 to 1:3 Risk-to-Reward.',
    ],
    youtubeSearchQuery: 'ICT Silver Bullet Strategy',
  },
  {
    id: 'smc-1',
    track: 'SMC Strategy',
    title: 'SMC Market Structure: Break of Structure (BOS) vs Change of Character (CHoCH)',
    duration: 'SMC Foundations',
    summary:
      'Distinguish true trend continuation (BOS) from early institutional reversal signals (CHoCH) across H4, H1, and M15 timeframes.',
    keyPoints: [
      'BOS confirms trend continuation when a candle body closes cleanly beyond the protected swing.',
      'CHoCH signals the first structural break against the prevailing order flow after a HTF POI tap.',
      'Always map Higher Timeframe (H4/D1) external structure before refining M15/M5 entries.',
      'Wick-only sweeps without body close often indicate liquidity grabs rather than valid BOS.',
    ],
    youtubeSearchQuery: 'Smart Money Concepts BOS vs CHoCH',
  },
  {
    id: 'smc-2',
    track: 'SMC Strategy',
    title: 'SMC Order Blocks, Inducement (IDM) & Mitigation Traps',
    duration: 'SMC Execution',
    summary:
      'Avoid getting stopped out by early Order Blocks by identifying Inducement (IDM)—the internal pullback liquidity smart money sweeps right before tapping the extreme POI.',
    keyPoints: [
      'An Order Block is the last opposing candle prior to an impulsive move that creates an FVG and BOS.',
      'Never enter an Order Block that lacks an unmitigated imbalance or sits above/below internal Inducement.',
      'Wait for price to sweep the first pullback (IDM) into the extreme unmitigated Order Block.',
      'Protect capital by moving Stop Loss to breakeven once 1:1.5 R:R or an internal BOS prints.',
    ],
    youtubeSearchQuery: 'Smart Money Concepts Inducement Order Block',
  },
  {
    id: 'risk-1',
    track: 'Risk & Psychology',
    title: 'Institutional Risk Sizing & Prop-Firm Drawdown Protection',
    duration: 'Capital Defense',
    summary:
      'Consistent execution beats lucky big bets. Enforce strict 0.5%-1.0% risk per trade and hard daily drawdown limits across both manual ICT trades and MQL5 EA bots.',
    keyPoints: [
      'Never risk more than 1% on a single setup; cap daily drawdown at 2%-3%.',
      'Use GRIDPIPs Position Size Calculator before opening any Exness MT5 order.',
      'Log every winning and losing trade in your GRIDPIPs Journal with entry rationale.',
      'Stop trading for the day after 2 consecutive losses or hitting your daily target.',
    ],
    youtubeSearchQuery: 'ICT Risk Management Psychology',
  },
];

export const EducationView: React.FC<EducationViewProps> = ({ config }) => {
  const [selectedTrack, setSelectedTrack] = useState<'All' | 'ICT Core' | 'SMC Strategy' | 'Risk & Psychology'>('All');
  const [activeLesson, setActiveLesson] = useState<LessonModule>(LESSONS[0]);

  const channelUrl = `https://www.youtube.com/channel/${config.ictYoutubeChannelId}`;
  const uploadsPlaylistId = config.ictYoutubeChannelId.startsWith('UC')
    ? `UU${config.ictYoutubeChannelId.slice(2)}`
    : config.ictYoutubeChannelId;

  const filtered =
    selectedTrack === 'All' ? LESSONS : LESSONS.filter((l) => l.track === selectedTrack);

  return (
    <div className="space-y-6">
      {/* ICT Official YouTube Channel Integration */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-7 bg-slate-950 aspect-video lg:aspect-auto min-h-[300px]">
          <iframe
            className="w-full h-full min-h-[300px]"
            src={`https://www.youtube.com/embed/videoseries?list=${uploadsPlaylistId}`}
            title="ICT Official YouTube Mentorship Feed"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="lg:col-span-5 p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-blue-600 mb-1">
              Official ICT YouTube Channel · {config.ictYoutubeChannelId}
            </div>
            <h2 className="text-xl font-bold text-slate-950 mb-2">
              Inner Circle Trader (ICT) &amp; Smart Money Concepts Academy
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              Watch the latest mentorship uploads directly from the official ICT channel alongside our structured Smart Money Concepts (SMC) breakdowns below—100% free for all Exness-verified members.
            </p>
          </div>

          <div className="space-y-2.5 pt-4 border-t border-slate-100">
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 bg-slate-950 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 inline-flex items-center justify-center gap-2"
            >
              Open Full ICT YouTube Channel
              <ArrowUpRight className="w-4 h-4" />
            </a>
            <a
              href={config.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 inline-flex items-center justify-center gap-2"
            >
              Discuss Setups in JakoyoFX Telegram
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Filter & Curriculum */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(['All', 'ICT Core', 'SMC Strategy', 'Risk & Psychology'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSelectedTrack(t)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                selectedTrack === t ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {filtered.map((lesson) => {
            const isActive = activeLesson.id === lesson.id;
            return (
              <button
                key={lesson.id}
                onClick={() => setActiveLesson(lesson)}
                className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-slate-950 text-white border-slate-950'
                    : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`text-xs mb-1 ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
                  {lesson.track} · {lesson.duration}
                </div>
                <div className="text-sm font-bold leading-snug">{lesson.title}</div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="text-xs font-semibold text-blue-600 mb-1">
            {activeLesson.track} · {activeLesson.duration}
          </div>
          <h3 className="text-xl font-bold text-slate-950 mb-3">{activeLesson.title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">{activeLesson.summary}</p>

          <h4 className="text-sm font-bold text-slate-950 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            Execution Rules &amp; Checklist
          </h4>
          <ul className="space-y-3 mb-6">
            {activeLesson.keyPoints.map((kp, i) => (
              <li
                key={i}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700"
              >
                <span className="font-mono font-semibold text-blue-600 mr-2">0{i + 1}.</span>
                {kp}
              </li>
            ))}
          </ul>

          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
              activeLesson.youtubeSearchQuery
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
          >
            <PlayCircle className="w-4 h-4" />
            Watch Topic Breakdown on YouTube
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
