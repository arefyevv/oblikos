"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { isQwenVoice, voiceLabel, voiceStyles, type VoiceSettings } from "./validation";
import { previewVoiceAction } from "./actions";
import { voiceGender, voicesByGender } from "./catalog";
import { voiceSamples } from "./samples";

export function VoiceFields({ settings, onChange, deliveryOnly = false, inheritDelivery = false, defaultText }: { settings: VoiceSettings; onChange: (field: string, value: string) => void; deliveryOnly?: boolean; inheritDelivery?: boolean; defaultText?: string }) {
  const field = useId();
  useEffect(() => {
    if (!deliveryOnly && !settings.voiceId.startsWith("gemini31:")) {
      onChange("voiceId", settings.voiceId.startsWith("gemini:") ? settings.voiceId.replace("gemini:", "gemini31:") : "gemini31:Kore");
    }
  }, [deliveryOnly, settings.voiceId, onChange]);
  const gender = voiceGender(settings.voiceId);
  const availableVoices = voicesByGender(gender);
  const [text, setText] = useState(defaultText || "Привет! Это мой голос. Сегодня я расскажу о том, что меня вдохновляет.");
  const [sourceText, setSourceText] = useState(defaultText);
  if (defaultText !== sourceText) { setSourceText(defaultText); setText(defaultText || ""); }
  const [sample, setSample] = useState<{ url: string; fingerprint: string }>();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const receipt = useRef<{ id: string; fingerprint: string } | null>(null), running = useRef(false);
  const fingerprint = JSON.stringify({ settings, text });
  const qwen = isQwenVoice(settings.voiceId);
  const aitunnel = settings.voiceId.startsWith("qwen-flash:");
  const gemini = settings.voiceId.startsWith("gemini:");
  const gemini31 = settings.voiceId.startsWith("gemini31:");
  const playingSample = useRef<HTMLAudioElement | null>(null);
  return <div className="voice-settings">
    {!deliveryOnly && <p className="form-hint">Темп, манера и пожелания — подача персонажа по умолчанию. В карточке контента их можно изменить только для одной записи.</p>}
    <div className="character-fields">
      {!deliveryOnly && <>
        <div className="form-field"><label htmlFor={`${field}-gender`}>Тип голоса</label><select id={`${field}-gender`} value={gender} onChange={e => onChange("voiceId", e.target.value === "female" ? "gemini31:Kore" : "gemini31:Orus")}><option value="female">Женский</option><option value="male">Мужской</option></select><p className="form-hint">Выбор не связан с полом персонажа.</p></div>
      </>}
      <div className="form-field"><label htmlFor={`${field}-age`}>Возрастное звучание</label><select id={`${field}-age`} value={settings.ageTone || "original"} disabled={inheritDelivery || !gemini31} onChange={e => onChange("ageTone", e.target.value)}><option value="original">Исходное</option><option value="young">Молодое</option><option value="older">Зрелое / возрастное</option></select><p className="form-hint">Пожелание к подаче, а не возраст диктора. Результат оценивается в платной пробе; бесплатный пример показывает исходное звучание.</p></div>
      {!deliveryOnly && <>
        <div className="form-field character-field--wide voice-selection">
          <span id={`${field}-voice-title`}>Голос персонажа</span>
          <p className="form-hint">Прослушивание примеров бесплатно. Отметьте голос, чтобы выбрать его для персонажа.</p>
          <div className="voice-choice-list" role="radiogroup" aria-labelledby={`${field}-voice-title`}>
            {availableVoices.map(v => <div className={`voice-choice-row${settings.voiceId === v ? " voice-choice-row--selected" : ""}`} key={v}>
              <label><input type="radio" name={`${field}-voice`} checked={settings.voiceId === v} value={v} onChange={() => onChange("voiceId", v)} /><span>{voiceLabel(v)}</span></label>
              {voiceSamples[v]?.[0] && <audio controls preload="none" src={voiceSamples[v][0].url} aria-label={`Бесплатный пример ${voiceLabel(v)}`} onPlay={e => {
                if (playingSample.current && playingSample.current !== e.currentTarget) playingSample.current.pause();
                playingSample.current = e.currentTarget;
              }} />}
            </div>)}
          </div>
        </div>
      </>}
      <div className="form-field"><label htmlFor={`${field}-speed`}>Темп речи</label><select id={`${field}-speed`} value={settings.speed} disabled={inheritDelivery || aitunnel || gemini} onChange={e => onChange("speed", e.target.value)}><option value="0.85">Медленный</option><option value="1">Обычный</option><option value="1.15">Быстрый</option></select>{gemini31 && <p className="form-hint">Темп задаётся словесной инструкцией; точная скорость может отличаться между пробами.</p>}{gemini && <p className="form-hint">Управление темпом и манерой Gemini через AITUNNEL пока не подтверждено.</p>}{aitunnel && <p className="form-hint">В Qwen Flash через AITUNNEL темп и манера речи задаются голосом.</p>}{qwen && <p className="form-hint">Qwen учитывает темп как пожелание к подаче.</p>}</div>
      <div className="form-field"><label htmlFor={`${field}-style`}>Манера речи</label><select id={`${field}-style`} value={settings.style} disabled={inheritDelivery || aitunnel || gemini} onChange={e => onChange("style", e.target.value)}>{voiceStyles.map(v => <option key={v}>{v}</option>)}</select></div>
      <div className="form-field character-field--wide"><label htmlFor={`${field}-instructions`}>Пожелания к озвучке</label><textarea id={`${field}-instructions`} rows={3} maxLength={1000} disabled={inheritDelivery || aitunnel || gemini} value={settings.instructions} onChange={e => onChange("instructions", e.target.value)} placeholder={qwen ? "Speak naturally, with gentle pauses and conversational intonation." : "Например: говорить мягко, делать паузы, без театральных интонаций."} />{qwen && <p className="form-hint">Дополнительные пожелания пишите на английском. Текст озвучки — на русском; темп и манера речи учитываются автоматически.</p>}</div>
    </div>
    <div className="voice-preview">
      <h3>Проба со своим текстом · платно</h3><p className="form-hint">Искусственно созданный голос. Создание пробы платное; повторное прослушивание готового образца бесплатно.</p>
      <div className="character-fields"><div className="form-field character-field--wide"><label htmlFor={`${field}-text`}>Текст для пробы</label><textarea id={`${field}-text`} rows={3} maxLength={600} value={text} onChange={e => setText(e.target.value)} /><p className="form-hint">{text.length} / 600 символов</p></div></div>
      <Button variant="secondary" disabled={pending || !text.trim()} aria-busy={pending} onClick={() => {
        if (running.current) return;
        if (sample?.fingerprint === fingerprint) { setMessage("Этот образец уже готов — включите проигрыватель ниже."); return; }
        try {
          const stored = JSON.parse(sessionStorage.getItem("oblikos-voice-preview") || "null");
          if (!receipt.current && stored?.fingerprint === fingerprint && typeof stored.id === "string") receipt.current = stored;
        } catch { /* Database receipt remains authoritative. */ }
        if (receipt.current?.fingerprint !== fingerprint) receipt.current = { id: crypto.randomUUID(), fingerprint };
        const requestId = receipt.current.id;
        try { sessionStorage.setItem("oblikos-voice-preview", JSON.stringify(receipt.current)); } catch { /* Current-tab ref still protects retries. */ }
        running.current = true; setMessage("");
        start(async () => {
          try {
            const result = await previewVoiceAction({ settings, text, requestId });
            if (result.ok) { setSample({ url: result.url, fingerprint }); setMessage("Образец готов. Нажмите воспроизведение."); }
            else { setMessage(result.message); if (result.retry) { receipt.current = null; try { sessionStorage.removeItem("oblikos-voice-preview"); } catch {} } }
          } catch { setMessage("Ответ не получен. Повторите проверку — этот запрос защищён от повторного списания."); }
          finally { running.current = false; }
        });
      }}>{pending ? "Озвучиваем…" : "Создать платную пробу"}</Button>
      {message && <p className="form-message" role="status">{message}</p>}
      {sample && <><audio key={sample.url} controls preload="metadata" src={sample.url} aria-label="Образец голоса персонажа" />{sample.fingerprint !== fingerprint && <p className="form-hint">Настройки изменены. В проигрывателе предыдущий образец.</p>}</>}
    </div>
  </div>;
}
