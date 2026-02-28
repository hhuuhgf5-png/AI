
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DialogueType, VoiceGender, SpeakerType, Dialect, ChatMessage } from "./types";

const dialectInstructions: Record<Dialect, string> = {
  standard: "تحدث باللغة العربية الفصحى.",
  egyptian: "تحدث باللهجة المصرية العامية بطريقة طبيعية.",
  saudi: "تحدث باللهجة السعودية بطريقة طبيعية.",
  lebanese: "تحدث باللهجة اللبنانية بطريقة طبيعية.",
  maghrebi: "تحدث بلهجة مغاربية واضحة."
};

export class GeminiService {
  private getClient() {
    const key = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    return new GoogleGenAI({ apiKey: key });
  }

  // 1. Assistant with Search
  async askAssistant(prompt: string) {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "أنت مساعد شخصي خبير. مهمتك هي الإجابة على الأسئلة العلمية بدقة بناءً على نتائج البحث. نسق الإجابة لتكون واضحة وشاملة مع ذكر المصادر إن وجدت."
      }
    });
    return {
      text: response.text,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  }

  // 2. Simple TTS - FIXED: Swapped Kore/Puck to fix gender mismatch
  async generateTTS(text: string, gender: VoiceGender, dialect: Dialect = 'standard') {
    const ai = this.getClient();
    // Puck is Male, Kore is Female
    const voiceName = gender === 'male' ? 'Puck' : 'Kore';
    const instruction = dialectInstructions[dialect];
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `${instruction}\n\nالنص المطلوب تحويله لصوت: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  }

  // 3. Podcast Generation
  async generatePodcastDialogue(text: string, dialogueType: DialogueType) {
    const ai = this.getClient();
    const systemPrompt = `مهمتك هي تحويل النص المقدم لك بالكامل، فكرة بفكرة، إلى حوار (${dialogueType}). يجب أن تحافظ على جميع المعلومات والتفاصيل والأمثلة الموجودة في النص الأصلي دون أي حذف. تنبيه هام جداً: عند الانتهاء من تحويل كل المحتوى الأصلي، انهِ الحوار مباشرة. لا تقم بإضافة ملخص، ولا تقم بتكرار آخر معلومة قمت بشرحها. هام جداً: استخدم المعرفات الفريدة التالية لتحديد المتحدثين بدقة: استخدم 'EXPERT:' للمتحدث الأول، واستخدم 'LEARNER:' للمتحدث الثاني. لا تخلط الأدوار أبداً. ابدأ الحوار مباشرة.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: text,
      config: {
        systemInstruction: systemPrompt
      }
    });
    return response.text;
  }

  async generateMultiSpeakerTTS(dialogue: string, dialect: Dialect = 'standard') {
    const ai = this.getClient();
    const instruction = dialectInstructions[dialect];
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `${instruction}\n\nالحوار المرفق:\n${dialogue}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: 'EXPERT', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }, // Expert Male
              { speaker: 'LEARNER', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }  // Learner Female
            ]
          }
        }
      }
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  }

  // 4. Flashcards
  async generateFlashcards(text: string, count: number) {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `استخرج أهم ${count} مصطلحات من النص ده واعملهم في شكل (سؤال وإجابة) بتنسيق JSON.
      النص: ${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              definition: { type: Type.STRING }
            },
            required: ["term", "definition"]
          }
        }
      }
    });
    return JSON.parse(response.text || '[]');
  }

  // 5. Lesson Explainer
  async explainLesson(topic: string) {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `اشرح لي بالتفصيل درس أو فكرة: ${topic}`,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "أنت معلم خبير. ابحث في يوتيوب وجوجل ومعلوماتك لتقديم شرح مفصل ودقيق ومنسق للموضوع المطلوب باللغة العربية."
      }
    });
    return {
      text: response.text,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  }

  // 6. File Analyzer Chat
  async analyzeFileChat(fileData: string, mimeType: string, fileName: string, userPrompt: string, history: ChatMessage[] = []) {
    const ai = this.getClient();
    
    // If it's the first message, we include the file.
    // In subsequent messages, the model should already have the context if we use a chat session.
    // However, since we are managing history manually in the state for persistence/simplicity,
    // we can either use the chat API or just send the whole history.
    
    const contents = history.map(msg => ({
      role: msg.role,
      parts: msg.parts
    }));

    // Add the current message with the file if it's the first one or if we want to ensure context.
    // For simplicity and reliability in this environment, we'll send the file with the first user message in the history if not present,
    // or just append the new message.
    
    const currentParts: any[] = [{ text: userPrompt }];
    if (contents.length === 0) {
      currentParts.unshift({ inlineData: { data: fileData, mimeType } });
    }

    contents.push({
      role: 'user',
      parts: currentParts
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents,
      config: {
        systemInstruction: `أنت محلل بيانات أكاديمي خبير. اسم الملف المرفق هو: "${fileName}". 
        مهمتك هي الإجابة على استفسارات المستخدم بناءً على محتوى هذا الملف فقط. 
        إذا سألك المستخدم عن شيء غير موجود في الملف، أخبره بلباقة أنك تستطيع المساعدة فقط في محتوى الملف المرفق.
        تحدث دائماً باللغة العربية.`
      }
    });

    return response.text;
  }

  // Live API Connection
  async connectLive(callbacks: any, dialect: Dialect = 'standard', customInstruction?: string) {
    const ai = this.getClient();
    const instruction = dialectInstructions[dialect];
    const systemInstruction = customInstruction 
      ? `${customInstruction} ${instruction}`
      : `أنت مساعد صوتي ذكي وودود. ${instruction} ساعد المستخدم في أي استفسار تعليمي بطريقة تفاعلية وسريعة.`;

    return ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
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
