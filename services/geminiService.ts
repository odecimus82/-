
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

// 显式声明 process 变量，防止构建工具在严格模式下报错
declare var process: {
  env: {
    API_KEY: string;
  };
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getCachedData = <T>(key: string): T | null => {
  const saved = localStorage.getItem(`cache_${key}`);
  return saved ? JSON.parse(saved) : null;
};

const setCachedData = <T>(key: string, data: T) => {
  localStorage.setItem(`cache_${key}`, JSON.stringify(data));
};

// 指数退避重试包装函数
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let delay = 2000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const isQuotaError = e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED');
      if (isQuotaError && i < maxRetries - 1) {
        console.warn(`配额触发频率限制，${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw e;
    }
  }
  return fn();
}

export const generateQuestionsFromContent = async (lessonId: number, content: string, forceNew: boolean = false): Promise<Question[]> => {
  const cacheKey = `questions_lesson_${lessonId}`;
  if (!forceNew) {
    const cached = getCachedData<Question[]>(cacheKey);
    if (cached) return cached;
  }

  const prompt = `
    高一历史名师：基于以下内容生成试卷。
    要求：10道单选 + 1道材料分析。直接返回JSON，禁止前言。
    内容：${content.substring(0, 1000)}
    格式：[{id, type, stem, material?, options?, answer, analysis, hint}]
  `;

  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING }, 
              stem: { type: Type.STRING },
              material: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { type: Type.STRING },
              analysis: { type: Type.STRING },
              hint: { type: Type.STRING }
            },
            required: ["id", "type", "stem", "answer", "analysis"]
          }
        }
      }
    });

    const jsonStr = (response.text || "").trim();
    const data = JSON.parse(jsonStr || '[]');
    setCachedData(cacheKey, data);
    return data;
  });
};

export const generateStudyMindmap = async (lessonId: number, content: string) => {
  const cacheKey = `mindmap_lesson_${lessonId}`;
  const cached = getCachedData<string>(cacheKey);
  if (cached) return cached;

  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `提炼逻辑链：[背景]->[事件]->[影响]。内容：${content.substring(0, 800)}`,
      config: {
         systemInstruction: "历史专家，简洁Markdown列表。"
      }
    });
    const result = response.text || '';
    setCachedData(cacheKey, result);
    return result;
  });
};

export const searchGuangzhouExamTrends = async () => {
  const cacheKey = 'exam_trends';
  const cached = getCachedData<{text: string, links: any[]}>(cacheKey);
  if (cached) return cached;

  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "搜索广州南沙高一历史期末统考动态。",
      config: { tools: [{ googleSearch: {} }] },
    });
    const result = {
      text: response.text || '',
      links: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title,
        uri: chunk.web?.uri
      })).filter((c: any) => c.title && c.uri) || []
    };
    setCachedData(cacheKey, result);
    return result;
  });
};
