import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Scene, Story, VoiceName, AspectRatio } from "../types";
import { decodeBase64 } from "./audioUtils";

// Initialize client
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateStoryStructure = async (topic: string, aspectRatio: AspectRatio): Promise<Omit<Story, 'id' | 'createdAt' | 'aspectRatio'>> => {
  const ai = getClient();
  
  const orientationDesc = aspectRatio === '16:9' ? "wide shot, cinematic" : "vertical, portrait mode, mobile wallpaper style";

  const prompt = `
    为5-8岁的儿童创作一个关于历史故事"${topic}"的**脱口秀风格**讲解脚本。
    
    风格要求：
    1. **脱口秀/单口相声风格**：不要用刻板的“很久很久以前”，要用第一人称“我”或者“本喵/本大王”来讲述。
    2. **幽默风趣**：加入一些**无伤大雅的现代梗**、网络流行语（如“破防了”、“真香”、“yyds”等适合孩子理解的词），让历史人物变得接地气。
    3. **互动感**：像是在对着观众演讲，多用反问句和感叹句。
    4. **情节生动**：虽然是搞笑风格，但核心历史事实要准确。
    
    结构要求：
    包含标题、一段爆笑的开场白（introduction），以及12个具体的场景。
    每个场景需要：
    - narration: 一段适合朗读的**中文**旁白，要在100字以内，口语化，带梗。
    - visual_prompt: 用于生成画面的**英文**提示词。必须包含: children's book illustration, ${aspectRatio} aspect ratio, ${orientationDesc}, vibrant colors, cute characters, 3d style, detailed background.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "The title of the story" },
          introduction: { type: Type.STRING, description: "A humorous, stand-up comedy style intro" },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER, description: "Scene sequence number" },
                narration: { type: Type.STRING, description: "Humorous talk-show style voiceover text in Chinese" },
                visual_prompt: { type: Type.STRING, description: `Image generation prompt in English, ${aspectRatio} ratio` }
              },
              required: ["id", "narration", "visual_prompt"],
              propertyOrdering: ["id", "narration", "visual_prompt"]
            }
          }
        },
        required: ["title", "introduction", "scenes"],
        propertyOrdering: ["title", "introduction", "scenes"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate story structure");
  return JSON.parse(text);
};

export const generateSceneImage = async (prompt: string, aspectRatio: AspectRatio): Promise<string> => {
  const ai = getClient();
  
  // Append ratio explicitly
  const finalPrompt = `${prompt}, ${aspectRatio} aspect ratio, cinematic lighting, high resolution`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { text: finalPrompt }
      ]
    },
    config: {
      responseModalities: [Modality.IMAGE],
    }
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (part && part.inlineData && part.inlineData.data) {
    return part.inlineData.data;
  }
  throw new Error("Failed to generate image");
};

export const generateVoiceover = async (text: string, voice: VoiceName): Promise<ArrayBuffer> => {
  const ai = getClient();
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");

  return decodeBase64(base64Audio).buffer;
};