const fs = require('fs');
const path = require('path');

/**
 * Sets up HTTP routes for scenario and rythmo handling.
 * @param {Express} app - Express application instance
 * @param {string} scenarioDir - Path to the scenario JSON directory
 * @param {string} rythmoDir - Path to the rythmo JSON directory
 * @param {string} rootDir - Root path of the project (used for resolving public files)
 */
module.exports = function setupRoutes(app, scenarioDir, rythmoDir, rootDir) {

    /**
     * Save a JSON rythmo file.
     * Expects a JSON body, saves it to a file named :nom.json in the rythmo folder.
     */
    app.post('/rythmo/:nom.json', (req, res) => {
        const filepath = path.join(rythmoDir, `${req.params.nom}.json`);
        fs.writeFileSync(filepath, JSON.stringify(req.body, null, 2));
        res.json({ status: 'ok', saved: filepath });
    });

    /**
     * Load a JSON rythmo file.
     * If the file does not exist, returns an empty array.
     */
    app.get('/rythmo/:nom.json', (req, res) => {
        const filepath = path.join(rythmoDir, `${req.params.nom}.json`);
        if (!fs.existsSync(filepath)) return res.json([]);
        const content = fs.readFileSync(filepath, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.send(content);
    });

    /**
     * Serve the player page for a video.
     * Only accepts .mp4, .mkv, or .webm extensions.
     */
    app.get('/player/:videoname', (req, res) => {
        const file = req.params.videoname;
        const allowedExt = ['.mp4', '.mkv', '.webm'];
        if (!allowedExt.some(ext => file.endsWith(ext))) {
            return res.status(400).send('Invalid video format');
        }

        res.sendFile(path.join(rootDir, 'public', 'player.html'));
    });

    /**
     * Serve the timeline page for a video.
     * Only accepts .mp4, .mkv, or .webm extensions.
     */
    app.get('/timeline/:videoname', (req, res) => {
        const file = req.params.videoname;
        const allowedExt = ['.mp4', '.mkv', '.webm'];
        if (!allowedExt.some(ext => file.endsWith(ext))) {
            return res.status(400).send('Invalid video format');
        }

        res.sendFile(path.join(rootDir, 'public', 'timeline.html'));
    });

    /**
     * Serve the main page with scenario data injected into the HTML.
     * Reads all JSON files in scenarioDir and injects them into the <scenario> tag.
     */
    app.get('/', (req, res) => {
        const scenarioFiles = fs.readdirSync(scenarioDir).filter(f => f.endsWith('.json'));

        const scenarioData = scenarioFiles.map(filename => {
            try {
                const content = fs.readFileSync(path.join(scenarioDir, filename), 'utf-8');
                const parsed = JSON.parse(content);
                if (!parsed.id || !parsed.name || !parsed.button) return null;

                return {
                    id: parsed.id,
                    name: parsed.name,
                    button: parsed.button,
                    category: parsed.category || 'medium',
                    file: filename
                };
            } catch (err) {
                console.warn(`⚠️ Error parsing file ${filename}:`, err.message);
                return null;
            }
        }).filter(x => x !== null);

        let html = fs.readFileSync(path.join(rootDir, 'public', 'main.html'), 'utf-8');
        const injection = `<script>const mesScenarios = ${JSON.stringify(scenarioData)};</script>`;
        html = html.replace('</scenario>', `${injection}\n</scenario>`);

        res.send(html);
    });
};
