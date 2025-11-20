
import React, { useState, useEffect, useRef } from 'react';
import { Story, Scene } from '../types';
import { getAudioContext, decodeAudioData } from '../services/audioUtils';
import { generateStoryVideo } from '../services/videoRecorder';
import { ChevronLeft, ChevronRight, Play, Pause, RefreshCw, Volume2, Expand, Shrink, Download, Video } from 'lucide-react';
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const currentScene = story.scenes[currentIndex];

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
      // We need to decode the stored ArrayBuffer every time we want to play
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

  const handleExportVideo = async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('准备生成视频...');
    stopAudio();

    try {
      const blob = await generateStoryVideo(story, (prog, status) => {
        setExportProgress(prog);
        setExportStatus(status);
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.title}-story.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed", error);
      alert("导出视频失败，请重试");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center ${isImmersive ? 'text-white' : 'text-slate-800'}`}>
      
      {/* Immersive Background */}
      {isImmersive && currentScene.imageData && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="fixed inset-0 z-[-1]"
        >
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10" />
           <img 
            src={`data:image/png;base64,${currentScene.imageData}`} 
            alt="bg" 
            className="w-full h-full object-cover"
           />
        </motion.div>
      )}

      {/* Header Controls */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
        <Button onClick={onBack} variant={isImmersive ? "secondary" : "ghost"} size="sm">
          <ChevronLeft size={16} />
          返回
        </Button>
        <h2 className={`text-xl font-bold drop-shadow-md ${isImmersive ? 'text-white' : 'text-slate-700'}`}>{story.title}</h2>
        <div className="flex gap-2">
          <Button 
            onClick={handleExportVideo} 
            disabled={isExporting}
            variant={isImmersive ? "secondary" : "ghost"}
            size="sm"
            className="hidden md:flex"
          >
             {isExporting ? (
               <span className="flex items-center gap-2">
                 <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                 {Math.round(exportProgress)}%
               </span>
             ) : (
               <>
                 <Video size={20} /> 导出视频
               </>
             )}
          </Button>
          <button 
            onClick={toggleImmersive}
            className={`p-2 rounded-full transition-colors ${isImmersive ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
            title="沉浸模式"
          >
            {isImmersive ? <Shrink size={20} /> : <Expand size={20} />}
          </button>
        </div>
      </div>

      {/* Main Stage */}
      <div className="w-full max-w-4xl flex flex-col items-center gap-6 p-4 z-10">
        
        {/* Image Container */}
        <div className="relative w-full aspect-video bg-slate-200 rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
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

          {/* Export Overlay */}
          {isExporting && (
             <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white">
                <Video size={48} className="mb-4 text-amber-400 animate-bounce" />
                <div className="text-xl font-bold mb-2">正在制作视频</div>
                <div className="text-sm text-slate-300 mb-6">{exportStatus}</div>
                <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-400 transition-all duration-300" 
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="mt-4 text-xs text-slate-400 max-w-xs text-center">
                  正在录制每一帧画面和语音，请稍候...
                </p>
             </div>
          )}
        </div>

        {/* Text & Audio Controls */}
        <motion.div 
          key={`text-${currentIndex}`}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`w-full p-6 rounded-3xl shadow-xl border border-white/20 backdrop-blur-md transition-colors duration-500
            ${isImmersive ? 'bg-black/40 text-white' : 'bg-white/80 text-slate-800'}`}
        >
          <div className="flex items-start gap-4">
            <button 
              onClick={togglePlay}
              className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95
                ${isPlaying ? 'bg-rose-500 text-white' : 'bg-amber-400 text-white hover:bg-amber-500'}`}
            >
              {isPlaying ? <Pause size={24} /> : <Volume2 size={24} />}
            </button>
            
            <div className="flex-1">
               <p className="text-lg md:text-xl leading-relaxed font-medium font-serif">
                 {currentScene.narration}
               </p>
            </div>
          </div>
        </motion.div>

        {/* Navigation */}
        <div className="flex gap-4 w-full justify-between">
          <Button 
            onClick={handlePrev} 
            disabled={currentIndex === 0}
            variant={isImmersive ? 'secondary' : 'secondary'}
            className={currentIndex === 0 ? 'invisible' : ''}
          >
            <ChevronLeft /> 上一页
          </Button>
          
          <Button 
            onClick={handleNext} 
            disabled={currentIndex === story.scenes.length - 1}
            variant="primary"
            className={currentIndex === story.scenes.length - 1 ? 'invisible' : ''}
          >
            下一页 <ChevronRight />
          </Button>
        </div>
        
        {/* Mobile Export Button */}
        <div className="md:hidden w-full">
           <Button 
            onClick={handleExportVideo} 
            disabled={isExporting}
            variant="ghost"
            className="w-full"
          >
             <Video size={20} /> 导出视频
          </Button>
        </div>

      </div>
    </div>
  );
};
