import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Users, 
  Music, 
  Volume2, 
  Share2,
  Disc,
  Radio,
  Plus,
  Loader2,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Track, RoomState } from './types';

const SOCKET_URL = "https://multiplayermusic.onrender.com";

export default function App() {
  const [roomId, setRoomId] = useState('main-room');
  const [password, setPassword] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [isJoined, setIsJoined] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isInternalChange = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('room-state', (state: any) => {
      setTracks(state.tracks);
      setCurrentTrackIndex(state.trackIndex);
      setIsPlaying(state.isPlaying);
      setCurrentTime(state.currentTime);
      setUserCount(state.userCount);
      setIsJoined(true);
      setError(null);
      if (audioRef.current) {
        audioRef.current.currentTime = state.currentTime;
      }
    });

    socketRef.current.on('join-error', ({ message }: { message: string }) => {
      setError(message);
      setIsJoined(false);
    });

    socketRef.current.on('sync-playback', ({ isPlaying, currentTime }: { isPlaying: boolean, currentTime: number }) => {
      isInternalChange.current = true;
      setIsPlaying(isPlaying);
      if (Math.abs((audioRef.current?.currentTime || 0) - currentTime) > 1) {
        if (audioRef.current) audioRef.current.currentTime = currentTime;
      }
    });

    socketRef.current.on('track-changed', ({ trackIndex }: { trackIndex: number }) => {
      setCurrentTrackIndex(trackIndex);
      setIsPlaying(true);
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
    });

    socketRef.current.on('sync-seek', ({ currentTime }: { currentTime: number }) => {
      if (audioRef.current) audioRef.current.currentTime = currentTime;
      setCurrentTime(currentTime);
    });

    socketRef.current.on('new-track-added', ({ tracks }: { tracks: Track[] }) => {
      setTracks(tracks);
    });

    socketRef.current.on('user-joined', ({ userCount }: { userCount: number }) => {
      setUserCount(userCount);
    });

    socketRef.current.on('user-left', ({ userCount }: { userCount: number }) => {
      setUserCount(userCount);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrackIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleJoin = () => {
    if (socketRef.current && roomId) {
      socketRef.current.emit('join-room', { roomId, password });
    }
  };

  const togglePlay = () => {
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);
    socketRef.current?.emit('play-pause', {
      roomId,
      isPlaying: newIsPlaying,
      currentTime: audioRef.current?.currentTime || 0
    });
  };

  const handleNext = () => {
    if (tracks.length === 0) return;
    const nextIndex = (currentTrackIndex + 1) % tracks.length;
    socketRef.current?.emit('change-track', { roomId, trackIndex: nextIndex });
  };

  const handlePrev = () => {
    if (tracks.length === 0) return;
    const prevIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    socketRef.current?.emit('change-track', { roomId, trackIndex: prevIndex });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) audioRef.current.currentTime = time;
    socketRef.current?.emit('seek', { roomId, currentTime: time });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('audio', file);
    formData.append('roomId', roomId);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ""));
    formData.append('artist', 'Local Upload');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
    } catch (err) {
      console.error(err);
      alert('Falha ao carregar música.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 text-center"
        >
          <div className="flex justify-center">
            <div className="p-4 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <Radio className="w-12 h-12 text-emerald-500" />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">Sincronia Musical</h1>
            <p className="text-zinc-400">Entre em uma sala para ouvir música com seus amigos em tempo real.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Nome da sala (ex: festa-do-joao)"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              />
              <input
                type="password"
                placeholder="Palavra-passe (opcional para novas salas)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-500 text-sm font-medium"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              onClick={handleJoin}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
            >
              Entrar na Sala
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentTrack = tracks[currentTrackIndex];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        onTimeUpdate={() => !isInternalChange.current && setCurrentTime(audioRef.current?.currentTime || 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={handleNext}
      />

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="audio/*" 
        className="hidden" 
      />

      {/* Header */}
      <header className="p-6 flex justify-between items-center max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Music className="w-5 h-5 text-black" />
          </div>
          <span className="font-bold text-xl tracking-tight">Sincronia</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-full border border-zinc-800">
            <Users className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-medium">{userCount} online</span>
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-full border border-emerald-500/20 transition-all disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span className="text-sm font-semibold">Adicionar Música</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left: Album Art */}
        <div className="relative aspect-square max-w-md mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTrack?.id}
              initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.9, rotate: 5 }}
              className="w-full h-full rounded-3xl overflow-hidden shadow-2xl shadow-emerald-500/10 border border-zinc-800"
            >
              <img 
                src={currentTrack?.cover} 
                alt={currentTrack?.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </motion.div>
          </AnimatePresence>
          
          {/* Spinning Disc Effect when playing */}
          {isPlaying && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute -bottom-4 -right-4 w-24 h-24 bg-zinc-900 rounded-full border-4 border-[#0a0a0a] flex items-center justify-center shadow-xl"
            >
              <Disc className="w-12 h-12 text-emerald-500" />
            </motion.div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="space-y-8">
          <div className="space-y-2">
            <motion.h2 
              key={currentTrack?.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-bold tracking-tight"
            >
              {currentTrack?.title || 'Nenhuma música'}
            </motion.h2>
            <motion.p 
              key={currentTrack?.artist}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl text-zinc-400"
            >
              {currentTrack?.artist || 'Adicione músicas para começar'}
            </motion.p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-xs font-mono text-zinc-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <button 
                onClick={handlePrev}
                className="p-3 hover:bg-zinc-900 rounded-full transition-colors group"
              >
                <SkipBack className="w-8 h-8 text-zinc-400 group-hover:text-white" />
              </button>
              <button 
                onClick={togglePlay}
                disabled={!currentTrack}
                className="w-20 h-20 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-xl shadow-white/10 disabled:opacity-50"
              >
                {isPlaying ? (
                  <Pause className="w-10 h-10 text-black fill-black" />
                ) : (
                  <Play className="w-10 h-10 text-black fill-black ml-1" />
                )}
              </button>
              <button 
                onClick={handleNext}
                className="p-3 hover:bg-zinc-900 rounded-full transition-colors group"
              >
                <SkipForward className="w-8 h-8 text-zinc-400 group-hover:text-white" />
              </button>
            </div>

            {/* Volume */}
            <div className="hidden sm:flex items-center gap-3 bg-zinc-900/50 p-3 rounded-2xl border border-zinc-800/50">
              <Volume2 className="w-5 h-5 text-zinc-500" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>

          {/* Playlist Preview */}
          <div className="pt-8 border-t border-zinc-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Playlist da Sala</h3>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-emerald-500 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {tracks.map((track, index) => (
                <button
                  key={track.id}
                  onClick={() => socketRef.current?.emit('change-track', { roomId, trackIndex: index })}
                  className={cn(
                    "w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left",
                    index === currentTrackIndex 
                      ? "bg-emerald-500/10 border border-emerald-500/20" 
                      : "hover:bg-zinc-900 border border-transparent"
                  )}
                >
                  <img src={track.cover} className="w-10 h-10 rounded-lg object-cover" alt="" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium truncate", index === currentTrackIndex ? "text-emerald-500" : "text-white")}>
                      {track.title}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
                  </div>
                  {index === currentTrackIndex && isPlaying && (
                    <div className="flex gap-1 items-end h-3">
                      <motion.div animate={{ height: [4, 12, 4] }} transition={{ duration: 0.5, repeat: Infinity }} className="w-1 bg-emerald-500 rounded-full" />
                      <motion.div animate={{ height: [8, 4, 8] }} transition={{ duration: 0.6, repeat: Infinity }} className="w-1 bg-emerald-500 rounded-full" />
                      <motion.div animate={{ height: [6, 10, 6] }} transition={{ duration: 0.4, repeat: Infinity }} className="w-1 bg-emerald-500 rounded-full" />
                    </div>
                  )}
                </button>
              ))}
              {tracks.length === 0 && (
                <p className="text-center py-8 text-zinc-600 text-sm italic">A playlist está vazia.</p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}</style>
    </div>
  );
}
