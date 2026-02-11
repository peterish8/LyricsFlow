/**
 * LuvLyrics - Tasks Store (Zustand)
 * Manages global background tasks for AI transcription and alignment.
 */

import { create } from 'zustand';
import { generateId } from '../utils/formatters';

export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  songId: string;
  songTitle?: string;
  type: 'magic' | 'pure-magic' | 'separation';
  status: TaskStatus;
  progress: number; // 0-1
  stage: string;
  error?: string;
  revertData?: {
    lyrics: any[]; // Song.lyrics type
    duration: number;
    dateModified: string;
  };
  dateCreated: string;
  dateCompleted?: string;
  createdAt?: number;
  completedAt?: number;
}

interface TasksState {
  tasks: Task[];
  
  // Actions
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
  clearCompletedTasks: () => void;
  cancelTask: (id: string) => void;
  getTaskBySongId: (songId: string) => Task | undefined;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],

  addTask: (task: Task) => {
    set((state) => ({
      tasks: [task, ...state.tasks],
    }));
  },

  updateTask: (id: string, updates: Partial<Task>) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      ),
    }));
  },

  removeTask: (id: string) => {
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
    }));
  },

  clearCompletedTasks: () => {
    set((state) => ({
      tasks: state.tasks.filter((task) => task.status !== 'completed'),
    }));
  },

  cancelTask: (id: string) => {
    const task = get().tasks.find(t => t.id === id);
    if (task && (task.status === 'processing' || task.status === 'queued')) {
        get().updateTask(id, { status: 'cancelled', stage: 'Cancelled by user' });
    }
  },

  getTaskBySongId: (songId: string) => {
    return get().tasks.find(t => t.songId === songId);
  }
}));
