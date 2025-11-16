// ============================================
// SFR Mirror Coordinator - Complete System
// ============================================
const express = require('express');
const axios = require('axios');
const app = express();

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    modName: 'Sonic Frontiers Revisited',
    modId: 'sfr',
    
    sources: [
        {
            name: 'GitHub',
            type: 'github',
            url: 'https://api.github.com/repos/SFR-Team/sonic-frontiers-revisited-mod-files/releases/latest',
            priority: 1,
            enabled: true
        },
        {
            name: 'Mediafire',
            type: 'mediafire',
            metadataUrl: 'https://sfr-team.github.io/sfr-metadata/sfr-mediafire-metadata.json',
            priority: 2,
            enabled: false
        }
    ],
    
    sourceTimeout: 5000,
    cacheDuration: 300,
    port: 3000
};

// ============================================
// CACHING SYSTEM
// ============================================

let cache = {
    data: null,
    timestamp: null,
    source: null
};

function isCacheValid() {
    if (!cache.data || !cache.timestamp) return false;
    const age = (Date.now() - cache.timestamp) / 1000;
    return age < CONFIG.cacheDuration;
}

// ============================================
// SOURCE HANDLERS
// ============================================

async function fetchGitHub(source) {
    try {
        const response = await axios.get(source.url, {
            timeout: CONFIG.sourceTimeout,
            headers: {
                'User-Agent': 'SFR-Mirror-Coordinator',
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        const data = response.data;
        
        const mainAsset = data.assets.find(asset => 
            asset.name.toLowerCase().endsWith('.zip') ||
            asset.name.toLowerCase().includes('sfr')
        );
        
        if (!mainAsset) {
            throw new Error('No valid mod file found in GitHub release');
        }
        
        return {
            success: true,
            version: data.tag_name.replace('v', ''),
            downloadUrl: mainAsset.browser_download_url,
            fileSize: mainAsset.size,
            changelog: data.body || 'No changelog provided',
            releaseDate: data.published_at,
            source: 'GitHub'
        };
    } catch (error) {
        console.error(`GitHub fetch failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function fetchMediafire(source) {
    try {
        const response = await axios.get(source.metadataUrl, {
            timeout: CONFIG.sourceTimeout
        });
        
        const metadata = response.data;
        
        return {
            success: true,
            version: metadata.version,
            downloadUrl: metadata.downloadUrl,
            fileSize: metadata.fileSize,
            changelog: metadata.changelog || 'No changelog',
            releaseDate: metadata.releaseDate,
            source: 'Mediafire'
        };
    } catch (error) {
        console.error(`Mediafire fetch failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ============================================
// MAIN COORDINATOR LOGIC
// ============================================

async function fetchFromSource(source) {
    console.log(`Attempting to fetch from ${source.name}...`);
    
    switch (source.type) {
        case 'github':
            return await fetchGitHub(source);
        case 'mediafire':
            return await fetchMediafire(source);
        default:
            return { success: false, error: 'Unknown source type' };
    }
}

async function getLatestUpdate() {
    if (isCacheValid()) {
        console.log('Returning cached data');
        return cache.data;
    }
    
    const enabledSources = CONFIG.sources
        .filter(s => s.enabled)
        .sort((a, b) => a.priority - b.priority);
    
    for (const source of enabledSources) {
        const result = await fetchFromSource(source);
        
        if (result.success) {
            console.log(`✓ Successfully fetched from ${source.name}`);
            
            const normalized = {
                version: result.version,
                url: result.downloadUrl,
                changelog: result.changelog,
                size: result.fileSize,
                date: new Date(result.releaseDate).toISOString(),
                source: result.source
            };
            
            cache.data = normalized;
            cache.timestamp = Date.now();
            cache.source = source.name;
            
            return normalized;
        } else {
            console.log(`✗ ${source.name} failed: ${result.error}`);
        }
    }
    
    throw new Error('All update sources are currently unavailable');
}

// ============================================
// API ENDPOINTS
// ============================================

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.get('/latest', async (req, res) => {
    try {
        console.log('Update check requested');
        const updateData = await getLatestUpdate();
        res.json(updateData);
    } catch (error) {
        console.error('All sources failed:', error);
        res.status(503).json({
            error: 'All update sources are currently unavailable',
            message: 'Please try again later or check manually on GitHub',
            details: error.message
        });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'operational',
        uptime: process.uptime(),
        cache: {
            valid: isCacheValid(),
            source: cache.source,
            age: cache.timestamp ? (Date.now() - cache.timestamp) / 1000 : null
        },
        sources: CONFIG.sources.map(s => ({
            name: s.name,
            enabled: s.enabled,
            priority: s.priority
        }))
    });
});

app.get('/clear-cache', (req, res) => {
    cache = { data: null, timestamp: null, source: null };
    res.json({ message: 'Cache cleared' });
});

app.get('/test-sources', async (req, res) => {
    const results = [];
    
    for (const source of CONFIG.sources.filter(s => s.enabled)) {
        const result = await fetchFromSource(source);
        results.push({
            name: source.name,
            success: result.success,
            data: result.success ? result : { error: result.error }
        });
    }
    
    res.json(results);
});

// ============================================
// SERVER START
// ============================================

app.listen(CONFIG.port, () => {
    console.log('===========================================');
    console.log('  SFR Mirror Coordinator Started');
    console.log('===========================================');
    console.log(`  Server running on port ${CONFIG.port}`);
    console.log(`  Update endpoint: http://localhost:${CONFIG.port}/latest`);
    console.log(`  Health check: http://localhost:${CONFIG.port}/health`);
    console.log('');
    console.log('  Enabled sources:');
    CONFIG.sources
        .filter(s => s.enabled)
        .sort((a, b) => a.priority - b.priority)
        .forEach(s => {
            console.log(`    ${s.priority}. ${s.name}`);
        });
    console.log('===========================================');
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});