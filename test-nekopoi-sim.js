/**
 * Test simulasi nekopoi.js - cek bug/error
 */
import { getHomepageData, getCategoryPosts, getDetailNekopoi, KATEGORI_MAP } from './SEMUA_FITUR/anime/nekopoi.js';

console.log('=== TEST NEKOPOI SCRAPER ===\n');

// Test 1: Homepage data
console.log('1. Testing getHomepageData()...');
try {
    const homepage = await getHomepageData();
    console.log(`✓ Homepage: ${homepage.episodeTerbaru?.length || 0} episode`);
    if (homepage.episodeTerbaru?.[0]) {
        console.log(`  Sample: ${homepage.episodeTerbaru[0].title?.substring(0, 50)}...`);
    }
} catch (e) {
    console.error(`✗ Homepage ERROR: ${e.message}`);
    console.error(e.stack);
}

console.log('');

// Test 2: Category posts
console.log('2. Testing getCategoryPosts()...');
for (const [key, info] of Object.entries(KATEGORI_MAP)) {
    try {
        console.log(`  Testing kategori: ${info.label} (${info.slug})`);
        const posts = await getCategoryPosts(info.slug);
        console.log(`  ✓ ${info.slug}: ${posts?.length || 0} posts`);
        if (posts?.[0]) {
            console.log(`    Sample: ${posts[0].title?.substring(0, 50)}...`);
        }
    } catch (e) {
        console.error(`  ✗ ${info.slug} ERROR: ${e.message}`);
    }
}

console.log('');

// Test 3: Detail post (coba ambil URL dari homepage dulu)
console.log('3. Testing getDetailNekopoi()...');
try {
    const homepage = await getHomepageData();
    if (homepage.episodeTerbaru?.[0]?.url) {
        const testUrl = homepage.episodeTerbaru[0].url;
        console.log(`  Testing URL: ${testUrl}`);
        const detail = await getDetailNekopoi(testUrl);
        console.log(`  ✓ Detail berhasil:`);
        console.log(`    Title: ${detail.title?.substring(0, 60)}...`);
        console.log(`    Kategori: ${detail.kategori}`);
        console.log(`    Thumbnail: ${detail.thumbnail ? 'Ada' : 'Tidak ada'}`);
        console.log(`    Downloads: ${detail.downloads?.length || 0} resolusi`);
        if (detail.downloads?.[0]) {
            console.log(`    Sample DL: ${detail.downloads[0].resolusi} - ${detail.downloads[0].links?.length || 0} link`);
        }
    } else {
        console.log('  ⚠ Tidak ada URL untuk test detail');
    }
} catch (e) {
    console.error(`  ✗ Detail ERROR: ${e.message}`);
    console.error(e.stack);
}

console.log('\n=== TEST SELESAI ===');
