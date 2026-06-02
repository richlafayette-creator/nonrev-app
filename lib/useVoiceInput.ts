'use client'

import { useEffect, useRef, useState } from 'react'

type SpeechRecognitionAlternative = {
  transcript: string
}

type SpeechRecognitionResult = {
  0: SpeechRecognitionAlternative
  isFinal: boolean
}

type SpeechRecognitionResultList = {
  length: number
  [index: number]: SpeechRecognitionResult
}

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList
}

type SpeechRecognitionErrorEvent = Event & {
  error?: string
  message?: string
}

type SpeechRecognitionInstance = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export function useVoiceInput({
  onTranscript,
  onStatus,
  idleStatus = 'Voice capture ready.'
}: {
  onTranscript: (transcript: string) => void
  onStatus: (status: string) => void
  idleStatus?: string
}) {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  const onStatusRef = useRef(onStatus)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
    onStatusRef.current = onStatus
  }, [onTranscript, onStatus])

  useEffect(() => {
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition
    setIsSupported(Boolean(SpeechRecognition))

    if (!SpeechRecognition) {
      onStatusRef.current('Voice capture is not supported in this browser yet. Type your trip request instead.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onstart = () => {
      setIsListening(true)
      onStatusRef.current('Listening… say a route, flight number, or trip idea.')
    }
    recognition.onend = () => {
      setIsListening(false)
      onStatusRef.current(idleStatus)
    }
    recognition.onerror = (event) => {
      setIsListening(false)
      const error = event.error || event.message || 'speech capture failed'
      onStatusRef.current(`Voice capture stopped: ${error}. You can type the request instead.`)
    }
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (transcript) {
        onTranscriptRef.current(transcript)
        onStatusRef.current(`Captured: “${transcript}”`)
      } else {
        onStatusRef.current('No voice text captured. Try again or type the request.')
      }
    }

    recognitionRef.current = recognition
    return () => {
      recognition.abort()
      recognitionRef.current = null
    }
  }, [idleStatus])

  function start() {
    if (!recognitionRef.current) {
      onStatusRef.current('Voice capture is not supported in this browser yet. Type your trip request instead.')
      return
    }

    try {
      recognitionRef.current.start()
    } catch {
      onStatusRef.current('Voice capture is already active or temporarily unavailable.')
    }
  }

  function stop() {
    recognitionRef.current?.stop()
  }

  return { isSupported, isListening, start, stop }
}
