
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getCachedData = <T>(key: string): T | null => {
  const saved = localStorage.getItem(`cache_${key}`);
  return saved ? JSON.parse(saved) : null;
};

const setCachedData = <T>(key: string, data: T) => {
  localStorage.setItem(`cache_${key}`, JSON.stringify(data));
};

export const generateQuestionsFromContent = async (lessonId: number, content: string, forceNew: boolean = false): Promise<Question[]> => {
  const cacheKey = `questions_lesson_${lessonId}`;
  if (!forceNew) {
    const cached = getCachedData<Question[]>(cacheKey);
    if (cached) return cached;
  }

  // 为提高速度，精简了指令并使用更具体的结构。强调多出选择题，只保留一题大题。
  const prompt = `
    你现在是广州中考/高考历史命题专家。基于以下考点，极速生成一套模拟试卷。
    要求：
    1. 结构：10道单项选择题 + 1道史料分析大题。
    2. 选择题必须随机且干扰项具有迷惑性。
    3. 史料分析题包含"material"史料原文，且必须提供"hint"：包含3个背诵金句或解题关键词，用于学生记忆。
    4. 响应必须极快，直接返回JSON。

    考点：${content}
    随机指纹：${Date.now()}
    
    JSON格式：[{id, type, stem, material?, options?, answer, analysis, hint}]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // 降低思考预算以获得更快的响应速度
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "choice or material" }, 
              stem: { type: Type.STRING },
              material: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { type: Type.STRING },
              analysis: { type: Type.STRING },
              hint: { type: Type.STRING, description: "Memorization points for material question" }
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
  } catch (e) {
    console.error("AI Question Generation Error", e);
    return [];
  }
};

export const generateStudyMindmap = async (lessonId: number, content: string) => {
  const cacheKey = `mindmap_lesson_${lessonId}`;
  const cached = getCachedData<string>(cacheKey);
  if (cached) return cached;

  const prompt = `
    将内容转化为逻辑链：[背景] -> [核心事件] -> [影响]。帮助学生理解历史因果。
    
    内容：${content}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
       systemInstruction: "你是一个极其简洁的历史学者，使用Markdown列表，每行一个因果链。"
    }
  });

  const result = response.text || '';
  setCachedData(cacheKey, result);
  return result;
};

export const searchGuangzhouExamTrends = async () => {
  const cacheKey = 'exam_trends';
  const cached = getCachedData<{text: string, links: any[]}>(cacheKey);
  const lastUpdate = localStorage.getItem('trends_timestamp');
  if (cached && lastUpdate && (Date.now() - parseInt(lastUpdate)) < 3600000) return cached;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: "搜索广州南沙高一历史期末考试范围与历年真题动态。",
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const result = {
    text: response.text || '',
    links: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title,
      uri: chunk.web?.uri
    })).filter((c: any) => c.title && c.uri) || []
  };
  
  setCachedData(cacheKey, result);
  localStorage.setItem('trends_timestamp', Date.now().toString());
  return result;
};
