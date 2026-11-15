import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  ExternalLink,
  Film,
  Globe,
  Image as ImageIcon,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Download,
  ArrowRight,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface MediaCreationItem {
  id: string;
  kind: 'image' | 'video';
  model: string;
  prompt: string;
  aspectRatio: string;
  createdAt?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: string;
  sources?: Array<{ title: string; uri: string }>;
  timestamp: string;
}

const CHAT_MODELS = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Default · Search Ready)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fastest)' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon (Complex Coding/STEM)' },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon (Deep Reasoning)' },
] as const;

const ROLES = [
  { id: 'ict_mentor', label: 'ICT & SMC Mentor' },
  { id: 'mql5_coder', label: 'MQL5 Quantitative Coder' },
  { id: 'macro_analyst', label: 'Macro & Search Analyst' },
  { id: 'risk_coach', label: 'Risk & Psychology Coach' },
] as const;

const QUICK_PROMPTS = [
  'Explain the ICT NY AM Silver Bullet setup and FVG Consequent Encroachment rules.',
  'What are today’s key USD / Gold macro catalysts and market sentiment?',
  'Write an MQL5 risk-based lot size helper function for 1% stop loss risk.',
  'How do I avoid false Order Block sweeps during London Open?',
];

export const GeminiDeskView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      model: 'gemini-4-hydrogen',
      text: 'Welcome to the GRIDPIPs Gemini Trading Desk. Select a specialist role, pick your model, or enable Google Search Grounding for live macro news and citations.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>('gemini-4-hydrogen');
  const [roleKey, setRoleKey] = useState<string>('ict_mentor');
  const [useSearchGrounding, setUseSearchGrounding] = useState(true);
  const [deepReasoning, setDeepReasoning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(promptText?: string) {
    const text = (promptText ?? input).trim();
    if (!text || loading) return;

    setError('');
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    if (!promptText) setInput('');
    setLoading(true);

    try {
      const res = await apiFetch<{
        text: string;
        model: string;
        sources: Array<{ title: string; uri: string }>;
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          history: nextHistory,
          model: useSearchGrounding ? 'gemini-4-hydrogen' : model,
          roleKey,
          useSearchGrounding,
          deepReasoning,
        }),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: res.text,
          model: res.model,
          sources: res.sources,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Gemini Desk.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Specialist Persona</label>
            <select
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Model Engine</label>
            <select
              value={useSearchGrounding ? 'gemini-4-hydrogen' : model}
              disabled={useSearchGrounding}
              onChange={(e) => setModel(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
            >
              {CHAT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-2 mt-4 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={useSearchGrounding}
              onChange={(e) => setUseSearchGrounding(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            <span>Google Search Grounding</span>
          </label>

          {!useSearchGrounding && model === 'gemini-4-hydrogen' && (
            <label className="inline-flex items-center gap-2 px-3 py-2 mt-4 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={deepReasoning}
                onChange={(e) => setDeepReasoning(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Deep Reasoning (XHIGH)</span>
            </label>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            setMessages([
              {
                id: 'welcome',
                role: 'model',
                model: 'gemini-4-hydrogen',
                text: 'Conversation reset. Ask about ICT setups, MQL5 EA code, or live macro events.',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ])
          }
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear Thread
        </button>
      </div>

      {/* Quick Starters */}
      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => handleSend(q)}
            className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
          {error}
        </div>
      )}

      {/* Chat Thread */}
      <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-[540px]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-3xl rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1 text-[11px] opacity-70">
                  <span className="font-semibold flex items-center gap-1.5">
                    {m.role === 'model' && <Bot className="w-3.5 h-3.5 text-blue-600" />}
                    {m.role === 'user' ? 'You' : `GRIDPIPs AI (${m.model || 'gemini-4-hydrogen'})`}
                  </span>
                  <span className="font-mono">{m.timestamp}</span>
                </div>
                <div className="whitespace-pre-wrap break-words">{m.text}</div>

                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-blue-600" />
                      Google Search Sources
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {m.sources.map((src, idx) => (
                        <a
                          key={idx}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs text-blue-600 hover:border-blue-400"
                        >
                          <span className="truncate max-w-[220px]">{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Generating institutional analysis...</span>
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 border-t border-slate-200 flex items-center gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about ICT setups, MQL5 EAs, or live market news..."
            className="flex-1 px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const parts = dataUrl.split(',');
      const base64 = parts[1] || '';
      resolve({ base64, mimeType: file.type || 'image/png', dataUrl });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export const MediaStudioView: React.FC = () => {
  const [mode, setMode] = useState<'image' | 'video'>('image');

  // Image Studio State (gemini-nano-banana-2.1)
  const [imgPrompt, setImgPrompt] = useState(
    'Minimalist dark obsidian institutional trading floor glass emblem with crisp gold candlestick lattice, studio lighting'
  );
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [imageSize, setImageSize] = useState<'1K' | '2K'>('1K');
  const [editSource, setEditSource] = useState<{ base64: string; mimeType: string; dataUrl: string } | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState('');

  // Video Animator State (gemini-omni-1.2-flash Interactions API)
  const [videoPrompt, setVideoPrompt] = useState(
    'Slow cinematic camera push-in with subtle golden light sweep and gentle glass reflections'
  );
  const [videoAspect, setVideoAspect] = useState<'16:9' | '9:16'>('16:9');
  const [videoSource, setVideoSource] = useState<{ base64: string; mimeType: string; dataUrl: string } | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState('');
  const [vidLoading, setVidLoading] = useState(false);
  const [vidError, setVidError] = useState('');

  // Supabase history
  const [history, setHistory] = useState<MediaCreationItem[]>([]);

  async function loadMediaHistory() {
    try {
      const res = await apiFetch<{ items: MediaCreationItem[] }>('/api/supabase/media');
      setHistory(res.items || []);
    } catch {
      // ignore if offline
    }
  }

  useEffect(() => {
    void loadMediaHistory();
  }, []);

  async function handleGenerateImage(e: React.FormEvent) {
    e.preventDefault();
    setImgError('');
    setImgLoading(true);
    try {
      const res = await apiFetch<{ imageDataUrl: string; caption: string; model: string }>('/api/ai/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: imgPrompt,
          aspectRatio,
          imageSize,
          sourceImageBase64: editSource?.base64,
          sourceImageMimeType: editSource?.mimeType,
        }),
      });
      setGeneratedImageUrl(res.imageDataUrl);
      setImageCaption(res.caption);

      await apiFetch('/api/supabase/media', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'image',
          model: res.model,
          prompt: imgPrompt,
          aspectRatio,
        }),
      }).catch(() => {});
      void loadMediaHistory();
    } catch (err) {
      setImgError(err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setImgLoading(false);
    }
  }

  async function handleAnimateVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!videoSource) {
      setVidError('Please upload an image first (or send one from Image Studio).');
      return;
    }
    setVidError('');
    setVidLoading(true);
    try {
      const res = await apiFetch<{ videoDataUrl: string; model: string; aspectRatio: '16:9' | '9:16' }>(
        '/api/ai/video',
        {
          method: 'POST',
          body: JSON.stringify({
            prompt: videoPrompt,
            aspectRatio: videoAspect,
            imageBase64: videoSource.base64,
            imageMimeType: videoSource.mimeType,
          }),
        }
      );
      setGeneratedVideoUrl(res.videoDataUrl);

      await apiFetch('/api/supabase/media', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'video',
          model: res.model,
          prompt: videoPrompt,
          aspectRatio: res.aspectRatio,
        }),
      }).catch(() => {});
      void loadMediaHistory();
    } catch (err) {
      setVidError(err instanceof Error ? err.message : 'Video animation failed.');
    } finally {
      setVidLoading(false);
    }
  }

  function sendGeneratedImageToAnimator() {
    if (!generatedImageUrl) return;
    const [header, base64] = generatedImageUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+);/);
    setVideoSource({
      base64: base64 || '',
      mimeType: mimeMatch?.[1] || 'image/png',
      dataUrl: generatedImageUrl,
    });
    setMode('video');
  }

  return (
    <div className="space-y-6">
      {/* Studio Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Creative Trading Media Studio</h2>
          <p className="text-xs text-slate-500">
            Generate or edit brand visuals with Nano Banana 2.1, then animate any photo into 16:9 or 9:16 video with Gemini Omni Flash.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('image')}
            className={`px-4 py-2 text-xs font-semibold rounded-md inline-flex items-center gap-2 cursor-pointer ${
              mode === 'image' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Create &amp; Edit Images
          </button>
          <button
            type="button"
            onClick={() => setMode('video')}
            className={`px-4 py-2 text-xs font-semibold rounded-md inline-flex items-center gap-2 cursor-pointer ${
              mode === 'video' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            Animate Photo to Video
          </button>
        </div>
      </div>

      {mode === 'image' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleGenerateImage} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="text-xs font-semibold text-blue-600">Model: gemini-nano-banana-2.1</div>
            {imgError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {imgError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Optional Source Image (for Image Editing)
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:border-blue-500 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{editSource ? 'Source image attached (click to replace)' : 'Upload PNG/JPG to edit'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setEditSource(await readFileAsBase64(f));
                  }}
                />
              </label>
              {editSource && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <img src={editSource.dataUrl} alt="Source preview" className="h-14 rounded border border-slate-200" />
                  <button
                    type="button"
                    onClick={() => setEditSource(null)}
                    className="text-rose-600 hover:underline cursor-pointer"
                  >
                    Remove image
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Prompt</label>
              <textarea
                rows={4}
                required
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Aspect Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                >
                  <option value="1:1">1:1 Square</option>
                  <option value="16:9">16:9 Landscape</option>
                  <option value="9:16">9:16 Portrait</option>
                  <option value="4:3">4:3 Standard</option>
                  <option value="3:4">3:4 Vertical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Resolution</label>
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value === '2K' ? '2K' : '1K')}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                >
                  <option value="1K">1K Fast</option>
                  <option value="2K">2K High Detail</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={imgLoading}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {imgLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editSource ? 'Apply Edit with Nano Banana 2.1' : 'Generate Image'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
            {generatedImageUrl ? (
              <div className="space-y-4">
                <img
                  src={generatedImageUrl}
                  alt="Generated output"
                  className="w-full max-h-[420px] object-contain rounded-lg border border-slate-200 bg-slate-950"
                />
                {imageCaption && <p className="text-xs text-slate-600">{imageCaption}</p>}
                <div className="flex flex-wrap gap-3">
                  <a
                    href={generatedImageUrl}
                    download={`gridpips-image-${Date.now()}.png`}
                    className="px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PNG
                  </a>
                  <button
                    type="button"
                    onClick={sendGeneratedImageToAnimator}
                    className="px-4 py-2 border border-blue-600 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    Animate into Video
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-72 flex flex-col items-center justify-center text-center text-slate-400">
                <ImageIcon className="w-10 h-10 mb-2" />
                <div className="text-sm font-medium text-slate-600">Image preview appears here</div>
                <div className="text-xs">Supports text-to-image and photo-guided editing</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleAnimateVideo} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="text-xs font-semibold text-blue-600">Model: gemini-omni-1.2-flash (Interactions API)</div>
            {vidError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {vidError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Starting Frame Image</label>
              <label className="flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 hover:border-blue-500 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{videoSource ? 'Starting image loaded (click to change)' : 'Upload PNG or JPG photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setVideoSource(await readFileAsBase64(f));
                  }}
                />
              </label>
              {videoSource && (
                <img
                  src={videoSource.dataUrl}
                  alt="Video starting frame"
                  className="mt-3 max-h-40 rounded-lg border border-slate-200 object-contain"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Motion Prompt</label>
              <textarea
                rows={3}
                required
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Video Aspect Ratio</label>
              <div className="grid grid-cols-2 gap-2">
                {(['16:9', '9:16'] as const).map((ar) => (
                  <button
                    key={ar}
                    type="button"
                    onClick={() => setVideoAspect(ar)}
                    className={`py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                      videoAspect === ar
                        ? 'bg-slate-950 text-white border-slate-950'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {ar === '16:9' ? '16:9 Landscape' : '9:16 Vertical (Shorts/Reels)'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={vidLoading || !videoSource}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {vidLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {vidLoading ? 'Rendering Video (may take 30–90s)...' : 'Animate Image into Video'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-center">
            {generatedVideoUrl ? (
              <div className="space-y-4">
                <video
                  src={generatedVideoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full max-h-[440px] rounded-lg bg-slate-950"
                />
                <a
                  href={generatedVideoUrl}
                  download={`gridpips-video-${Date.now()}.mp4`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-950 text-white text-xs font-semibold rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download MP4
                </a>
              </div>
            ) : (
              <div className="h-72 flex flex-col items-center justify-center text-center text-slate-400">
                <Film className="w-10 h-10 mb-2" />
                <div className="text-sm font-medium text-slate-600">Animated video player appears here</div>
                <div className="text-xs">Upload a chart, avatar, or graphic to animate in 16:9 or 9:16</div>
              </div>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-950 mb-3">Cloud Synced Creation Log (Supabase)</h3>
          <div className="divide-y divide-slate-100">
            {history.slice(0, 6).map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                <div className="min-w-0">
                  <span className="font-mono font-semibold text-blue-600 uppercase mr-2">{item.kind}</span>
                  <span className="text-slate-800 truncate">{item.prompt}</span>
                </div>
                <span className="font-mono text-slate-500 shrink-0">
                  {item.aspectRatio} · {item.model}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
