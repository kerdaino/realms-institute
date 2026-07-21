"use client";

import { useEffect, useRef, useState } from "react";

type PlayerCheckpoint = { id: string; title: string; position_seconds: number | null; position_percentage: number | null; is_required: boolean };

export function RecordingPlayer({ assignmentId, embedUrl, durationSeconds, checkpoints, completedCheckpointIds }: {
  assignmentId: string;
  embedUrl: string;
  durationSeconds: number | null;
  checkpoints: PlayerCheckpoint[];
  completedCheckpointIds: string[];
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const playbackId = useRef<string | null>(null);
  const position = useRef(0);
  const previous = useRef(0);
  const rate = useRef(1);
  const pausedCheckpoints = useRef(new Set(completedCheckpointIds));
  const [message, setMessage] = useState("Start the recording when you are ready. Progress is verified from actual playback evidence.");
  const [reachedCheckpoint, setReachedCheckpoint] = useState<PlayerCheckpoint | null>(null);
  const playerOrigin = new URL(embedUrl).origin;

  useEffect(() => {
    async function start() {
      if (playbackId.current) return;
      const response = await fetch(`/api/student/recordings/${assignmentId}/start`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Playback tracking could not be started.");
      playbackId.current = data.playbackSessionId;
      setMessage(data.message || "Playback progress is being recorded.");
    }
    async function heartbeat(seekEvent = false) {
      if (!playbackId.current || (!seekEvent && position.current <= previous.current)) return;
      const current = position.current;
      const response = await fetch(`/api/student/recordings/${assignmentId}/heartbeat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playback_session_id: playbackId.current, previous_position_seconds: previous.current, current_position_seconds: current, playback_rate: rate.current, seek_event: seekEvent }) });
      const data = await response.json();
      if (response.ok) {
        previous.current = current;
        setMessage(`${Math.floor(Number(data.watchPercentage ?? 0))}% unique viewing progress verified.`);
      } else setMessage(data.message || "Progress could not be saved. Playback evidence will be reviewed.");
    }
    async function end() {
      if (!playbackId.current) return;
      await heartbeat();
      const id = playbackId.current;
      playbackId.current = null;
      await fetch(`/api/student/recordings/${assignmentId}/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playback_session_id: id }), keepalive: true });
    }
    function pauseAtCheckpoint(seconds: number) {
      const checkpoint = checkpoints.find((item) => {
        if (!item.is_required || pausedCheckpoints.current.has(item.id)) return false;
        const target = item.position_seconds ?? (item.position_percentage !== null && durationSeconds ? durationSeconds * item.position_percentage / 100 : null);
        return target !== null && seconds >= target;
      });
      if (!checkpoint) return;
      pausedCheckpoints.current.add(checkpoint.id);
      frame.current?.contentWindow?.postMessage({ method: "pause" }, playerOrigin);
      setReachedCheckpoint(checkpoint);
      setMessage(`Checkpoint reached: ${checkpoint.title}. Complete it below before continuing.`);
    }
    function receive(event: MessageEvent) {
      if (event.origin !== playerOrigin) return;
      let payload = event.data;
      if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { return; } }
      if (!payload || typeof payload !== "object") return;
      const data = payload.data ?? {};
      if (payload.event === "play") { setReachedCheckpoint(null); void start(); }
      if (["timeupdate", "playProgress"].includes(payload.event) && typeof data.seconds === "number") { position.current = data.seconds; pauseAtCheckpoint(data.seconds); }
      if (payload.event === "seeked" && typeof data.seconds === "number") { position.current = data.seconds; void heartbeat(true); previous.current = data.seconds; pauseAtCheckpoint(data.seconds); }
      if (payload.event === "playbackratechange" && typeof data.playbackRate === "number") rate.current = data.playbackRate;
      if (["pause", "ended"].includes(payload.event)) void end();
    }
    window.addEventListener("message", receive);
    const timer = window.setInterval(() => void heartbeat(), 20_000);
    return () => { window.removeEventListener("message", receive); window.clearInterval(timer); void end(); };
  }, [assignmentId, checkpoints, durationSeconds, playerOrigin]);

  function subscribe() {
    for (const event of ["play", "pause", "ended", "timeupdate", "seeked", "playbackratechange"]) frame.current?.contentWindow?.postMessage({ method: "addEventListener", value: event }, playerOrigin);
  }

  return <div><div className="aspect-video overflow-hidden rounded-2xl bg-black"><iframe ref={frame} onLoad={subscribe} src={embedUrl} title="Class recording player" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full border-0" /></div><p role="status" className="mt-3 text-sm leading-6 text-slate-600">{message}</p>{reachedCheckpoint ? <a href={`#checkpoint-${reachedCheckpoint.id}`} className="mt-2 inline-flex rounded-lg bg-[#0b315c] px-4 py-2 text-sm font-semibold text-white">Open {reachedCheckpoint.title}</a> : null}</div>;
}

export function UnsupportedRecordingAccess({ assignmentId, externalUrl }: { assignmentId: string; externalUrl: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const response = await fetch(`/api/student/recordings/${assignmentId}/start`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) { setBusy(false); setMessage(data.message || "The recording could not be opened."); return; }
    window.location.assign(externalUrl);
  }
  return <div><button type="button" disabled={busy} onClick={() => void open()} className="mt-4 inline-flex rounded-lg bg-[#0b315c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Opening…" : "Open recording"}</button>{message ? <p role="status" className="mt-3 text-sm text-amber-950">{message}</p> : null}</div>;
}

export function CheckpointForm({ assignmentId, checkpoint }: { assignmentId: string; checkpoint: Record<string, unknown> }) {
  const [message, setMessage] = useState("");
  const questions = (checkpoint.recording_checkpoint_questions ?? []) as Array<Record<string, unknown>>;
  async function submit(event: React.FormEvent<HTMLFormElement>, questionId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/student/recordings/${assignmentId}/checkpoints/${checkpoint.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_id: questionId, answer: form.get("answer") }) });
    const data = await response.json();
    setMessage(response.ok ? data.status === "accepted" ? "Response accepted." : data.status === "under_review" ? "Response submitted for review." : "Response saved; try again after reviewing this section." : data.message || "Response could not be saved.");
  }
  return <article id={`checkpoint-${String(checkpoint.id)}`} className="scroll-mt-6 rounded-2xl border border-slate-200 p-5"><h3 className="font-semibold text-[#071327]">{String(checkpoint.title)}</h3><p className="mt-1 text-xs text-slate-500">Checkpoint {String(checkpoint.checkpoint_order)}</p><div className="mt-4 space-y-4">{questions.map((question) => <form key={String(question.id)} onSubmit={(event) => void submit(event, String(question.id))} className="rounded-xl bg-slate-50 p-4"><label className="block text-sm font-medium text-[#071327]">{String(question.prompt)}{question.question_type !== "short_answer" && Array.isArray(question.options) ? <select name="answer" required className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="">Choose an answer</option>{question.options.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select> : <textarea name="answer" required maxLength={5000} rows={3} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-3" />}</label><button className="mt-3 rounded-lg bg-[#0b315c] px-4 py-2 text-sm font-semibold text-white">Submit response</button></form>)}</div>{message ? <p role="status" className="mt-3 text-sm text-slate-700">{message}</p> : null}</article>;
}
