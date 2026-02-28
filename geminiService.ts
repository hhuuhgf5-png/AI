
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
  private keys: string[] = [
    process.env.GEMINI_API_KEY_1 || '',
    process.env.GEMINI_API_KEY_2 || '',
    process.env.GEMINI_API_KEY_3 || ''
  ].filter(k => k !== '');

  private currentKeyIndex = 0;

  private getClient() {
    const key = this.keys[this.currentKeyIndex] || process.env.GEMINI_API_KEY_1 || '';
    return new GoogleGenAI({ apiKey: key });
  }

  private rotateKey() {
    if (this.keys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      console.log(`Rotating to API Key #${this.currentKeyIndex + 1}`);
      return true;
    }
    return false;
  }

  private async withRetry<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
    let attempts = 0;
    const maxAttempts = Math.max(this.keys.length, 1);

    while (attempts < maxAttempts) {
      try {
        const ai = this.getClient();
        return await fn(ai);
      } catch (error: any) {
        attempts++;
        console.error(`Attempt ${attempts} failed with key index ${this.currentKeyIndex}:`, error?.message || error);
        
        // Check if error is related to quota or invalid key
        const errorMessage = (error?.message || '').toLowerCase();
        const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('exhausted');
        const isInvalidKey = errorMessage.includes('api_key_invalid') || errorMessage.includes('403') || errorMessage.includes('key not valid');

        if ((isQuotaError || isInvalidKey) && attempts < maxAttempts) {
          this.rotateKey();
          continue;
        }
        throw error;
      }
    }
    throw new Error("All API keys failed or limit exceeded.");
  }

  // 1. Assistant with Search
  async askAssistant(prompt: string) {
    return this.withRetry(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: {
          systemInstruction: "أنت مساعد شخصي خبير. مهمتك هي الإجابة على الأسئلة العلمية بدقة. نسق الإجابة لتكون واضحة وشاملة."
        }
      });
      return {
        text: response.text,
        sources: []
      };
    });
  }

  // 2. Simple TTS
  async generateTTS(text: string, gender: VoiceGender, dialect: Dialect = 'standard') {
    return this.withRetry(async (ai) => {
      const voiceName = gender === 'male' ? 'Puck' : 'Kore';
      const instruction = dialectInstructions[dialect];
      
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
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
    });
  }

  // 3. Podcast Generation
  async generatePodcastDialogue(text: string, dialogueType: DialogueType) {
    return this.withRetry(async (ai) => {
      const systemPrompt = `مهمتك هي تحويل النص المقدم لك بالكامل، فكرة بفكرة، إلى حوار (${dialogueType}). يجب أن تحافظ على جميع المعلومات والتفاصيل والأمثلة الموجودة في النص الأصلي دون أي حذف. تنبيه هام جداً: عند الانتهاء من تحويل كل المحتوى الأصلي، انهِ الحوار مباشرة. لا تقم بإضافة ملخص، ولا تقم بتكرار آخر معلومة قمت بشرحها. هام جداً: استخدم المعرفات الفريدة التالية لتحديد المتحدثين بدقة: استخدم 'EXPERT:' للمتحدث الأول، واستخدم 'LEARNER:' للمتحدث الثاني. لا تخلط الأدوار أبداً. ابدأ الحوار مباشرة.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: text,
        config: {
          systemInstruction: systemPrompt
        }
      });
      return response.text;
    });
  }

  async generateMultiSpeakerTTS(dialogue: string, dialect: Dialect = 'standard') {
    return this.withRetry(async (ai) => {
      const instruction = dialectInstructions[dialect];
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ parts: [{ text: `${instruction}\n\nالحوار المرفق:\n${dialogue}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                { speaker: 'EXPERT', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
                { speaker: 'LEARNER', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
              ]
            }
          }
        }
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    });
  }

  // 4. Flashcards
  async generateFlashcards(text: string, count: number) {
    return this.withRetry(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
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
    });
  }

  // 5. Lesson Explainer
  async explainLesson(topic: string) {
    return this.withRetry(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: `اشرح لي بالتفصيل درس أو فكرة: ${topic}`,
        config: {
          systemInstruction: "أنت معلم خبير. قدم شرح مفصل ودقيق ومنسق للموضوع المطلوب باللغة العربية."
        }
      });
      return {
        text: response.text,
        sources: []
      };
    });
  }

  // 6. File Analyzer Chat
  async analyzeFileChat(fileData: string, mimeType: string, fileName: string, userPrompt: string, history: ChatMessage[] = []) {
    return this.withRetry(async (ai) => {
      const contents = history.map(msg => ({
        role: msg.role,
        parts: msg.parts
      }));

      const currentParts: any[] = [{ text: userPrompt }];
      if (contents.length === 0) {
        currentParts.unshift({ inlineData: { data: fileData, mimeType } });
      }

      contents.push({
        role: 'user',
        parts: currentParts
      });

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: contents,
        config: {
          systemInstruction: `أنت محلل بيانات أكاديمي خبير. اسم الملف المرفق هو: "${fileName}". 
          مهمتك هي الإجابة على استفسارات المستخدم بناءً على محتوى هذا الملف فقط. 
          إذا سألك المستخدم عن شيء غير موجود في الملف، أخبره بلباقة أنك تستطيع المساعدة فقط في محتوى الملف المرفق.
          تحدث دائماً باللغة العربية.`
        }
      });

      return response.text;
    });
  }

  // Live API Connection
  async connectLive(callbacks: any, dialect: Dialect = 'standard', customInstruction?: string) {
    const ai = this.getClient();
    const instruction = dialectInstructions[dialect];
    const systemInstruction = customInstruction 
      ? `${customInstruction} ${instruction}`
      : `أنت مساعد صوتي ذكي وودود. ${instruction} ساعد المستخدم في أي استفسار تعليمي بطريقة تفاعلية وسريعة.`;

    return ai.live.connect({
      model: 'gemini-1.5-flash',
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
