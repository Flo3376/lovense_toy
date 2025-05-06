const fs = require('fs');
const path = require('path');
module.exports = function setupRoutes(app, scenarioDir, rythmoDir,rootDir) {
    app.post('/rythmo/:nom.json', (req, res) => {
        const filepath = path.join(rythmoDir, `${req.params.nom}.json`);
        fs.writeFileSync(filepath, JSON.stringify(req.body, null, 2));
        res.json({ status: 'ok', saved: filepath });
    });

    app.get('/rythmo/:nom.json', (req, res) => {
        const filepath = path.join(rythmoDir, `${req.params.nom}.json`);
        if (!fs.existsSync(filepath)) return res.json([]);
        const content = fs.readFileSync(filepath, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.send(content);
    });

    app.get('/player/:videoname', (req, res) => {
        const file = req.params.videoname;

        // On pourrait vérifier ici que le fichier existe dans /public/videos/
        const allowedExt = ['.mp4', '.mkv', '.webm'];
        if (!allowedExt.some(ext => file.endsWith(ext))) {
            return res.status(400).send('Format de fichier non valide');
        }

        res.sendFile(path.join(rootDir, 'public', 'player.html'));
    });

    app.get('/', (req, res) => {
        const scenarioFiles = fs.readdirSync(scenarioDir).filter(f => f.endsWith('.json'));

        const scenarioData = scenarioFiles.map(filename => {
            try {
                const content = fs.readFileSync(path.join(scenarioDir, filename), 'utf-8');
                const parsed = JSON.parse(content);

                // On ne garde que si les des infos sont présente
                if (!parsed.id || !parsed.name || !parsed.button) return null;

                return {
                    id: parsed.id,
                    name: parsed.name,
                    button: parsed.button,
                    category: parsed.category || 'medium',
                    file: filename
                };
            } catch (err) {
                console.warn(`⚠️ Erreur parsing fichier ${filename} :`, err.message);
                return null;
            }
        }).filter(x => x !== null);

        // Lecture HTML et injection à la balise <scenario>
        let html = fs.readFileSync(path.join(rootDir, 'public', 'main.html'), 'utf-8');
        const injection = `<script>const mesScenarios = ${JSON.stringify(scenarioData)};</script>`;
        html = html.replace('</scenario>', `${injection}\n</scenario>`);

        res.send(html);
    });
}