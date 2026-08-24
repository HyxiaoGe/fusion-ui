import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const SERIAL_PERFORMANCE_TESTS = [
  'src/components/chat/trajectory/TrajectoryStreamingPerformance.test.tsx',
  'src/lib/agent/streamEventHandlers.test.ts',
];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'parallel',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: SERIAL_PERFORMANCE_TESTS,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'serial-performance',
          include: SERIAL_PERFORMANCE_TESTS,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
