
export type SpeakerType = 'EXPERT' | 'LEARNER';
export type DialogueType = 'سؤال و جواب' | 'نقاش طبيعي' | 'نقاش حاد';
export type VoiceGender = 'male' | 'female';
export type Dialect = 'standard' | 'egyptian' | 'saudi' | 'lebanese' | 'maghrebi';

export interface Flashcard {
  term: string;
  definition: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string; inlineData?: any }[];
}

export interface HistoryItem {
  id: string;
  title: string;
  type: 'assistant' | 'tts' | 'podcast' | 'flashcards' | 'explainer' | 'analyzer' | 'group';
  content: any;
  timestamp: number;
}

export interface SessionState {
  roomId: string | null;
  isHost: boolean;
  connected: boolean;
  messages: { sender: 'me' | 'peer'; text: string; timestamp: number }[];
  callState: 'idle' | 'calling' | 'incoming' | 'connected';
}

export interface DialoguePart {
  speaker: SpeakerType;
  text: string;
}
