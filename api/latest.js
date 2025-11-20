const axios = require('axios');

const CONFIG = {
    sources: [
        {
            name: 'GitHub',
            type: 'github',
            url: 'https://api.github.com/repos/SFR-Team/sonic-frontiers-revisited-mod-files/releases/latest',
            priority: 1,
            enabled: true
        }
    ],
    sourceTimeout: 5000,
    cacheDuration: 300
};

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

async function fetchGitHub(source) {
    try {
        const headers = {
            'User-Agent': 'SFR-Mirror-Coordinator',
            'Accept': 'application/vnd.github.v3+json'
        };
        
        if (process.env.GITHUB_TOKEN) {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        }
        
        const response = await axios.get(source.url, {
            timeout: CONFIG.sourceTimeout,
            headers: headers
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    try {
        if (isCacheValid()) {
            console.log('Returning cached data');
            return res.json(cache.data);
        }
        
        const result = await fetchGitHub(CONFIG.sources[0]);
        
        if (result.success) {
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
            cache.source = CONFIG.sources[0].name;
            
            return res.json(normalized);
        } else {
            return res.status(503).json({
                error: 'Update source unavailable',
                message: 'Please try again later or check manually on GitHub',
                details: result.error
            });
        }
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
};