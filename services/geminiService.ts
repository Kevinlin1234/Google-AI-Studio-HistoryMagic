import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Scene, Story, VoiceName } from "../types";
import { decodeBase64 } from "./audioUtils";

// Initialize client
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateStoryStructure = async (topic: string): Promise<Omit<Story, 'id' | 'createdAt'>> => {
  const ai = getClient();
  
  const prompt = `
    为5-8岁的儿童创作一个关于历史故事"${topic}"的绘本脚本。
    请把故事讲得更加生动、详细，情节更丰富，能吸引小朋友的注意力。
    包含标题、生动的介绍，以及12个具体的场景。
    每个场景需要一段适合朗读的详细旁白（narration），和一段用于生成画面的英文提示词（visual_prompt）。
    画面提示词要是英文的，风格是：children's book illustration, vibrant colors, cute characters, 3d style, high quality, detailed background.
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
          introduction: { type: Type.STRING, description: "A short introduction to the story" },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER, description: "Scene sequence number" },
                narration: { type: Type.STRING, description: "Detailed voiceover text for the scene in Chinese" },
                visual_prompt: { type: Type.STRING, description: "Image generation prompt in English" }
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

export const generateSceneImage = async (prompt: string): Promise<string> => {
  const ai = getClient();
  
  // Using gemini-2.5-flash-image for general image generation as per guidelines
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { text: prompt }
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

  // Convert base64 to ArrayBuffer (Uint8Array) for storage/logic, NOT decoding yet
  return decodeBase64(base64Audio).buffer;
};