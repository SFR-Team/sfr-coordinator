module.exports = async (req, res) => {
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        hasToken: !!process.env.GITHUB_TOKEN
    });
};