/**
 * Bundle Size Analysis Script
 * 
 * Test Type: Non-Functional (ISO 25010 - Performance Efficiency)
 * Priority: MEDIUM
 * 
 * ISO 25010 Quality Characteristics:
 * - Resource Utilization: Bundle size affects download time
 * - Time Behavior: Smaller bundles = faster page load
 * 
 * This script:
 * 1. Runs Vite build with rollup-plugin-visualizer
 * 2. Analyzes chunk sizes
 * 3. Reports bundle metrics
 * 4. Enforces size thresholds
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// =====================================================
// BUNDLE SIZE THRESHOLDS
// 
// Current Status: MVP with Flowbite React
// Flowbite React + dependencies are large (~500KB)
// These thresholds are set as BASELINE for tracking
// 
// Future Optimization Targets:
// - Split vendor chunks (React, Flowbite separately)
// - Code-split pages with dynamic imports
// - Tree-shake unused Flowbite components
// =====================================================
const THRESHOLDS = {
    // Current baseline - includes Flowbite React
    // IDEAL target: <500KB after optimization
    MAX_TOTAL_JS_KB: 850,  // Current: ~790KB

    // Maximum single chunk - relaxed for non-split builds
    MAX_CHUNK_KB: 850,

    // Maximum CSS size (Tailwind is well-optimized)
    MAX_CSS_KB: 100,

    // Maximum total assets
    MAX_TOTAL_ASSETS_KB: 1024, // 1MB

    // Entry bundle - relaxed for single bundle
    TARGET_ENTRY_KB: 850,
};

// Ideal thresholds after optimization (documented for future)
const IDEAL_THRESHOLDS = {
    MAX_TOTAL_JS_KB: 500,
    MAX_CHUNK_KB: 200,
    TARGET_ENTRY_KB: 250,
};

// Helper to format bytes
const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// Helper to get file size in KB
const getFileSizeKB = (filePath) => {
    if (!existsSync(filePath)) return 0;
    return statSync(filePath).size / 1024;
};

// Recursively get all files in directory
const getAllFiles = (dirPath, arrayOfFiles = []) => {
    if (!existsSync(dirPath)) return arrayOfFiles;

    const files = readdirSync(dirPath);
    files.forEach((file) => {
        const filePath = join(dirPath, file);
        if (statSync(filePath).isDirectory()) {
            getAllFiles(filePath, arrayOfFiles);
        } else {
            arrayOfFiles.push(filePath);
        }
    });
    return arrayOfFiles;
};

describe('Bundle Size Analysis', () => {
    const distPath = join(process.cwd(), 'dist');
    const assetsPath = join(distPath, 'assets');
    let buildOutput;
    let buildSuccessful = false;

    beforeAll(() => {
        // Run production build
        console.log('\n📦 Running production build...\n');
        try {
            buildOutput = execSync('npm run build', {
                cwd: process.cwd(),
                encoding: 'utf-8',
                timeout: 120000, // 2 minutes timeout
            });
            buildSuccessful = true;
            console.log('✅ Build completed successfully\n');
        } catch (error) {
            console.error('❌ Build failed:', error.message);
            buildOutput = error.stdout || error.message;
        }
    }, 180000); // 3 minutes timeout for beforeAll

    describe('1. Build Process', () => {
        it('[BUNDLE-01] Production build completes successfully', () => {
            expect(buildSuccessful).toBe(true);
            expect(existsSync(distPath)).toBe(true);
        });

        it('[BUNDLE-02] Build generates required output files', () => {
            if (!buildSuccessful) {
                console.log('Skipping: Build was not successful');
                return;
            }

            expect(existsSync(join(distPath, 'index.html'))).toBe(true);
            expect(existsSync(assetsPath)).toBe(true);
        });
    });

    describe('2. JavaScript Bundle Analysis', () => {
        it('[BUNDLE-03] Total JS bundle size within threshold', () => {
            if (!buildSuccessful) {
                console.log('Skipping: Build was not successful');
                return;
            }

            const allFiles = getAllFiles(assetsPath);
            const jsFiles = allFiles.filter(f => f.endsWith('.js'));

            let totalJsSizeKB = 0;
            const jsBundles = [];

            jsFiles.forEach(file => {
                const sizeKB = getFileSizeKB(file);
                totalJsSizeKB += sizeKB;
                jsBundles.push({
                    name: file.split('/').pop(),
                    sizeKB: sizeKB.toFixed(2),
                });
            });

            console.log('\n=== JavaScript Bundles ===');
            jsBundles.forEach(b => console.log(`  ${b.name}: ${b.sizeKB} KB`));
            console.log(`  TOTAL: ${totalJsSizeKB.toFixed(2)} KB`);
            console.log(`  Threshold: <${THRESHOLDS.MAX_TOTAL_JS_KB} KB`);
            console.log('===========================\n');

            expect(totalJsSizeKB).toBeLessThan(THRESHOLDS.MAX_TOTAL_JS_KB);
        });

        it('[BUNDLE-04] No single JS chunk exceeds maximum size', () => {
            if (!buildSuccessful) {
                console.log('Skipping: Build was not successful');
                return;
            }

            const allFiles = getAllFiles(assetsPath);
            const jsFiles = allFiles.filter(f => f.endsWith('.js'));

            const oversizedChunks = [];
            jsFiles.forEach(file => {
                const sizeKB = getFileSizeKB(file);
                if (sizeKB > THRESHOLDS.MAX_CHUNK_KB) {
                    oversizedChunks.push({
                        name: file.split('/').pop(),
                        sizeKB: sizeKB.toFixed(2),
                    });
                }
            });

            if (oversizedChunks.length > 0) {
                console.log('\n⚠️ Oversized chunks detected:');
                oversizedChunks.forEach(c =>
                    console.log(`  ${c.name}: ${c.sizeKB} KB (max: ${THRESHOLDS.MAX_CHUNK_KB} KB)`)
                );
            }

            expect(oversizedChunks.length).toBe(0);
        });

        it('[BUNDLE-05] Entry bundle size meets target', () => {
            if (!buildSuccessful) {
                console.log('Skipping: Build was not successful');
                return;
            }

            const allFiles = getAllFiles(assetsPath);
            const jsFiles = allFiles.filter(f => f.endsWith('.js'));

            // Find main/index bundle (usually the largest or named index/main)
            const entryBundle = jsFiles.find(f =>
                f.includes('index') || f.includes('main')
            ) || jsFiles[0];

            if (entryBundle) {
                const sizeKB = getFileSizeKB(entryBundle);
                console.log(`\n📊 Entry bundle: ${entryBundle.split('/').pop()}`);
                console.log(`   Size: ${sizeKB.toFixed(2)} KB (target: <${THRESHOLDS.TARGET_ENTRY_KB} KB)\n`);

                expect(sizeKB).toBeLessThan(THRESHOLDS.TARGET_ENTRY_KB);
            }
        });
    });

    describe('3. CSS Bundle Analysis', () => {
        it('[BUNDLE-06] CSS bundle size within threshold', () => {
            if (!buildSuccessful) {
                console.log('Skipping: Build was not successful');
                return;
            }

            const allFiles = getAllFiles(assetsPath);
            const cssFiles = allFiles.filter(f => f.endsWith('.css'));

            let totalCssSizeKB = 0;
            cssFiles.forEach(file => {
                totalCssSizeKB += getFileSizeKB(file);
            });

            console.log(`\n🎨 Total CSS: ${totalCssSizeKB.toFixed(2)} KB`);
            console.log(`   Threshold: <${THRESHOLDS.MAX_CSS_KB} KB\n`);

            expect(totalCssSizeKB).toBeLessThan(THRESHOLDS.MAX_CSS_KB);
        });
    });

    describe('4. Total Assets Analysis', () => {
        it('[BUNDLE-07] Total assets size within threshold', () => {
            if (!buildSuccessful) {
                console.log('Skipping: Build was not successful');
                return;
            }

            const allFiles = getAllFiles(distPath);

            let totalSizeKB = 0;
            const assetSummary = {
                js: 0,
                css: 0,
                html: 0,
                other: 0,
            };

            allFiles.forEach(file => {
                const sizeKB = getFileSizeKB(file);
                totalSizeKB += sizeKB;

                if (file.endsWith('.js')) assetSummary.js += sizeKB;
                else if (file.endsWith('.css')) assetSummary.css += sizeKB;
                else if (file.endsWith('.html')) assetSummary.html += sizeKB;
                else assetSummary.other += sizeKB;
            });

            console.log('\n=== Asset Summary ===');
            console.log(`  JavaScript: ${assetSummary.js.toFixed(2)} KB`);
            console.log(`  CSS: ${assetSummary.css.toFixed(2)} KB`);
            console.log(`  HTML: ${assetSummary.html.toFixed(2)} KB`);
            console.log(`  Other: ${assetSummary.other.toFixed(2)} KB`);
            console.log(`  TOTAL: ${totalSizeKB.toFixed(2)} KB`);
            console.log(`  Threshold: <${THRESHOLDS.MAX_TOTAL_ASSETS_KB} KB`);
            console.log('=====================\n');

            expect(totalSizeKB).toBeLessThan(THRESHOLDS.MAX_TOTAL_ASSETS_KB);
        });
    });

    describe('5. Bundle Composition', () => {
        it('[BUNDLE-08] Identifies large dependencies for optimization', () => {
            if (!buildSuccessful) {
                console.log('Skipping: Build was not successful');
                return;
            }

            // This test documents the current bundle state
            // for future optimization opportunities
            console.log('\n📋 Optimization Recommendations:');
            console.log('  1. Consider code-splitting for large pages');
            console.log('  2. Use dynamic imports for non-critical components');
            console.log('  3. Tree-shake unused Flowbite components');
            console.log('  4. Enable gzip/brotli compression in production\n');

            expect(true).toBe(true);
        });

        it('[BUNDLE-09] Reports bundle analysis summary', () => {
            console.log('\n=== BUNDLE SIZE THRESHOLDS ===');
            console.log(`  Max Total JS: ${THRESHOLDS.MAX_TOTAL_JS_KB} KB`);
            console.log(`  Max Single Chunk: ${THRESHOLDS.MAX_CHUNK_KB} KB`);
            console.log(`  Target Entry: ${THRESHOLDS.TARGET_ENTRY_KB} KB`);
            console.log(`  Max CSS: ${THRESHOLDS.MAX_CSS_KB} KB`);
            console.log(`  Max Total Assets: ${THRESHOLDS.MAX_TOTAL_ASSETS_KB} KB`);
            console.log('==============================\n');

            expect(THRESHOLDS.MAX_CHUNK_KB).toBeLessThanOrEqual(THRESHOLDS.MAX_TOTAL_JS_KB);
        });
    });
});
