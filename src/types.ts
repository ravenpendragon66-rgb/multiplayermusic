export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  cover: string;
}

export interface RoomState {
  trackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  userCount: number;
}
