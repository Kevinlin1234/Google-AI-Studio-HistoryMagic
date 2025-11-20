import React, { useState, useEffect } from 'react';
import { AppState, Story, VoiceName, Scene } from './types';
import { generateStoryStructure, generateSceneImage, generateVoiceover } from './services/geminiService';
import { StoryPlayer } from './components/StoryPlayer';
import { Button } from './components/Button';
import { VoiceSelector } from './components/VoiceSelector';
import { BookOpen, History as HistoryIcon, Sparkles, ArrowRight, Trash2, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [state, setState] = useState<AppState>({
    currentStory: null,
    savedStories: [],
    isLoading: false,
    loadingStep: '',
    selectedVoice: VoiceName.Puck,
    isImmersive: false,
  });

  const [topicInput, setTopicInput] = useState('');

  // Load stories from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('history_magic_stories');
    if (saved) {
      try {
        // We need to handle potentially large data. 
        // In a real app, use IndexedDB. LocalStorage has 5MB limit.
        // We might just store metadata and text, but for this demo we try to load it all.
        const parsed = JSON.parse(saved);
        setState(s => ({ ...s, savedStories: parsed }));
      } catch (e) {
        console.error("Failed to load stories", e);
      }
    }
  }, []);

  const saveStoryToStorage = (story: Story) => {
    // Limit to last 2 to save space because 12 scenes/images per story is heavy for LocalStorage
    const newSaved = [story, ...state.savedStories].slice(0, 2); 
    setState(s => ({ ...s, savedStories: newSaved }));
    try {
        // Remove Audio buffers before saving to JSON as they can't be stringified properly
        // We will convert array buffers to base64 string if we want to persist audio, 
        // but to save space let's strip audio and regenerate or just keep it in memory for session.
        // Actually, user asked to "save". We will try to save everything but warn if fails.
        // For the `audioData` (ArrayBuffer), we can't JSON.stringify it directly.
        // We'll skip saving audio to localStorage to avoid hitting limits instantly. Images are already heavy.
        const storiesToSave = newSaved.map(s => ({
            ...s,
            scenes: s.scenes.map(scene => ({
                ...scene,
                audioData: undefined // Don't persist audio to localStorage
            }))
        }));
        localStorage.setItem('history_magic_stories', JSON.stringify(storiesToSave));
    } catch (e) {
        alert("Storage full! Old stories might be overwritten or saving failed.");
    }
  };

  const handleDeleteStory = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSaved = state.savedStories.filter(s => s.id !== id);
      setState(s => ({ ...s, savedStories: newSaved }));
      localStorage.setItem('history_magic_stories', JSON.stringify(newSaved));
  };

  const handleGenerate = async () => {
    if (!topicInput.trim()) return;

    setState(s => ({ ...s, isLoading: true, loadingStep: '正在构思历史故事...' }));

    try {
      // 1. Generate Text Structure
      const structure = await generateStoryStructure(topicInput);
      
      setState(s => ({ ...s, loadingStep: `准备生成 ${structure.scenes.length} 个场景的素材...` }));
      
      // 2. Generate Assets for each scene sequentially to handle rate limits nicely or parallel if possible
      // We do it sequential to update progress.
      const scenesWithAssets: Scene[] = [];
      
      for (let i = 0; i < structure.scenes.length; i++) {
        const scene = structure.scenes[i];
        
        setState(s => ({ ...s, loadingStep: `正在绘制历史场景 (${i + 1}/${structure.scenes.length})...` }));
        // Generate Image
        const imageData = await generateSceneImage(scene.visual_prompt);
        
        setState(s => ({ ...s, loadingStep: `正在录制旁白 (${i + 1}/${structure.scenes.length})...` }));
        // Generate Audio
        const audioData = await generateVoiceover(scene.narration, state.selectedVoice);

        scenesWithAssets.push({
          ...scene,
          imageData,
          audioData
        });
      }

      const newStory: Story = {
        id: Date.now().toString(),
        title: structure.title,
        introduction: structure.introduction,
        scenes: scenesWithAssets,
        createdAt: Date.now()
      };

      saveStoryToStorage(newStory);
      setState(s => ({ ...s, currentStory: newStory, isLoading: false }));

    } catch (error) {
      console.error(error);
      alert("生成故事时遇到了一点小问题，请重试！");
      setState(s => ({ ...s, isLoading: false }));
    }
  };

  const playSavedStory = (story: Story) => {
    // If audio was stripped during save, we might need to re-generate or play without audio.
    // For this demo, we assume if it's missing, it just won't play or we could offer a "regenerate audio" button.
    // We'll just open it.
    setState(s => ({ ...s, currentStory: story }));
  };

  // ---------------- RENDER ----------------

  if (state.currentStory) {
    return (
      <StoryPlayer 
        story={state.currentStory} 
        onBack={() => setState(s => ({ ...s, currentStory: null, isImmersive: false }))}
        isImmersive={state.isImmersive}
        toggleImmersive={() => setState(s => ({ ...s, isImmersive: !s.isImmersive }))}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-indigo-50 to-amber-100 p-6 md:p-12 font-sans">
      
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-400 rounded-2xl shadow-lg text-white">
               <HistoryIcon size={32} />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">
              HistoryMagic <span className="text-amber-500">时光机</span>
            </h1>
          </div>
          <div className="hidden md:block text-slate-500 font-medium">
            探索历史的奇妙旅程
          </div>
        </header>

        <div className="grid md:grid-cols-12 gap-8">
          
          {/* Main Input Area */}
          <div className="md:col-span-7 space-y-8">
            <section className="bg-white p-8 rounded-[2rem] shadow-xl border-2 border-white/50 backdrop-blur-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Sparkles size={120} />
              </div>

              <h2 className="text-2xl font-bold text-slate-700 mb-4">你想听什么故事？</h2>
              <p className="text-slate-500 mb-6">输入一个历史事件、人物或成语，比如 "草船借箭" 或 "孔融让梨"</p>
              
              <div className="space-y-6 relative z-10">
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="输入历史典故..."
                  className="w-full p-5 text-lg rounded-2xl bg-slate-50 border-2 border-slate-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none transition-all placeholder:text-slate-300"
                  disabled={state.isLoading}
                />

                <VoiceSelector 
                  selected={state.selectedVoice} 
                  onSelect={(v) => setState(s => ({ ...s, selectedVoice: v }))} 
                />

                <Button 
                  onClick={handleGenerate} 
                  loading={state.isLoading} 
                  size="lg" 
                  className="w-full"
                >
                   {state.isLoading ? state.loadingStep : '开始生成动画故事'} 
                   {!state.isLoading && <Sparkles size={20} />}
                </Button>
              </div>
            </section>

             {/* Sample Prompts */}
             <div className="flex flex-wrap gap-3">
                {['三顾茅庐', '郑和下西洋', '长城的故事', '花木兰'].map(tag => (
                  <button 
                    key={tag}
                    onClick={() => setTopicInput(tag)}
                    className="px-4 py-2 bg-white rounded-full text-slate-600 font-semibold shadow-sm hover:bg-amber-50 hover:text-amber-600 transition-colors text-sm"
                  >
                    {tag}
                  </button>
                ))}
             </div>
          </div>

          {/* Sidebar: Saved Stories */}
          <div className="md:col-span-5">
            <div className="bg-white/60 p-6 rounded-[2rem] h-full min-h-[400px] border border-white shadow-lg">
              <h3 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-2">
                <BookOpen className="text-indigo-500" />
                我的故事书
              </h3>
              
              <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2">
                {state.savedStories.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-4">
                    <Map size={48} className="opacity-50" />
                    <p>还没有生成过故事哦<br/>快去创造第一个吧！</p>
                  </div>
                ) : (
                  state.savedStories.map(story => (
                    <div 
                      key={story.id} 
                      onClick={() => playSavedStory(story)}
                      className="group bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-indigo-200 relative"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                            {story.title}
                          </h4>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(story.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="bg-indigo-50 p-2 rounded-full text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                          <ArrowRight size={16} />
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteStory(story.id, e)}
                        className="absolute bottom-4 right-4 p-2 text-slate-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}