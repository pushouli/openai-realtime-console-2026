import { useEffect, useRef, useState } from "react";
import { X } from "react-feather";
import {
  EAGERNESS_LEVELS,
  NOISE_REDUCTION_TYPES,
  REASONING_EFFORTS,
  VAD_TYPES,
  VOICES,
} from "../lib/config";

/**
 * Session configuration.
 *
 * The markup mirrors the original ConfigurationDialog so the ported
 * ConsolePage.scss (.configuration-dialog, from line 892) styles it.
 */
function Field({ label, help, children }) {
  return (
    <div className="form-item">
      <div className="form-item_bd">
        <div className="label-box">
          <label>{label}</label>
        </div>
        <div className="textfield-box">{children}</div>
      </div>
      <div className="explain-box">{help}</div>
    </div>
  );
}

/** Select whose blank option means "leave it to the model". */
function Select({ value, onChange, options, blankLabel, disabled }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {blankLabel && <option value="">{blankLabel}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Slider({ value, onChange, min, max, step, format }) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
      <span>{format ? format(value) : value}</span>
    </>
  );
}

export default function ConfigDialog({
  open,
  onClose,
  config,
  onSave,
  isSessionActive,
}) {
  const dialogRef = useRef(null);
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Start from the saved values every time the dialog opens, so a cancelled
  // edit does not leak into the next one.
  useEffect(() => {
    if (open) {
      setDraft(config);
      setError(null);
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  const setTurnDetection = (patch) =>
    setDraft((prev) => ({
      ...prev,
      turn_detection: { ...prev.turn_detection, ...patch },
    }));

  // The config lives on the server, so a save can fail. Keep the dialog open
  // and show why rather than silently dropping the edit.
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="configuration-dialog">
      <div className="dialog-content">
        <header>
          <label>Config</label>
          <a onClick={onClose}>
            <X />
          </a>
        </header>

        <main>
          <div className="form-wrap">
            <Field
              label="AI Name（名称）"
              help={
                <>
                  <p>
                    Shown in the header.
                    <br />
                    显示在标题栏。
                  </p>
                </>
              }
            >
              <input
                type="text"
                value={draft.name}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </Field>

            <Field
              label="Voice（声音）"
              help={
                <>
                  <p>
                    Selects a speaker for AI audio output.
                    <br />
                    选择发音人，定制 AI 语音输出。
                  </p>
                  {isSessionActive && (
                    <p>会话进行中无法切换，保存后于下次连接生效。</p>
                  )}
                </>
              }
            >
              <select
                value={draft.voice}
                disabled={isSessionActive}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, voice: e.target.value }))
                }
              >
                {VOICES.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Reasoning Effort（推理强度）"
              help={
                <>
                  <p>
                    How much the model thinks before answering. Higher improves
                    hard turns and costs latency.
                    <br />
                    模型回答前思考多少。调高提升复杂问题的质量，代价是首字延迟。
                  </p>
                  <p>
                    gpt-realtime-2.x 上取代了原来的 Temperature。
                    留空则用模型自己的默认值。
                  </p>
                  <p>
                    【注意】各模型支持的档位不同，选了不支持的值会被服务端拒绝，
                    事件日志里能看到。
                  </p>
                </>
              }
            >
              <Select
                value={draft.reasoning_effort}
                onChange={(reasoning_effort) =>
                  setDraft((prev) => ({ ...prev, reasoning_effort }))
                }
                options={REASONING_EFFORTS}
                blankLabel="（默认）"
              />
            </Field>

            <Field
              label="Speed（语速）"
              help={
                <>
                  <p>
                    Playback speed of the spoken reply, as a multiple.
                    <br />
                    模型说话的倍速。1 为原速，留空即默认。
                  </p>
                </>
              }
            >
              <input
                type="number"
                min={0.25}
                max={4}
                step={0.05}
                placeholder="默认"
                value={draft.speed}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, speed: e.target.value }))
                }
              />
            </Field>

            <Field
              label="Noise Reduction（降噪）"
              help={
                <>
                  <p>
                    Filters the input before it reaches VAD and the model.
                    <br />
                    在送进 VAD 和模型之前先过滤输入音频。
                  </p>
                  <p>
                    near_field：耳机、手持麦这类贴近嘴部的设备。
                    <br />
                    far_field：会议麦、车载麦这类远场设备——小车适合这个。
                  </p>
                </>
              }
            >
              <Select
                value={draft.noise_reduction}
                onChange={(noise_reduction) =>
                  setDraft((prev) => ({ ...prev, noise_reduction }))
                }
                options={NOISE_REDUCTION_TYPES}
                blankLabel="（关闭）"
              />
            </Field>

            <Field
              label="Turn Detection（断句方式）"
              help={
                <>
                  <p>
                    server_vad：按音量判断有没有说完，靠下面三个参数调。
                    <br />
                    semantic_vad：用模型判断语义上说完没有，不容易在思考停顿时抢话。
                  </p>
                  <p>选择哪种，下面就只显示哪种的参数。</p>
                </>
              }
            >
              <Select
                value={draft.turn_detection.type}
                onChange={(type) => setTurnDetection({ type })}
                options={VAD_TYPES}
              />
            </Field>

            {draft.turn_detection.type === "semantic_vad" && (
              <Field
                label="Eagerness（抢话倾向）"
                help={
                  <>
                    <p>
                      How long semantic VAD waits before deciding you are done.
                      <br />
                      语义断句等多久才认定你说完了。
                    </p>
                    <p>
                      low 等得更久，适合会长时间思考的场景；high 回应更快。
                      auto 等同于 medium。
                    </p>
                  </>
                }
              >
                <Select
                  value={draft.turn_detection.eagerness}
                  onChange={(eagerness) => setTurnDetection({ eagerness })}
                  options={EAGERNESS_LEVELS}
                />
              </Field>
            )}

            {draft.turn_detection.type !== "semantic_vad" && (
              <>
            <Field
              label="Threshold（阈值）"
              help={
                <>
                  <p>
                    Sets the "minimum audio intensity level" to trigger
                    recording.
                    <br />
                    设定触发录音的「声音强度临界值」。
                  </p>
                  <p>
                    Noisy environment? → Increase Threshold.
                    <br />
                    环境噪音大 → 调高 Threshold。
                  </p>
                  <p>
                    Defaults to 0.5.
                    <br />
                    默认为 0.5。
                  </p>
                </>
              }
            >
              <Slider
                value={draft.turn_detection.threshold}
                onChange={(threshold) => setTurnDetection({ threshold })}
                min={0}
                max={0.9}
                step={0.1}
              />
            </Field>

            <Field
              label="Prefix Padding（前缀缓冲时间）"
              help={
                <>
                  <p>
                    Adds a "pre-recorded buffer" before the detected speech.
                    <br />
                    在检测到语音前添加「预录缓冲时间」，确保开头完整。
                  </p>
                  <p>
                    Missing the start of speech? → Extend Prefix Padding.
                    <br />
                    录音总是缺开头 → 延长 Prefix Padding。
                  </p>
                  <p>
                    Defaults to 300ms.
                    <br />
                    默认为 300 毫秒。
                  </p>
                </>
              }
            >
              <Slider
                value={draft.turn_detection.prefix_padding_ms}
                onChange={(prefix_padding_ms) =>
                  setTurnDetection({ prefix_padding_ms })
                }
                min={1}
                max={5000}
                step={1}
                format={(v) => `${v}ms`}
              />
            </Field>

            <Field
              label="Silence Duration（静音时长）"
              help={
                <>
                  <p>
                    Determines "how long to wait in silence" before stopping
                    recording.
                    <br />
                    设定「持续静音多久后停止录音」。
                  </p>
                  <p>
                    Recording stops too early/late? → Shorten/Lengthen Silence
                    Duration.
                    <br />
                    录音结束太早/太晚 → 缩短/延长 Silence Duration。
                  </p>
                  <p>
                    Defaults to 500ms.
                    <br />
                    默认为 500 毫秒。
                  </p>
                </>
              }
            >
              <Slider
                value={draft.turn_detection.silence_duration_ms}
                onChange={(silence_duration_ms) =>
                  setTurnDetection({ silence_duration_ms })
                }
                min={1}
                max={5000}
                step={1}
                format={(v) => `${v}ms`}
              />
            </Field>
              </>
            )}

            <Field
              label="Max Output Tokens（单轮回复上限）"
              help={
                <>
                  <p>
                    Caps one assistant reply. 1-4096, or blank for no limit.
                    <br />
                    限制单轮回复长度。填 1-4096，留空即不限制。
                  </p>
                  <p>语音场景里回答本就该短，设个上限能防止跑题长篇。</p>
                </>
              }
            >
              <input
                type="number"
                min={1}
                max={4096}
                step={1}
                placeholder="不限"
                value={draft.max_output_tokens}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    max_output_tokens: e.target.value,
                  }))
                }
              />
            </Field>

            <Field
              label="Transcription Language（转写语言）"
              help={
                <>
                  <p>
                    ISO-639-1 code for the input language, e.g. zh or en.
                    <br />
                    输入语言的 ISO-639-1 代码，比如 zh、en。
                  </p>
                  <p>
                    指定之后转写准确率和延迟都会好一些；留空则自动识别。
                  </p>
                </>
              }
            >
              <input
                type="text"
                placeholder="自动"
                value={draft.transcription_language}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    transcription_language: e.target.value,
                  }))
                }
              />
            </Field>

            <Field
              label="Instructions（指令集）"
              help={
                <>
                  <p>
                    Defines the AI's role, task parameters, and contextual
                    knowledge for accurate responses.
                    <br />
                    设定 AI 的角色、任务范围和背景知识，确保回答符合场景需求。
                  </p>
                  <p>
                    Complex tasks? → Provide detailed Instructions.
                    <br />
                    任务复杂？ → 提供详细指令。
                  </p>
                </>
              }
            >
              <textarea
                rows={8}
                value={draft.instructions}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, instructions: e.target.value }))
                }
              />
            </Field>

            <Field
              label="User Opener（用户开场白）"
              help={
                <>
                  <p>
                    Pre-written user phrases to initiate interaction and guide
                    the conversation flow.
                    <br />
                    预设用户的首句话，触发 AI 回应并引导对话方向。
                  </p>
                  <p>
                    Awkward silence? → Design clear openers.
                    <br />
                    避免冷场？ → 设计明确开场白。留空则不发。
                  </p>
                </>
              }
            >
              <textarea
                rows={3}
                value={draft.opener}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, opener: e.target.value }))
                }
              />
            </Field>
          </div>
        </main>

        <footer>
          {error && <span className="save-error">{error}</span>}
          <button data-component="Button" className="ok" onClick={handleSave}>
            {saving ? "Saving..." : "Save"}
          </button>
          &nbsp;
          <button data-component="Button" className="cancel" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </dialog>
  );
}
