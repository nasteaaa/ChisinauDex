import { useEffect, useRef, useState } from 'react'

// Browser speech APIs: dictation for the question field, read-aloud for answers.
// Both are progressive enhancements; the buttons are hidden when unsupported.

const VOICE_LANG: Record<string, string> = { ro: 'ro-RO', ru: 'ru-RU', en: 'en-US' }

interface Recognition {
  lang: string
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function useDictation(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const supported = typeof window !== 'undefined' && !!recognitionCtor()

  const start = () => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const r = new Ctor()
    r.lang = VOICE_LANG[lang] ?? 'ro-RO'
    r.interimResults = true
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(' '))
    r.onend = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }
  const stop = () => rec.current?.stop()
  return { supported, listening, start, stop }
}

export function useReadAloud() {
  const [speaking, setSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel() }, [supported])
  const speak = (text: string, lang: string) => {
    if (!supported) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = VOICE_LANG[lang] ?? 'ro-RO'
    u.onend = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(u)
  }
  const stop = () => { window.speechSynthesis.cancel(); setSpeaking(false) }
  return { supported, speaking, speak, stop }
}
