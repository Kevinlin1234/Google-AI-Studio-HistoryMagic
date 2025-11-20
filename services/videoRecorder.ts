import { Story, Scene } from '../types';
import { decodeAudioData } from './audioUtils';

export const generateStoryVideo = async (
  story: Story,
  onProgress: (progress: number, status: string) => void
): Promise<Blob> => {
  
  const isVertical = story.aspectRatio === '9:16';
  const width = isVertical ? 720 : 1280;
  const height = isVertical ? 1280 : 720;
  const FPS = 60;
  const FRAME_INTERVAL = 1000 / FPS;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!; // Optimize for no alpha

  // Fill black initially
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();
  
  // Setup Stream & Recorder
  // Capture at 60FPS for smoother animation
  const stream = canvas.captureStream(FPS); 
  const audioTrack = dest.stream.getAudioTracks()[0];
  if (audioTrack) {
    stream.addTrack(audioTrack);
  }
  
  const chunks: Blob[] = [];
  const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') 
    ? 'video/webm; codecs=vp9' 
    : 'video/webm';

  // High bitrate for quality
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 }); 
  
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  try {
    // Pre-load images
    const loadedImages: HTMLImageElement[] = [];
    for (let i = 0; i < story.scenes.length; i++) {
       onProgress((i / story.scenes.length) * 10, `正在预加载资源 ${i + 1}...`);
       const img = new Image();
       await new Promise<void>((resolve) => {
         img.onload = () => resolve();
         img.onerror = () => resolve(); // Fail soft
         img.src = `data:image/png;base64,${story.scenes[i].imageData}`;
       });
       loadedImages.push(img);
    }

    // Ensure AudioContext is running
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    // Master Timeline Start
    // We use audioCtx.currentTime as the master clock for perfect sync
    
    for (let i = 0; i < story.scenes.length; i++) {
      const scene = story.scenes[i];
      const img = loadedImages[i];
      const nextImg = loadedImages[i + 1]; 

      onProgress(10 + (i / story.scenes.length) * 85, `正在录制场景 ${i + 1}...`);

      // Prepare Audio
      let audioBuffer: AudioBuffer | null = null;
      if (scene.audioData) {
        try {
          audioBuffer = await decodeAudioData(new Uint8Array(scene.audioData.slice(0)), audioCtx);
        } catch (e) {
          console.error("Audio decode failed", e);
        }
      }

      // Default duration if no audio (fallback)
      const duration = audioBuffer ? audioBuffer.duration : 3.0;
      
      // Play Audio
      let source: AudioBufferSourceNode | null = null;
      if (audioBuffer) {
          source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(dest);
          source.start();
      }

      const sceneStartTime = audioCtx.currentTime;
      
      // --- MAIN SCENE LOOP (Syncs exactly to Audio Duration) ---
      while (true) {
        const now = audioCtx.currentTime;
        const elapsed = now - sceneStartTime;
        
        if (elapsed >= duration) {
            // Stop immediately when audio ends to prevent "sound ended but animation continues"
            break;
        }

        const progress = elapsed / duration;
        
        // Animation Params
        // 1. Ken Burns (Slow zoom)
        const zoomDirection = i % 2 === 0 ? 1 : -1;
        const scaleBase = 1.1;
        const scaleVar = 0.15;
        const currentScale = zoomDirection === 1 
            ? scaleBase + (scaleVar * progress) 
            : (scaleBase + scaleVar) - (scaleVar * progress);

        // 2. Breathing Effect (Sine wave) to make it feel alive
        // Frequency: 2 full breaths per scene approx
        const breathing = Math.sin(elapsed * 2) * 0.005; 

        ctx.clearRect(0, 0, width, height);
        drawKenBurns(ctx, img, width, height, currentScale + breathing);
        
        // Text Fade In
        const textOpacity = Math.min(elapsed * 2, 1); // Fade in over 0.5s
        drawSubtitles(ctx, scene.narration, width, height, textOpacity);

        // Wait for next frame
        await new Promise(r => setTimeout(r, FRAME_INTERVAL));
      }
      
      if (source) {
        try { source.stop(); } catch(e) {}
      }

      // --- TRANSITION LOOP (Create "Animation" effect between scenes) ---
      // Only if there is a next scene
      if (nextImg) {
         const transitionDuration = 0.8; // 800ms transition
         const transStartTime = audioCtx.currentTime;
         
         while (true) {
            const now = audioCtx.currentTime;
            const tElapsed = now - transStartTime;
            const tProgress = tElapsed / transitionDuration;
            
            if (tProgress >= 1) break;

            // Ease In Out Cubic for cinematic feel
            const ease = tProgress < 0.5 
                ? 4 * tProgress * tProgress * tProgress 
                : 1 - Math.pow(-2 * tProgress + 2, 3) / 2;

            drawCinematicTransition(ctx, img, nextImg, width, height, ease, i);
            
            await new Promise(r => setTimeout(r, FRAME_INTERVAL));
         }
      }
    }

    // --- OUTRO FADE TO BLACK ---
    onProgress(99, "正在完成视频...");
    const lastImg = loadedImages[loadedImages.length - 1];
    const fadeDuration = 1.5;
    const fadeStartTime = audioCtx.currentTime;

    while (true) {
        const now = audioCtx.currentTime;
        const tElapsed = now - fadeStartTime;
        const progress = tElapsed / fadeDuration;

        if (progress >= 1) break;

        // Keep drawing last image slightly zooming
        drawKenBurns(ctx, lastImg, width, height, 1.25 + (progress * 0.05));

        // Draw black overlay
        ctx.fillStyle = `rgba(0,0,0,${progress})`;
        ctx.fillRect(0, 0, width, height);

        await new Promise(r => setTimeout(r, FRAME_INTERVAL));
    }

    // Final Black Frame
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    await new Promise(r => setTimeout(r, 200)); // Hold black for a moment

  } catch (err) {
    console.error("Video generation error", err);
    throw err;
  } finally {
    recorder.stop();
    audioCtx.close();
  }
  
  return new Promise<Blob>(resolve => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
  });
};

