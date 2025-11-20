
import React, { useState, useEffect, useRef } from 'react';
import { Story, Scene } from '../types';
import { getAudioContext, decodeAudioData } from '../services/audioUtils';
import { generateStoryVideo } from '../services/videoRecorder';
import { ChevronLeft, ChevronRight, Play, Pause, RefreshCw, Volume2, Expand, Shrink, Download, Video, Share2, CheckCircle } from 'lucide-react';
import { Button } from './Button';
import { motion, AnimatePresence } from 'framer-motion';

interface StoryPlayerProps {
  story: Story;
  onBack: () => void;
  isImmersive: boolean;
  toggleImmersive: () => void;
}

export const StoryPlayer: React.FC<StoryPlayerProps> = ({ story, onBack, isImmersive, toggleImmersive }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [publishedPlatform, setPublishedPlatform] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const currentScene = story.scenes[currentIndex];

  const isVertical = story.aspectRatio === '9:16';

  // Initialize Audio Context
  useEffect(() => {
    audioContextRef.current = getAudioContext();
    return () => {
      stopAudio();
    };
  }, []);

  // Stop audio when changing scenes
  useEffect(() => {
    stopAudio();
    setIsPlaying(false);
  }, [currentIndex]);

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
  };

  const playAudio = async () => {
    if (!currentScene.audioData || !audioContextRef.current) return;

    // Ensure context is running (browser policy)
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    stopAudio();

    try {
      const audioDataCopy = currentScene.audioData.slice(0);
      
      const audioBuffer = await decodeAudioData(
        new Uint8Array(audioDataCopy),
        audioContextRef.current
      );

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => setIsPlaying(false);
      
      sourceNodeRef.current = source;
      source.start();
      setIsPlaying(true);
    } catch (error) {
      console.error("Error playing audio", error);
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
      setIsPlaying(false);
    } else {
      playAudio();
    }
  };

  const handleNext = () => {
    if (currentIndex < story.scenes.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleExportVideo = async (targetPlatform?: string) => {
    if (isExporting) return;
    
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('准备生成视频...');
    setShowShareMenu(false);
    setPublishedPlatform(null);
    stopAudio();

    try {
      const blob = await generateStoryVideo(story, (prog, status) => {
        setExportProgress(prog);
        setExportStatus(status);
      });

      // Download logic
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.title}-${story.aspectRatio === '9:16' ? 'mobile' : 'desktop'}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (targetPlatform) {
          setPublishedPlatform(targetPlatform);
      }

    } catch (error) {
      console.error("Export failed", error);
      alert("导出视频失败，请重试");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`relative w-full h-full min-h-screen flex flex-col items-center justify-center ${isImmersive ? 'text-white bg-black' : 'text-slate-800 bg-slate-100'}`}>
      
      {/* Immersive Background */}
      {isImmersive && currentScene.imageData && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="fixed inset-0 z-0"
        >
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10" />
           <img 
            src={`data:image/png;base64,${currentScene.imageData}`} 
            alt="bg" 
            className="w-full h-full object-cover filter blur-lg scale-110"
           />
        </motion.div>
      )}

      {/* Header Controls */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
        <Button onClick={onBack} variant={isImmersive ? "secondary" : "ghost"} size="sm">
          <ChevronLeft size={16} />
          返回
        </Button>
        <h2 className={`text-xl font-bold drop-shadow-md hidden md:block ${isImmersive ? 'text-white' : 'text-slate-700'}`}>{story.title}</h2>
        <div className="flex gap-2 relative">
          <div className="relative">
            <Button 
                onClick={() => setShowShareMenu(!showShareMenu)} 
                disabled={isExporting}
                variant={isImmersive ? "secondary" : "ghost"}
                size="sm"
            >
                <Share2 size={18} /> 发布
            </Button>

            {/* Dropdown Menu for Share */}
            <AnimatePresence>
                {showShareMenu && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute right-0 top-12 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-100 p-2 min-w-[200px] z-50 overflow-hidden"
                    >
                         <div className="text-xs font-bold text-slate-400 px-3 py-2">一键发布 (生成视频)</div>
                         <button 
                            onClick={() => handleExportVideo('抖音')}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-sm font-medium"
                         >
                            <span className="w-5 h-5 bg-black text-white rounded-full flex items-center justify-center text-[10px]">🎵</span>
                            发布到抖音
                         </button>
                         <button 
                            onClick={() => handleExportVideo('小红书')}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-sm font-medium"
                         >
                            <span className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]">📕</span>
                            发布到小红书
                         </button>
                         <div className="h-px bg-slate-100 my-1"></div>
                         <button 
                            onClick={() => handleExportVideo()}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg flex items-center gap-2 text-sm text-slate-600"
                         >
                            <Download size={14} />
                            仅下载视频
                         </button>
                    </motion.div>
                )}
            </AnimatePresence>
          </div>

          <button 
            onClick={toggleImmersive}
            className={`p-2 rounded-full transition-colors ${isImmersive ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
            title="沉浸模式"
          >
            {isImmersive ? <Shrink size={20} /> : <Expand size={20} />}
          </button>
        </div>
      </div>

      {/* Published Success Modal */}
      <AnimatePresence>
        {publishedPlatform && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
            >
                <div className="bg-white p-6 rounded-2xl shadow-2xl border-2 border-green-500 flex flex-col items-center gap-4 pointer-events-auto">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                        <CheckCircle size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">视频已生成!</h3>
                    <p className="text-slate-500 text-center max-w-xs">
                        视频已保存到你的设备。你可以直接打开 
                        <strong className="text-slate-800 mx-1">{publishedPlatform}</strong> 
                        上传刚刚下载的视频。
                    </p>
                    <Button onClick={() => setPublishedPlatform(null)} size="sm">我知道了</Button>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Main Stage */}
      <div className={`flex flex-col items-center gap-6 p-4 z-10 w-full ${isVertical ? 'max-w-md h-[85vh]' : 'max-w-5xl'}`}>
        
        {/* Image Container */}
        <div 
            className={`relative w-full bg-slate-200 rounded-3xl overflow-hidden shadow-2xl border-4 border-white flex-shrink-0 transition-all
                ${isVertical ? 'aspect-[9/16] h-full max-h-[65vh]' : 'aspect-video'}
            `}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full h-full"
            >
              {currentScene.imageData ? (
                <img 
                  src={`data:image/png;base64,${currentScene.imageData}`} 
                  alt={`Scene ${currentIndex + 1}`} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="animate-pulse">正在绘制历史画面...</div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          
          {/* Scene Indicator */}
          <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm font-bold backdrop-blur-md">
            场景 {currentIndex + 1} / {story.scenes.length}
          </div>

          {/* Loading Overlay */}
          {isExporting && (
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white p-6 text-center">
                <Video size={48} className="mb-4 text-amber-400 animate-bounce" />
                <div className="text-xl font-bold mb-2">正在制作大片</div>
                <div className="text-sm text-slate-300 mb-6">{exportStatus}</div>
                <div className="w-full max-w-[200px] h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-400 transition-all duration-300" 
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="mt-4 text-xs text-slate-400">
                  AI 导演正在剪辑 {isVertical ? '竖屏' : '横屏'} 视频...
                </p>
             </div>
          )}
        </div>

        {/* Text & Audio Controls */}
        <motion.div 
          key={`text-${currentIndex}`}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`w-full p-4 md:p-6 rounded-3xl shadow-xl border border-white/20 backdrop-blur-md transition-colors duration-500
            ${isImmersive ? 'bg-black/40 text-white' : 'bg-white/80 text-slate-800'}
            flex flex-col gap-4
          `}
        >
          <div className="flex items-start gap-4">
            <button 
              onClick={togglePlay}
              className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95
                ${isPlaying ? 'bg-rose-500 text-white' : 'bg-amber-400 text-white hover:bg-amber-500'}`}
            >
              {isPlaying ? <Pause size={24} /> : <Volume2 size={24} />}
            </button>
            
            <div className="flex-1 overflow-y-auto max-h-[100px] md:max-h-none pr-2 scrollbar-thin">
               <p className="text-base md:text-xl leading-relaxed font-medium font-serif">
                 {currentScene.narration}
               </p>
            </div>
          </div>
          
          {/* Navigation */}
          <div className="flex gap-4 w-full justify-between pt-2 border-t border-slate-200/20">
            <Button 
                onClick={handlePrev} 
                disabled={currentIndex === 0}
                variant={isImmersive ? 'secondary' : 'ghost'}
                size="sm"
                className={currentIndex === 0 ? 'invisible' : ''}
            >
                <ChevronLeft size={16} /> 上一页
            </Button>
            
            <Button 
                onClick={handleNext} 
                disabled={currentIndex === story.scenes.length - 1}
                variant="primary"
                size="sm"
                className={currentIndex === story.scenes.length - 1 ? 'invisible' : ''}
            >
                下一页 <ChevronRight size={16} />
            </Button>
            </div>
        </motion.div>

      </div>
    </div>
  );
};
