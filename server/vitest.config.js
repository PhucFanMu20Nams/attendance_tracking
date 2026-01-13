import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        testTimeout: 30000,
        hookTimeout: 30000,
        setupFiles: ['./tests/setup.js'],
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true
            }
        },
        fileParallelism: false
    }
});
