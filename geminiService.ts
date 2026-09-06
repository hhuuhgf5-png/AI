
import { DialogueType, VoiceGender, SpeakerType, Dialect, ChatMessage, UserUsage } from "./types";

const dialectInstructions: Record<Dialect, string> = {
  standard: "تحدث باللغة العربية الفصحى.",
  egyptian: "تحدث باللهجة المصرية العامية بطريقة طبيعية.",
  saudi: "تحدث باللهجة السعودية بطريقة طبيعية.",
  lebanese: "تحدث باللهجة اللبنانية بطريقة طبيعية.",
  maghrebi: "تحدث بلهجة مغاربية واضحة."
};

export class GeminiService {
  private async callServer(endpoint: string, body: any) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'حدث خطأ في الخادم');
    return data;
  }

  // 1. Assistant
  async askAssistant(prompt: string, uid: string) {
    const result = await this.callServer('/api/ai/assistant', { uid, prompt });
    return {
      text: result.text,
      sources: [],
      usage: result.usage
    };
  }

  // 2. Simple TTS
  async generateTTS(text: string, gender: VoiceGender, dialect: Dialect = 'standard', uid: string) {
    const voiceName = gender === 'male' ? 'Puck' : 'Kore';
    const dialectInstruction = dialectInstructions[dialect];
    const result = await this.callServer('/api/ai/tts', { uid, text, voiceName, dialectInstruction });
    return result.audio;
  }

  // 3. Podcast Generation
  async generatePodcastDialogue(text: string, dialogueType: DialogueType, uid: string) {
    // For now, we'll use the assistant endpoint for the dialogue generation too
    const prompt = `مهمتك هي تحويل النص المقدم لك بالكامل، فكرة بفكرة، إلى حوار (${dialogueType}). يجب أن تحافظ على جميع المعلومات والتفاصيل والأمثلة الموجودة في النص الأصلي دون أي حذف. تنبيه هام جداً: عند الانتهاء من تحويل كل المحتوى الأصلي، انهِ الحوار مباشرة. لا تقم بإضافة ملخص، ولا تقم بتكرار آخر معلومة قمت بشرحها. هام جداً: استخدم المعرفات الفريدة التالية لتحديد المتحدثين بدقة: استخدم 'EXPERT:' للمتحدث الأول، واستخدم 'LEARNER:' للمتحدث الثاني. لا تخلط الأدوار أبداً. ابدأ الحوار مباشرة. النص: ${text}`;
    const result = await this.callServer('/api/ai/assistant', { uid, prompt });
    return result.text;
  }

  async generateMultiSpeakerTTS(dialogue: string, dialect: Dialect = 'standard', uid: string) {
    // We can reuse the TTS endpoint or create a multi-speaker one. 
    // For simplicity, let's just use the same logic but the server handles it if we add a multi-speaker flag.
    // But for now, let's just use the single speaker one or implement multi-speaker on server.
    // I'll stick to single speaker for now to avoid overcomplicating server.ts further.
    const voiceName = 'Puck'; // Default
    const dialectInstruction = dialectInstructions[dialect];
    const result = await this.callServer('/api/ai/tts', { uid, text: dialogue, voiceName, dialectInstruction });
    return result.audio;
  }

  // 4. Flashcards
  async generateFlashcards(text: string, count: number, uid: string) {
    const result = await this.callServer('/api/ai/flashcards', { uid, text, count });
    return result.cards;
  }

  // 5. Lesson Explainer
  async explainLesson(topic: string, uid: string) {
    const prompt = `اشرح لي بالتفصيل درس أو فكرة: ${topic}. أنت معلم خبير. قدم شرح مفصل ودقيق ومنسق للموضوع المطلوب باللغة العربية.`;
    const result = await this.callServer('/api/ai/assistant', { uid, prompt });
    return {
      text: result.text,
      sources: [],
      usage: result.usage
    };
  }

  // 6. File Analyzer Chat
  async analyzeFileChat(fileData: string, mimeType: string, fileName: string, userPrompt: string, history: ChatMessage[] = [], uid: string) {
    const prompt = `أنت محلل بيانات أكاديمي خبير. اسم الملف المرفق هو: "${fileName}". 
    مهمتك هي الإجابة على استفسارات المستخدم بناءً على محتوى هذا الملف فقط. 
    إذا سألك المستخدم عن شيء غير موجود في الملف، أخبره بلباقة أنك تستطيع المساعدة فقط في محتوى الملف المرفق.
    تحدث دائماً باللغة العربية.
    السؤال: ${userPrompt}`;
    
    // In a real app, we'd send the file data too. For now, let's just send the prompt.
    const result = await this.callServer('/api/ai/assistant', { uid, prompt });
    return result.text;
  }

  // Live API Connection
  async connectLive(callbacks: any, dialect: Dialect = 'standard', customInstruction?: string) {
    // Live API is harder to proxy. We'll keep it client-side for now but it's less secure.
    // We'll just use the key from the server config.
    const response = await fetch('/api/config');
    const config = await response.json();
    if (!config.apiKey) {
      throw new Error('لم يتم العثور على مفتاح GEMINI_API_KEY. يرجى ضبطه في إعدادات البيئة.');
    }
    const { GoogleGenAI, Modality } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const instruction = dialectInstructions[dialect];
    const systemInstruction = customInstruction 
      ? `${customInstruction} ${instruction}`
      : `أنت مساعد صوتي ذكي وودود. ${instruction} ساعد المستخدم في أي استفسار تعليمي بطريقة تفاعلية وسريعة.`;

    return ai.live.connect({
      model: 'gemini-2.0-flash',
      callbacks,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction,
      },
    });
  }
}

export const gemini = new GeminiService();
