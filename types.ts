export interface Scene {
  id: number;
  narration: string;
  visual_prompt: string;
  imageData?: string; // Base64
  audioData?: ArrayBuffer; // Raw PCM
}

export interface Story {
  id: string;
  title: string;
  introduction: string;
  scenes: Scene[];
  createdAt: number;
}

export enum VoiceName {
  Puck = 'Puck',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Charon = 'Charon',
  Aoede = 'Aoede'
}

export interface AppState {
  currentStory: Story | null;
  savedStories: Story[];
  isLoading: boolean;
  loadingStep: string;
  selectedVoice: VoiceName;
  isImmersive: boolean;
}
