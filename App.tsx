import React, { useState, useEffect } from 'react';
import { AppState, Story, VoiceName, Scene, AspectRatio } from './types';
import { generateStoryStructure, generateSceneImage, generateVoiceover, generateRecommendedTopics } from './services/geminiService';
import { StoryPlayer } from './components/StoryPlayer';
import { Button } from './components/Button';
import { VoiceSelector } from './components/VoiceSelector';
import { BookOpen, History as HistoryIcon, Sparkles, ArrowRight, Trash2, Map, Monitor, Smartphone, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [state, setState] = useState<AppState>({
    currentStory: null,
    savedStories: [],
    isLoading: false,
    loadingStep: '',
    selectedVoice: VoiceName.Puck,
    selectedAspectRatio: '16:9',
    isImmersive: false,
  });

  const [topicInput, setTopicInput] = useState('');
  const [recommendedTopics, setRecommendedTopics] = useState<string[]>([]);
  const [isTopicsLoading, setIsTopicsLoading] = useState(false);

  const handleRefreshTopics = async () => {
    setIsTopicsLoading(true);
    try {
        const topics = await generateRecommendedTopics();
        setRecommendedTopics(topics);
    } catch (e) {
        // Fallback managed in service, but just in case
        setRecommendedTopics(['三顾茅庐', '郑和下西洋', '长城的故事', '花木兰', '后羿射日']);
    } finally {
        setIsTopicsLoading(false);
    }
  };

  // Load stories from local storage on mount and init topics
  useEffect(() => {
    handleRefreshTopics();

    const saved = localStorage.getItem('history_magic_stories');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate old stories to have a default aspect ratio if missing
        const migrated = parsed.map((s: any) => ({
            ...s,
            aspectRatio: s.aspectRatio || '16:9'
        }));
        setState(s => ({ ...s, savedStories: migrated }));
      } catch (e) {
        console.error("Failed to load stories", e);
      }
    }
  }, []);

  const saveStoryToStorage = (story: Story) => {
    const newSaved = [story, ...state.savedStories].slice(0, 2); 
    setState(s => ({ ...s, savedStories: newSaved }));
    try {
        const storiesToSave = newSaved.map(s => ({
            ...s,
            scenes: s.scenes.map(scene => ({
                ...scene,
                audioData: undefined
            }))
        }));
        localStorage.setItem('history_magic_stories', JSON.stringify(storiesToSave));
    } catch (e) {
        alert("Storage full! Old stories might be overwritten.");
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
      const structure = await generateStoryStructure(topicInput, state.selectedAspectRatio);
      
      // 1.5 Append Outro Scene
      const outroScene = {
          id: structure.scenes.length + 1,
          narration: "如果故事讲的不错，能不能给个一键三连！如果你还想听其他的历史故事，请在评论区留言告诉我们！",
          visual_prompt: "cute ending scene, theatrical curtain call, children waving goodbye, warm cozy lighting, detailed background, magical atmosphere"
      };
      structure.scenes.push(outroScene);

      setState(s => ({ ...s, loadingStep: `准备生成 ${structure.scenes.length} 个场景的素材...` }));
      
      // 2. Generate Assets
      const scenesWithAssets: Scene[] = [];
      
      for (let i = 0; i < structure.scenes.length; i++) {
        const scene = structure.scenes[i];
        
        setState(s => ({ ...s, loadingStep: `正在绘制历史场景 (${i + 1}/${structure.scenes.length})...` }));
        // Generate Image with correct Aspect Ratio
        const imageData = await generateSceneImage(scene.visual_prompt, state.selectedAspectRatio);
        
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
        createdAt: Date.now(),
        aspectRatio: state.selectedAspectRatio
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
    setState(s => ({ ...s, currentStory: story, selectedAspectRatio: story.aspectRatio }));
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
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-indigo-50 to-amber-100 p-4 sm:p-8 md:p-12 font-sans">
      
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
                <div>
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="输入历史典故..."
                    className="w-full p-5 text-lg rounded-2xl bg-slate-50 border-2 border-slate-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 outline-none transition-all placeholder:text-slate-300"
                    disabled={state.isLoading}
                  />
                  
                  {/* Sample Prompts */}
                  <div className="flex flex-wrap gap-2 mt-3 items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 py-2">热门推荐:</span>
                    <AnimatePresence mode="popLayout">
                        {recommendedTopics.length === 0 && !isTopicsLoading ? (
                             <div className="text-xs text-slate-300 px-2">加载中...</div>
                        ) : (
                            recommendedTopics.map(tag => (
                            <motion.button 
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                key={tag}
                                onClick={() => setTopicInput(tag)}
                                className="px-3 py-1.5 bg-slate-100 rounded-lg text-slate-600 font-medium text-xs hover:bg-amber-100 hover:text-amber-700 transition-colors"
                            >
                                {tag}
                            </motion.button>
                            ))
                        )}
                    </AnimatePresence>
                     <button 
                        onClick={handleRefreshTopics}
                        disabled={isTopicsLoading}
                        className={`p-2 text-slate-400 hover:text-amber-500 transition-colors rounded-full hover:bg-slate-100 ml-1 duration-500 ${isTopicsLoading ? 'animate-spin' : ''}`} 
                        title="换一批"
                    >
                        <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
                
                {/* Config Section - Vertical Stack */}
                <div className="flex flex-col gap-6 pt-2 border-t border-slate-100">
                    <VoiceSelector 
                        selected={state.selectedVoice} 
                        onSelect={(v) => setState(s => ({ ...s, selectedVoice: v }))} 
                    />
                    
                    {/* Aspect Ratio Selector */}
                    <div className="flex flex-col gap-3">
                        <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Monitor size={16} />
                            画面比例
                        </label>
                        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                            <button
                                onClick={() => setState(s => ({ ...s, selectedAspectRatio: '16:9' }))}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
                                    state.selectedAspectRatio === '16:9' 
                                    ? 'bg-white text-indigo-600 shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <Monitor size={18} /> 电脑 (16:9)
                            </button>
                            <button
                                onClick={() => setState(s => ({ ...s, selectedAspectRatio: '9:16' }))}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
                                    state.selectedAspectRatio === '9:16' 
                                    ? 'bg-white text-indigo-600 shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <Smartphone size={18} /> 手机 (9:16)
                            </button>
                        </div>
                    </div>
                </div>

                <Button 
                  onClick={handleGenerate} 
                  loading={state.isLoading} 
                  size="lg" 
                  className="w-full shadow-amber-200/50 hover:shadow-amber-300/50"
                >
                   {state.isLoading ? state.loadingStep : '开始生成动画故事'} 
                   {!state.isLoading && <Sparkles size={20} />}
                </Button>
              </div>
            </section>
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
                      className="group bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-indigo-200 relative min-h-[100px]"
                    >
                      <div className="pr-10">
                        <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors text-sm sm:text-base line-clamp-2">
                          {story.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-500 flex-shrink-0">
                              {story.aspectRatio === '9:16' ? '📱 竖屏' : '🖥️ 横屏'}
                          </span>
                          <p className="text-xs text-slate-400 truncate">
                              {new Date(story.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      {/* Delete Button - Top Right */}
                      <button 
                        onClick={(e) => handleDeleteStory(story.id, e)}
                        className="absolute top-2 right-2 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100 z-10"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>

                      {/* Play Button - Bottom Right */}
                      <div className="absolute bottom-4 right-4 bg-indigo-50 p-2 rounded-full text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors shadow-sm">
                        <ArrowRight size={16} />
                      </div>
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