function drawKenBurns(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, scale: number) {
  const imgRatio = img.width / img.height;
  const canvasRatio = w / h;
  
  let renderW, renderH;
  
  if (imgRatio > canvasRatio) {
    renderH = h;
    renderW = h * imgRatio;
  } else {
    renderW = w;
    renderH = w / imgRatio;
  }

  renderW *= scale;
  renderH *= scale;

  const x = (w - renderW) / 2;
  const y = (h - renderH) / 2;

  ctx.drawImage(img, x, y, renderW, renderH);
}

function drawCinematicTransition(
    ctx: CanvasRenderingContext2D, 
    imgA: HTMLImageElement, 
    imgB: HTMLImageElement, 
    w: number, 
    h: number, 
    progress: number,
    sceneIndex: number
) {
    ctx.clearRect(0, 0, w, h);

    // Direction alternates to keep it interesting
    // Even index: Slide Left. Odd index: Slide Up?
    // Let's do a "Push" transition.
    // Current Image (A) moves OUT. Next Image (B) moves IN.
    
    const direction = 1; // -1 for left, 1 for right? 
    // Let's always push LEFT (Standard timeline flow)
    const offsetX = w * progress; 
    
    // Draw Image A (Moving Left)
    ctx.save();
    ctx.translate(-offsetX, 0);
    // Slight darken of A as it leaves
    drawKenBurns(ctx, imgA, w, h, 1.25); // Keep zoomed in
    ctx.fillStyle = `rgba(0,0,0,${progress * 0.5})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Draw Image B (Entering from Right)
    ctx.save();
    ctx.translate(w - offsetX, 0); // Start at W, end at 0
    
    // Parallax effect: Image B moves slightly slower internally or is zoomed out then in?
    // Let's just draw it normally
    drawKenBurns(ctx, imgB, w, h, 1.1); 
    
    // Shadow separation
    ctx.shadowColor = "black";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetX = -20;
    ctx.fillRect(-5, 0, 5, h); // Shadow strip
    
    ctx.restore();
}


function drawSubtitles(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, opacity: number) {
  const isVertical = h > w;
  const fontSize = isVertical ? 40 : 36;
  const padding = 24;
  const bottomMargin = isVertical ? 150 : 60;
  
  ctx.font = `900 ${fontSize}px "Zcool KuaiLe", "Nunito", sans-serif`; // Thicker font
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const maxWidth = w - (padding * 4);
  const words = text.split('');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + word).width;
    if (width < maxWidth) {
      currentLine += word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);

  const lineHeight = fontSize * 1.4;
  const totalTextHeight = lines.length * lineHeight;
  const bgHeight = totalTextHeight + (padding * 2);
  
  ctx.save();
  ctx.globalAlpha = opacity;

  // Nice rounded backdrop
  const bgY = h - bgHeight - bottomMargin;
  const bgX = padding;
  // Gradient Strip
  const gradient = ctx.createLinearGradient(0, bgY, 0, h - bottomMargin);
  gradient.addColorStop(0, 'rgba(0,0,0,0.4)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.8)');

  // Draw soft background
  ctx.fillStyle = gradient;
  // Full width fade
  ctx.fillRect(0, h - bgHeight - bottomMargin - 20, w, bgHeight + 40);

  ctx.fillStyle = '#fff';
  // Text Shadow for "Pop"
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  lines.forEach((line, index) => {
    const y = h - bottomMargin - padding - ((lines.length - 1 - index) * lineHeight);
    ctx.fillText(line, w / 2, y);
  });
  
  ctx.restore();
}