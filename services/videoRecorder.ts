
import { Story } from '../types';
import { decodeAudioData } from './audioUtils';

export const generateStoryVideo = async (
  story: Story,
  onProgress: (progress: number, status: string) => void
): Promise<Blob> => {
  // Setup Canvas
  const width = 1280;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Fill black initially
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // Setup Audio
  // Use a standard AudioContext. OfflineAudioContext is for non-realtime rendering, 
  // but MediaRecorder works best with real-time streams in most browsers.
  // However, to speed this up in the future, we might want other approaches, 
  // but for now real-time recording is the most stable cross-browser method without heavy libs.
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();
  
  // Setup Stream & Recorder
  const stream = canvas.captureStream(30); // 30 FPS
  const audioTrack = dest.stream.getAudioTracks()[0];
  if (audioTrack) {
    stream.addTrack(audioTrack);
  }
  
  const chunks: Blob[] = [];
  // Use video/webm as it has good support in MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') 
    ? 'video/webm; codecs=vp9' 
    : 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType });
  
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  try {
    // Process Scenes
    for (let i = 0; i < story.scenes.length; i++) {
      const scene = story.scenes[i];
      onProgress((i / story.scenes.length) * 100, `正在生成第 ${i + 1} 个场景...`);

      // 1. Prepare Image
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        // Add crossOrigin if needed, though base64 doesn't need it
        img.src = `data:image/png;base64,${scene.imageData}`;
      });

      // 2. Prepare Audio
      let audioDuration = 3000; // default 3s if no audio
      let source: AudioBufferSourceNode | null = null;

      if (scene.audioData) {
        // We need to decode the audio data for the specific context
        try {
          const buffer = await decodeAudioData(new Uint8Array(scene.audioData.slice(0)), audioCtx);
          audioDuration = buffer.duration * 1000;
          // Add a small buffer time for transitions
          audioDuration += 500;
          
          source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(dest);
          source.start();
        } catch (e) {
          console.error("Audio decode failed for video", e);
        }
      }

      // 3. Draw Loop for the duration of the scene
      const startTime = Date.now();
      const frameInterval = 33; // ~30fps

      while (Date.now() - startTime < audioDuration) {
        // Clear
        ctx.clearRect(0, 0, width, height);
        
        // Draw Image (contain or cover)
        // We'll do 'cover' style
        drawCoverImage(ctx, img, width, height);

        // Draw Subtitle Overlay
        drawSubtitles(ctx, scene.narration, width, height);
        
        // Wait for next frame
        await new Promise(r => setTimeout(r, frameInterval));
      }
      
      if (source) {
        try { source.stop(); } catch(e) {}
      }
    }
  } catch (err) {
    console.error("Video generation error", err);
    throw err;
  } finally {
    recorder.stop();
    audioCtx.close();
  }
  
  // Wait for stop event
  return new Promise<Blob>(resolve => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
  });
};

function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const imgRatio = img.width / img.height;
  const canvasRatio = w / h;
  let dw, dh, dx, dy;

  if (imgRatio > canvasRatio) {
    dh = h;
    dw = h * imgRatio;
    dx = (w - dw) / 2;
    dy = 0;
  } else {
    dw = w;
    dh = w / imgRatio;
    dx = 0;
    dy = (h - dh) / 2;
  }
  
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawSubtitles(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  const fontSize = 32;
  const padding = 20;
  const bottomMargin = 40;
  
  ctx.font = `bold ${fontSize}px "Nunito", "Zcool KuaiLe", sans-serif`;
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

  // Draw background for text
  const lineHeight = fontSize * 1.5;
  const totalTextHeight = lines.length * lineHeight;
  const bgHeight = totalTextHeight + (padding * 2);
  
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, h - bgHeight - bottomMargin, w, bgHeight);
  
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  lines.forEach((line, index) => {
    const y = h - bottomMargin - padding - ((lines.length - 1 - index) * lineHeight);
    ctx.fillText(line, w / 2, y);
  });
  ctx.restore();
}
